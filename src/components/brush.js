import { BASE_WIDTH } from './constants.js'

// ============ 笔触模拟（brush stroke） ============
// 依据 压力/速度/首尾锥形 计算每点宽度，并用轮廓法（可变宽度多边形）渲染，
// 产生类似毛笔/钢笔的笔锋效果。编辑器与回放引擎共用。

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// 相邻点距离
function segDist(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

// 平均速度（像素/毫秒），兜底 1
function computeAvgSpeed(points) {
  const n = points.length
  let dist = 0
  for (let i = 1; i < n; i++) dist += segDist(points[i - 1], points[i])
  const dur = points[n - 1].timestamp - points[0].timestamp
  return dur > 0 ? dist / dur : 1
}

// 三点移动平均平滑
function smooth(arr) {
  const n = arr.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = arr[Math.max(0, i - 1)]
    const b = arr[i]
    const c = arr[Math.min(n - 1, i + 1)]
    out[i] = (a + b + c) / 3
  }
  return out
}

// 计算每个点的笔触宽度（像素）
//   pressure: 压力越大越宽  (0.4 + 0.6 * p)
//   speed:    速度越快越细  (0.7 + 0.5 * avgSpeed/localSpeed，平滑后)
//   shape:    起笔顿笔(粗) → 行笔(中) → 收笔出锋(细)，模拟毛笔楷书
export function computeBrushWidths(points, widthCoef = 1.0) {
  const n = points.length
  if (n === 0) return []
  if (n === 1) return [BASE_WIDTH * widthCoef]

  const avgSpeed = computeAvgSpeed(points)

  // 1) 压力因子
  const pressureFactor = points.map(p => 0.4 + 0.6 * (p.pressure ?? 0.5))

  // 2) 速度因子（局部速度 vs 平均速度）
  const speedFactor = new Array(n).fill(1)
  for (let i = 1; i < n - 1; i++) {
    const dt = points[i].timestamp - points[i - 1].timestamp
    const dist = segDist(points[i - 1], points[i])
    const local = dt > 0 ? dist / dt : avgSpeed
    // 慢(顿笔)→宽，快→细
    speedFactor[i] = clamp(0.7 + 0.5 * (avgSpeed / (local + 1e-6)), 0.6, 1.4)
  }
  const speedSmoothed = smooth(speedFactor)

  // 3) 起笔顿笔 + 收笔出锋（各占 12% 长度）
  const headN = Math.max(2, Math.floor(n * 0.12))
  const tailN = Math.max(2, Math.floor(n * 0.12))

  const widths = new Array(n)
  for (let i = 0; i < n; i++) {
    // 起笔: 顿笔（藏锋），由 1.35× 渐变到 1.0×（粗→正常）
    const headPos = Math.min(i / headN, 1)
    const headFactor = 1.35 - 0.35 * headPos
    // 收笔: 温和出锋，由 0.5× 渐变到 1.0×（细→正常）
    const tailPos = Math.min((n - 1 - i) / tailN, 1)
    const tailFactor = 0.5 + 0.5 * tailPos

    const inHead = i < headN
    const inTail = i >= n - tailN
    let factor = 1
    if (inHead && inTail) factor = headFactor    // 短笔画(头尾重叠): 顿笔优先(粗)
    else if (inHead) factor = headFactor
    else if (inTail) factor = tailFactor

    widths[i] = BASE_WIDTH * widthCoef * pressureFactor[i] * speedSmoothed[i] * factor
  }

  // 输出前整体 5 点平滑：减少宽度抖动造成的毛刺
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      sum += widths[j]; cnt++
    }
    out[i] = sum / cnt
  }
  return out
}

// 笔触渲染: 逐段描边 + round cap/join
// 相比轮廓法（直线连接法线偏移点）:
//  - 拐点法线突变不再产生断裂/凹陷（round join + 每段独立 path 圆帽覆盖）
//  - 起笔/收笔圆润（round lineCap）
//  - 无轮廓毛刺（canvas 圆帽自身平滑）
export function drawBrushStroke(ctx, points, widths, color) {
  const n = points.length
  if (n === 0) return
  if (n === 1) {
    // 单点: 圆点
    ctx.beginPath()
    ctx.arc(points[0].x, points[0].y, widths[0] / 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    return
  }

  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < n - 1; i++) {
    // 该段线宽取两端均值，宽度渐变更平滑
    const w = (widths[i] + widths[i + 1]) / 2
    ctx.lineWidth = Math.max(w, 0.5)
    ctx.beginPath()
    ctx.moveTo(points[i].x, points[i].y)
    ctx.lineTo(points[i + 1].x, points[i + 1].y)
    ctx.stroke()
  }
}
