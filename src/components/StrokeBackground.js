// 田字格与汉字字型背景绘制（书写板 / 书写动画 / 笔画分解图共用）
// 背景字统一使用自带的静态中易楷体（全量 ZhongYiKaiTi.woff2，不做精简），不使用系统字体，
// 保证任何设备/浏览器上字形度量（墨迹盒）完全一致；
// 楷体未加载完成时不做任何兜底渲染/测量（背景字缺省）

// 当前是否暗黑主题
export function isDark() {
  return document.documentElement?.classList.contains('dark') ?? false
}

// 背景汉字颜色（浅色实色，非半透明；适配主题: 明亮浅灰，暗黑中浅灰）
export function ziRefColor() {
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

// 楷体是否已加载可用（仅检查字体加载状态，不做覆盖检测——各浏览器对
// check(font, text) 的覆盖语义实现不一致）; 未加载时不做任何渲染/测量（无兜底，
// 避免回退字体导致的字形尺寸异常）
export function kaiFontReady() {
  try {
    return !!document.fonts?.check('100px "ZhongYiKaiTi"')
  } catch {
    return false
  }
}

// 光栅实测墨迹盒缓存（按 字号+字 缓存; 字体加载完成后清空，防回退字体度量残留）
const ziBoxCache = new Map()

// 等待自带楷体可用（加载失败返回 false，由调用方显示加载/失败状态）;
// 加载完成后清空墨迹盒缓存（此前可能以回退字体测得）
export async function ensureKaiFont() {
  if (!document.fonts?.load) return false
  try {
    await document.fonts.load('300px "ZhongYiKaiTi"')
    ziBoxCache.clear()
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
export function drawZiRef(ctx, width, height, zi, color = ziRefColor()) {
  if (!zi) return
  if (!kaiFontReady()) return   // 楷体未加载: 不做回退渲染（无兜底）
  const lay = ziBoxLayout(width, height, zi)
  if (!lay) return

  ctx.save()
  ctx.font = lay.font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(zi, lay.drawX, lay.drawY)
  ctx.restore()
}

// 背景字布局与光栅实测（统一字号 + 实测盒中心对齐）:
// 测量（离屏实际渲染扫描）与绘制共用同一几何，返回的墨迹盒
// 即为实际绘制像素的精确边界（汉字笔画书写坐标系）
// 返回 { font, drawX, drawY, box }（drawX/drawY 为绘制对齐点，box 为墨迹盒）
function ziBoxLayout(width, height, zi) {
  if (!kaiFontReady()) return null   // 楷体未加载: 不做测量（无兜底）
  // 画布尺寸无效（未布局/异常）时不做测量
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  // 统一字号: 画布短边的 92%（留边距防溢出），所有字相同
  const margin = Math.min(width, height) * 0.04   // 四周留白（画布的 4%）
  const baseSize = Math.max(1, Math.round(Math.min(width, height) * 0.92))
  const font = `${baseSize}px ${KAI_FONT_FAMILY}`

  // 光栅实测: 该字实际渲染像素的墨迹盒（相对对齐点; 无渲染像素时 null）
  const baseRel = rasterZiBoxRel(font, baseSize, zi)
  if (!baseRel) return null

  // 墨迹盒不得超出田字格且四周留白: 必要时按比例缩小字号
  // （盒尺寸异常/为零时不缩放，避免 fit 出现 NaN/Infinity）
  const maxW = width - margin * 2
  const maxH = height - margin * 2
  const fitW = baseRel.w > 0 ? maxW / baseRel.w : 1
  const fitH = baseRel.h > 0 ? maxH / baseRel.h : 1
  const fit = Math.min(1, Number.isFinite(fitW) ? fitW : 1, Number.isFinite(fitH) ? fitH : 1)
  const fontSize = Math.max(1, Math.round(baseSize * fit))
  const rel = fit < 1
    ? rasterZiBoxRel(`${fontSize}px ${KAI_FONT_FAMILY}`, fontSize, zi) ?? baseRel
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
// 与 drawZiRef 一致），按像素扫描; 结果与字号无关地缓存
// 扫描阈值: 丢弃 AA 淡边（alpha ≤ 8 视为透明），使盒贴合可见墨迹
const ALPHA_THRESHOLD = 8

function rasterZiBoxRel(font, fontSize, zi) {
  const key = `${fontSize}@${zi}`
  const cached = ziBoxCache.get(key)
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
  octx.fillText(zi, cx, cy)

  const data = octx.getImageData(0, 0, off.width, off.height).data
  let minX = off.width, minY = off.height, maxX = -1, maxY = -1
  for (let y = 0; y < off.height; y++) {
    for (let x = 0; x < off.width; x++) {
      if (data[(y * off.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
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
    r: maxX / dpr - cx,
    b: maxY / dpr - cy,
    w: (maxX - minX) / dpr,
    h: (maxY - minY) / dpr
  }
  // 合理性上限: 墨迹盒超出字身 1.3 倍（回退字体/异常渲染的特征）→ 视为无效，不缓存
  if (rel.w > fontSize * 1.3 || rel.h > fontSize * 1.3) return null
  ziBoxCache.set(key, rel)
  return rel
}

// 背景汉字墨迹盒（内部坐标系像素，汉字笔画书写坐标系）: { x0, y0, x1, y1, w, h }
// 基于光栅实测（实际渲染像素），与 drawZiRef 所绘字型严格一致;
// 保证盒不超出田字格且四周留有空白（必要时缩小字号）;
// 假定字体始终包含该字，不提供回退; 仅笔画轨迹坐标允许超出盒边界
export function ziInkBox(width, height, zi) {
  if (!zi) return null
  return ziBoxLayout(width, height, zi)?.box ?? null
}

// 调试用（仅开发模式）: 绘制背景字墨迹盒边界（光栅实测盒，即笔画坐标系的基准）
export function drawZiBoxDebug(ctx, width, height, zi) {
  const box = ziInkBox(width, height, zi)
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
