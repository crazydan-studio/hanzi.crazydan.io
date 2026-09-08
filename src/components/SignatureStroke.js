// ============ 笔画轮廓后端 C: signature_pad 算法 ============
// 按 szimek/signature_pad（MIT）的绘制算法实现（仅几何，绘制由宿主完成）:
//   1. 笔宽 = maxWidth/(速度+1)（下限 minWidth）; 速度取相邻记录点
//      距离/时间差，并按 velocityFilterWeight 指数滤波（速度越快越细）
//   2. 路径: 滑动 4 点窗口生成三次贝塞尔（相邻点对为段首尾，
//      控制点取相邻段中点与修正向量，见 Bezier/calculateControlPoints）
//   3. 渲染: 贝塞尔按 2 点/px 采样，逐点叠加半径随 t³ 插值的圆盘，
//      一次 fill 合成为变宽平滑笔迹（端点为圆帽）
// 说明: 该算法不消费压力（BasicPoint.pressure 仅透传），笔锋由速度调制;
// 与 StrokeMesh.js（自研网格）/ PerfectStroke.js（perfect-freehand）同接口，
// 由 StrokeRenderer.js 按开关选用。widthPx 语义: 基准直径（慢速时厚度≈widthPx）
import { BASE_WIDTH } from './Constants.js'

const VELOCITY_FILTER_WEIGHT = 0.7   // 速度指数滤波权重（越大越跟随瞬时速度）
const STEPS_PER_PX = 2               // 贝塞尔采样步数/px（'2' 为消除段间空隙）

// ---- 滑动窗口四点三次贝塞尔（与 signature_pad bezier.ts 一致） ----

function calcControlPoints(s1, s2, s3) {
  const m1 = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 }
  const m2 = { x: (s2.x + s3.x) / 2, y: (s2.y + s3.y) / 2 }
  const l1 = Math.hypot(s1.x - s2.x, s1.y - s2.y)
  const l2 = Math.hypot(s2.x - s3.x, s2.y - s3.y)
  const k = l1 + l2 === 0 ? 0 : l2 / (l1 + l2)
  const cm = { x: m2.x + (m1.x - m2.x) * k, y: m2.y + (m1.y - m2.y) * k }
  const tx = s2.x - cm.x
  const ty = s2.y - cm.y
  return {
    c1: { x: m1.x + tx, y: m1.y + ty },
    c2: { x: m2.x + tx, y: m2.y + ty }
  }
}

// 由 4 点窗口生成 p1→p2 的曲线段（含控制点）
function bezierFromPoints(w) {
  return {
    start: w[1],
    control1: calcControlPoints(w[1], w[2], w[3]).c1,
    control2: calcControlPoints(w[0], w[1], w[2]).c2,
    end: w[2]
  }
}

// 曲线采样点（t ∈ [0,1] 的三次贝塞尔位置）
function bezierPoint(curve, t) {
  const u = 1 - t
  const x = u * u * u * curve.start.x +
    3 * u * u * t * curve.control1.x +
    3 * u * t * t * curve.control2.x +
    t * t * t * curve.end.x
  const y = u * u * u * curve.start.y +
    3 * u * u * t * curve.control1.y +
    3 * u * t * t * curve.control2.y +
    t * t * t * curve.end.y
  return { x, y }
}

// 贝塞尔近似长度（10 段折线，同 signature_pad Bezier.length）
function bezierLength(curve) {
  let len = 0
  let px = null
  let py = null
  for (let i = 0; i <= 10; i++) {
    const p = bezierPoint(curve, i / 10)
    if (px !== null) len += Math.hypot(p.x - px, p.y - py)
    px = p.x
    py = p.y
  }
  return len
}

// 曲线段圆盘几何（同 signature_pad _drawCurve 采样; maxWidth 为全局半径上限）
function curveDisks(curve, startWidth, endWidth, maxWidth) {
  const steps = Math.max(1, Math.ceil(bezierLength(curve)) * STEPS_PER_PX)
  const widthDelta = endWidth - startWidth
  const disks = []
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const p = bezierPoint(curve, t)
    // 半径沿曲线按 t³ 渐变并钳制在上限内（同 signature_pad 的 drawSteps 采样）
    const r = Math.max(Math.min(startWidth + t * t * t * widthDelta, maxWidth), 0.1)
    disks.push({ x: p.x, y: p.y, r })
  }
  disks.push({
    x: curve.end.x,
    y: curve.end.y,
    r: Math.max(Math.min(endWidth, maxWidth), 0.1)
  })
  return disks
}

// 整条轨迹 → 圆盘序列（含首点圆点，等价 signature_pad 由窗滑动逐段生成）
export function strokeDisks(points, widthPx) {
  const maxWidth = Math.max(1, widthPx || BASE_WIDTH) / 2   // 半径上限（慢速粗至基准直径）
  const minWidth = Math.max(0.5, (widthPx || BASE_WIDTH) * 0.15)  // 半径下限（快速提笔细线）
  const dotRadius = (minWidth + maxWidth) / 2

  const list = []
  let prevX = null
  let prevY = null
  for (const p of points) {
    if (p.x === prevX && p.y === prevY) continue
    prevX = p.x
    prevY = p.y
    list.push({ x: p.x, y: p.y, pressure: p.pressure, time: p.timestamp })
  }

  const n = list.length
  if (n === 0) return []
  if (n === 1) return [{ x: list[0].x, y: list[0].y, r: dotRadius }]

  // 滑动窗口与宽度状态（同 signature_pad _lastPoints/_lastVelocity/_lastWidth）
  const win = []
  const disks = []
  let lastVelocity = 0
  let lastWidth = dotRadius

  const update = (start, end) => {
    const d = Math.hypot(end.x - start.x, end.y - start.y)
    const dt = end.time - start.time
    const velocity = dt ? d / dt : 0
    const filtered = VELOCITY_FILTER_WEIGHT * velocity +
      (1 - VELOCITY_FILTER_WEIGHT) * lastVelocity
    const newWidth = Math.max(maxWidth / (filtered + 1), minWidth)
    const curveWidths = { start: lastWidth, end: newWidth }
    lastVelocity = filtered
    lastWidth = newWidth
    return curveWidths
  }

  for (const p of list) {
    win.push(p)
    if (win.length > 2) {
      if (win.length === 3) win.unshift(win[0])   // 初始窗复制首点，减小编程滞后
      const curve = bezierFromPoints(win)
      const { start, end } = update(win[1], win[2])
      disks.push(...curveDisks(curve, start, end, maxWidth))
      win.shift()
    }
  }
  return disks
}

// 轨迹点 → 笔触轮廓 Path2D（书写/回放宿主统一入口）; opts 预留接口对齐（本后端忽略，
// 速度与圆帽天然成笔，不区分完结态）
export function strokePath(points, widthPx, opts) {
  const path = new Path2D()
  for (const d of strokeDisks(points, widthPx)) {
    path.moveTo(d.x, d.y)
    path.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  }
  return path
}
