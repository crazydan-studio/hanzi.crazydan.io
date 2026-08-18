// 田字格与汉字字型背景绘制（书写板 / 书写动画 / 笔画分解图共用）
// 背景字统一使用自带的静态中易楷体（ZhongYiKaiTi_mini.woff2），不使用系统字体，
// 保证任何设备/浏览器上字形度量（墨迹盒）完全一致；
// 未加载完成或该字不被字体覆盖时不做任何兜底渲染（背景字缺省）

// 当前是否暗黑主题
export function isDark() {
  return document.documentElement?.classList.contains('dark') ?? false
}

// 背景汉字颜色（浅色实色，非半透明；适配主题: 明亮浅灰，暗黑中浅灰）
export function charRefColor() {
  return isDark() ? '#4b5563' : '#d1d5db'   // gray-600 / gray-300
}

// 已绘制笔画颜色（适配主题: 明亮黑色，暗黑近白色，确保清晰明显）
export function strokeInkColor() {
  return isDark() ? '#f9fafb' : '#000000'
}

// 画布内部坐标换算系数: 每 1 CSS 像素对应的内部单位数
// （由设备像素 canvas.width 与实测显示宽度得出，与显示尺寸/DPR 无关）
export function displayUnit(canvas, rect) {
  return rect.width > 0 ? Math.max(0.5, Math.min(8, canvas.width / rect.width)) : 1
}

// 背景字统一字体族（自带静态中易楷体，无系统字体回退）
export const KAI_FONT_FAMILY = '"ZhongYiKaiTi"'

// 光栅实测墨迹盒缓存（按 字号+字 缓存; 字体加载完成后清空，防回退字体度量残留）
const charBoxCache = new Map()

// 等待自带楷体可用（加载失败返回 false，由调用方显示加载/失败状态）;
// 加载完成后清空墨迹盒缓存（此前可能以回退字体测得）
export async function ensureKaiFont() {
  if (!document.fonts?.load) return false
  try {
    await document.fonts.load('300px "ZhongYiKaiTi"')
    charBoxCache.clear()
    return true
  } catch {
    return false
  }
}

// 楷体半透明参考字核心绘制（书写模式参考字与回放/动画背景共用）
// 背景汉字以半透明形式绘制于田字格上层，颜色适配主题
// 设计原则: 所有汉字使用【统一字号】+【光栅实测盒中心对齐】。
//   - 字号: 画布尺寸的固定比例（同一字体 em 框一致 → 所有字一样大）;
//     实测墨迹盒超出田字格时按比例缩小字号，保证盒不超出且四周留有空白
//   - 盒: 直接实际渲染该字并扫描像素（alpha>0），得到真实墨迹盒
//     （假定字体始终包含该字，不提供回退; 仅笔画轨迹坐标允许超出盒边界）
//   - 布局: 以实测墨迹盒为基准做 x/y 双向平移，使墨迹中心对齐田字格中心
//     （留出四周边距、收紧中宫中心、顺应结构重心）
export function drawCharRef(ctx, width, height, char, color = charRefColor()) {
  if (!char) return
  const lay = charBoxLayout(width, height, char)
  if (!lay) return

  ctx.save()
  ctx.font = lay.font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(char, lay.drawX, lay.drawY)
  ctx.restore()
}

// 背景字布局与光栅实测（统一字号 + 实测盒中心对齐）:
// 测量（离屏实际渲染扫描）与绘制共用同一几何，返回的墨迹盒
// 即为实际绘制像素的精确边界（汉字笔画书写坐标系）
// 返回 { font, drawX, drawY, box }（drawX/drawY 为绘制对齐点，box 为墨迹盒）
function charBoxLayout(width, height, char) {
  // 统一字号: 画布短边的 92%（留边距防溢出），所有字相同
  const margin = Math.min(width, height) * 0.04   // 四周留白（画布的 4%）
  const baseSize = Math.max(1, Math.round(Math.min(width, height) * 0.92))
  const font = `${baseSize}px ${KAI_FONT_FAMILY}`

  // 光栅实测: 该字实际渲染像素的墨迹盒（相对对齐点; 无渲染像素时 null）
  const baseRel = rasterCharBoxRel(font, baseSize, char)
  if (!baseRel) return null

  // 墨迹盒不得超出田字格且四周留白: 必要时按比例缩小字号
  const fit = Math.min(1,
    (width - margin * 2) / baseRel.w,
    (height - margin * 2) / baseRel.h)
  const fontSize = Math.max(1, Math.round(baseSize * fit))
  const rel = fit < 1
    ? rasterCharBoxRel(`${fontSize}px ${KAI_FONT_FAMILY}`, fontSize, char) ?? baseRel
    : baseRel

  // 布局: 墨迹中心对齐田字格中心（x/y 双向平移）
  const drawX = width / 2 - (rel.l + rel.r) / 2
  const drawY = height / 2 - (rel.t + rel.b) / 2
  const box = {
    x0: drawX + rel.l,
    y0: drawY + rel.t,
    x1: drawX + rel.r,
    y1: drawY + rel.b,
    w: rel.r - rel.l,
    h: rel.b - rel.t
  }
  return { font: `${fontSize}px ${KAI_FONT_FAMILY}`, drawX, drawY, box }
}

