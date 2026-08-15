// 田字格与汉字字型背景绘制（书写板 / 书写动画 / 笔画分解图共用）

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

// 选择能渲染该字的字体族（优先系统 SimKai，其次静态中易楷体，均缺失时回退）
export function pickCharFont(char) {
  if (document.fonts?.check) {
    // 系统自带中易楷体（SimKai）→ 优先使用
    if (document.fonts.check('100px "SimKai"', char)) {
      return '"SimKai", "楷体", "KaiTi", serif'
    }
    // 静态字体资源（ZhongYiKaiTi mini）已加载且覆盖该字 → 用之
    if (document.fonts.check('100px "ZhongYiKaiTi"', char)) {
      return '"ZhongYiKaiTi", "楷体", "KaiTi", serif'
    }
  }
  // 回退: 楷体/系统
  return '"楷体", "KaiTi", serif'
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

// 楷体半透明参考字核心绘制（书写模式参考字与回放/动画背景共用）
// 背景汉字以半透明形式绘制于田字格上层，颜色适配主题
// 设计原则: 所有汉字使用【统一字号】+【固定基线】，大小与位置一致。
//   - 字号: 画布尺寸的固定比例（同一字体 em 框一致 → 所有字一样大）
//   - 基线: 用基准字符(永)测量字体级 ascent/descent，对所有字用同一条基线
//   - 垂直: 字形中心对齐画布中心（基于字体级度量，与具体字无关）
export function drawCharRef(ctx, width, height, char, color = charRefColor()) {
  if (!char) return
  const FONT_FAMILY = pickCharFont(char)

  // 统一字号: 画布短边的 92%（留边距防溢出），所有字相同
  const fontSize = Math.round(Math.min(width, height) * 0.92)

  ctx.save()
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 固定基线: 基准字符(永)的字体级度量（所有字共用），字体缺字时用近似值
  let ascent = 0, descent = 0
  try {
    const ref = ctx.measureText('永')
    ascent = ref.actualBoundingBoxAscent
    descent = ref.actualBoundingBoxDescent
  } catch { /* 忽略 */ }
  if (!ascent && !descent) {
    ascent = fontSize * 0.85   // CJK 近似: 上 85% / 下 15%
    descent = fontSize * 0.12
  }

  // 字形中心 = baseline - ascent + (ascent+descent)/2 = baseline + (descent-ascent)/2
  // 让字形中心对齐画布中心 → baseline y = 画布中心 - (descent-ascent)/2
  const drawY = height / 2 - (descent - ascent) / 2
  ctx.fillText(char, width / 2, drawY)
  ctx.restore()
}
