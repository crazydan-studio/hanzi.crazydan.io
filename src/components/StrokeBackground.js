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

// 等待自带楷体可用（加载失败返回 false，由调用方显示加载/失败状态）
// 注意: 不依赖 document.fonts.check 的覆盖检测（各浏览器对 check(font, text)
// 的覆盖语义实现不一致，可能导致误判），墨迹盒测量直接以该字体进行，
// 缺字时浏览器按字形回退，测量与绘制使用同一生效字体，笔画仍与所绘字型对齐
export async function ensureKaiFont() {
  if (!document.fonts?.load) return false
  try {
    await document.fonts.load('300px "ZhongYiKaiTi"')
    return true
  } catch {
    return false
  }
}

// 楷体半透明参考字核心绘制（书写模式参考字与回放/动画背景共用）
// 背景汉字以半透明形式绘制于田字格上层，颜色适配主题
// 设计原则: 所有汉字使用【统一字号】+【固定基线】，大小与位置一致。
//   - 字号: 画布尺寸的固定比例（同一字体 em 框一致 → 所有字一样大）
//   - 基线: 用基准字符(永)测量字体级 ascent/descent，对所有字用同一条基线
//   - 垂直: 字形中心对齐画布中心（基于字体级度量，与具体字无关）
export function drawCharRef(ctx, width, height, char, color = charRefColor()) {
  if (!char) return
  const m = charMetrics(ctx, width, height, char)
  if (!m) return   // 度量异常时不绘制（异常场景，正常流程必成功）

  ctx.save()
  ctx.font = m.font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(char, width / 2, m.baselineY)
  ctx.restore()
}

// 字体级度量（统一字号 + 固定基线）: 测量值与绘制共用同一套计算，保证
// charInkBox 返回的墨迹盒与 drawCharRef 实际绘制的字型严格一致
// 度量失败时回退字体级近似值，保证测量函数始终返回结果
function charMetrics(ctx, width, height, char) {
  // 统一字号: 画布短边的 92%（留边距防溢出），所有字相同
  const fontSize = Math.round(Math.min(width, height) * 0.92)
  const font = `${fontSize}px ${KAI_FONT_FAMILY}`

  // 固定基线: 基准字符(永)的字体级度量（所有字共用）
  let ascent = 0, descent = 0
  try {
    ctx.save()
    ctx.font = font
    const ref = ctx.measureText('永')
    ascent = ref.actualBoundingBoxAscent
    descent = ref.actualBoundingBoxDescent
    ctx.restore()
  } catch { /* 忽略 */ }
  if (!ascent && !descent) {
    ascent = fontSize * 0.85   // CJK 近似: 上 85% / 下 15%
    descent = fontSize * 0.12
  }

  // 字形中心 = baseline - ascent + (ascent+descent)/2 = baseline + (descent-ascent)/2
  // 让字形中心对齐画布中心 → baseline y = 画布中心 - (descent-ascent)/2
  const baselineY = height / 2 - (descent - ascent) / 2
  return {
    font,
    fontSize,
    ascent,
    descent,
    baselineY
  }
}

// 背景汉字墨迹盒（内部坐标系像素）: { x0, y0, x1, y1, w, h }
// 以墨迹盒为笔画数据的坐标系（x 归一化按盒宽、y 按盒高）;
// 注意: actualBoundingBox* 相对 textAlign/textBaseline 的对齐点度量，
// 须与 drawCharRef 的绘制设置（center/alphabetic）保持一致。
// 缺字（字体未覆盖）时浏览器按字形回退，度量与绘制使用同一生效字体，
// 墨迹盒仍与所绘字型一致；度量异常/退化时回退统一 em 盒，保证书写可用
export function charInkBox(ctx, width, height, char) {
  const m = charMetrics(ctx, width, height, char)
  let left = 0, right = 0, ascent = 0, descent = 0
  try {
    ctx.save()
    ctx.font = m.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const tm = ctx.measureText(char)
    left = tm.actualBoundingBoxLeft ?? 0
    right = tm.actualBoundingBoxRight ?? 0
    ascent = tm.actualBoundingBoxAscent ?? 0
    descent = tm.actualBoundingBoxDescent ?? 0
    ctx.restore()
  } catch { /* 度量异常，走统一 em 盒回退 */ }
  if (!ascent && !descent) {
    ascent = m.ascent
    descent = m.descent
  }
  const x0 = width / 2 + left
  const x1 = width / 2 + right
  const y0 = m.baselineY - ascent
  const y1 = m.baselineY + descent
  const w = x1 - x0
  const h = y1 - y0
  if (w > 0 && h > 0) {
    return { x0, y0, x1, y1, w, h }
  }
  // 回退: 统一 em 盒（基准字「永」的字体级度量 + 全字身宽），
  // 保证墨迹盒始终可用（书写/回放坐标换算不依赖具体字形度量）
  const ew = m.fontSize
  const eh = m.ascent + m.descent
  return {
    x0: width / 2 - ew / 2,
    y0: m.baselineY - m.ascent,
    x1: width / 2 + ew / 2,
    y1: m.baselineY + m.descent,
    w: ew,
    h: eh
  }
}

// 田字格: 外框 + 米字格中央十字虚线（颜色适配主题色，虚线低透明度）
// 中央虚线从中心向四周发散绘制（上/下/左/右四条射线），中心留出空心
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