// 光栅实测墨迹盒（相对对齐点）: 离屏实际渲染（textAlign center + textBaseline middle，
// 与 drawCharRef 一致），按 alpha>0 像素扫描；结果与字号无关地缓存
function rasterCharBoxRel(font, fontSize, char) {
  const key = `${fontSize}@${char}`
  const cached = charBoxCache.get(key)
  if (cached) return cached

  const dpr = window.devicePixelRatio || 1
  const size = Math.ceil(fontSize * 2)   // 2em 画布，对齐点置于中心
  const off = document.createElement('canvas')
  off.width = size * dpr
  off.height = size * dpr
  const octx = off.getContext('2d', { willReadFrequently: true })
  if (!octx) return null
  octx.setTransform(dpr, 0, 0, dpr, 0, 0)
  octx.font = font
  octx.textAlign = 'center'
  octx.textBaseline = 'middle'
  const cx = size / 2
  const cy = size / 2
  octx.fillText(char, cx, cy)

  const data = octx.getImageData(0, 0, off.width, off.height).data
  let minX = off.width, minY = off.height, maxX = -1, maxY = -1
  for (let y = 0; y < off.height; y++) {
    for (let x = 0; x < off.width; x++) {
      if (data[(y * off.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const rel = {
    l: minX / dpr - cx,
    t: minY / dpr - cy,
    r: (maxX + 1) / dpr - cx,
    b: (maxY + 1) / dpr - cy
  }
  charBoxCache.set(key, rel)
  return rel
}

// 背景汉字墨迹盒（内部坐标系像素，汉字笔画书写坐标系）: { x0, y0, x1, y1, w, h }
// 基于光栅实测（实际渲染像素），与 drawCharRef 所绘字型严格一致;
// 保证盒不超出田字格且四周留有空白（必要时缩小字号）;
// 假定字体始终包含该字，不提供回退; 仅笔画轨迹坐标允许超出盒边界
export function charInkBox(width, height, char) {
  if (!char) return null
  return charBoxLayout(width, height, char)?.box ?? null
}

// 调试用（仅开发模式）: 绘制背景字墨迹盒边界（光栅实测盒，即笔画坐标系的基准）
export function drawCharBoxDebug(ctx, width, height, char) {
  const box = charInkBox(width, height, char)
  if (!box) return
  ctx.save()
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'   // blue-500 半透明
  ctx.lineWidth = 1.5
  ctx.strokeRect(box.x0, box.y0, box.w, box.h)
  ctx.restore()
}

// 田字格: 外框 + 米字格中央十字虚线（颜色适配主题色，虚线低透明度）// 中央虚线从中心向四周发散绘制（上/下/左/右四条射线），中心留出空心
// unit: 内部坐标单位换算系数 = 每 1 CSS 像素对应的内部单位数
//       （canvas.width / 画布显示宽度，由各宿主在绘制时实测）
// cssWidth: 画布显示宽度（CSS 像素）
// 虚线断长/间隔/空心半径均按画布显示宽度等比缩放（基准 500px 画布:
// 断长 9px / 间隔 7px / 空心半径 10px），不同尺寸的田字格稠密度保持同等比例；
// 小画布（手机端）下虚线线宽适当调细
export function drawTianZiGe(ctx, width, height, unit = 1, cssWidth = null) {
  const dark = isDark()
  // 画布相对基准尺寸(500px)的比例
  const prop = cssWidth ? Math.max(0.2, Math.min(1, cssWidth / 500)) : 1
  // 目标屏幕线宽（CSS 像素）: 外框 1.5px；虚线 1.2px（小画布调细，最低 0.7px）
  const borderW = 1.5 * unit
  const dashTarget = cssWidth ? Math.max(0.7, Math.min(1.2, (cssWidth / 500) * 1.2)) : 1.2
  const dashW = dashTarget * unit
  ctx.save()
  // 外框（红色系: 明亮深红，暗黑亮红）
  ctx.strokeStyle = dark ? '#f87171' : '#dc2626'   // red-400 / red-600
  ctx.lineWidth = borderW
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
  // 米字格中央十字: 从中心向四周发散的四条射线，中心形成空心（半径按比例缩放）
  const cx = width / 2
  const cy = height / 2
  const r = 10 * prop * unit
  ctx.setLineDash([9 * prop * unit, 7 * prop * unit])
  ctx.lineDashOffset = 0
  ctx.strokeStyle = dark ? 'rgba(252, 165, 165, 0.45)' : 'rgba(248, 113, 113, 0.5)'
  ctx.lineWidth = dashW
  // 上射线
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, 0)
  ctx.stroke()
  // 下射线
  ctx.beginPath()
  ctx.moveTo(cx, cy + r)
  ctx.lineTo(cx, height)
  ctx.stroke()
  // 左射线
  ctx.beginPath()
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(0, cy)
  ctx.stroke()
  // 右射线
  ctx.beginPath()
  ctx.moveTo(cx + r, cy)
  ctx.lineTo(width, cy)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}
