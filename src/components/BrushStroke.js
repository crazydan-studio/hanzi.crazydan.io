// ============ 笔画轮廓后端 E: 原始自研笔触（仓库最初实现） ============
// 恢复自 perfect-freehand 接入前仓库自带的 Brush.js 算法（原 computeBrushWidths
// + drawBrushStroke）: 逐点计算 压力×速度×起收笔锥形 的笔宽序列，原实现以
// 逐段 round-cap 描边渲染; 本模块把同样的宽度序列渲染为“逐段圆帽线段的
// 圆盘链”填充几何（胶囊等宽逼近，一次 fill 合成），形状与原始描边一致。
// 宽度模型（模拟毛笔/钢笔楷书）:
//   - 压力因子: 压力越大越宽 (0.4 + 0.6×p)
//   - 速度因子: 速度越快越细 (0.7 + 0.5×avgSpeed/local，三点平滑后 0.6..1.4)
//   - 头尾形状: 起笔 12% 顿笔由 1.35× 渐变回 1.0×；收笔 12% 温和出锋到 0.5×
//   - 整笔宽度序列经 5 点平滑去毛刺
// 与 AtramentStroke/PerfectStroke/StrokeMesh/SignatureStroke 同接口，
// 由 StrokeRenderer.js 按开关选用。widthPx 语义: 基准笔宽（宽度基准值）
import { BASE_WIDTH } from './Constants.js'

const SEGMENT_DISK_STEP_RATIO = 0.6   // 圆帽线段采样步距 ≤ 0.6×半径（凹陷 <0.05×半径）

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function segDist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// 平均速度（像素/毫秒），兜底 1（与原实现一致，入参含 timestamp）
function computeAvgSpeed(points) {
  const n = points.length
  let dist = 0
  for (let i = 1; i < n; i++) dist += segDist(points[i - 1], points[i])
  const dur = points[n - 1].timestamp - points[0].timestamp
  return dur > 0 ? dist / dur : 1
}

// 三点移动平均
function smooth(arr) {
  const n = arr.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = (arr[Math.max(0, i - 1)] + arr[i] + arr[Math.min(n - 1, i + 1)]) / 3
  }
  return out
}

// 逐点笔宽（原 computeBrushWidths 原样移植）
function brushWidthsOf(points, baseWidth) {
  const n = points.length
  if (n === 0) return []
  if (n === 1) return [baseWidth]

  const avgSpeed = computeAvgSpeed(points)

  // 1) 压力因子（压力越大越宽）
  const pressureFactor = points.map(p => 0.4 + 0.6 * (p.pressure ?? 0.5))

  // 2) 速度因子（局部速度 vs 平均速度; 慢=顿笔→宽，快→细）
  const speedFactor = new Array(n).fill(1)
  for (let i = 1; i < n - 1; i++) {
    const dt = points[i].timestamp - points[i - 1].timestamp
    const dist = segDist(points[i - 1], points[i])
    const local = dt > 0 ? dist / dt : avgSpeed
    speedFactor[i] = clamp(0.7 + 0.5 * (avgSpeed / (local + 1e-6)), 0.6, 1.4)
  }
  const speedSmoothed = smooth(speedFactor)

  // 3) 起笔顿笔 + 收笔出锋（各占 12% 长度; 短笔画头尾重叠时顿笔优先）
  const headN = Math.max(2, Math.floor(n * 0.12))
  const tailN = Math.max(2, Math.floor(n * 0.12))
  const widths = new Array(n)
  for (let i = 0; i < n; i++) {
    const headPos = Math.min(i / headN, 1)
    const headFactor = 1.35 - 0.35 * headPos
    const tailPos = Math.min((n - 1 - i) / tailN, 1)
    const tailFactor = 0.5 + 0.5 * tailPos
    let factor = 1
    if (i < headN) factor = headFactor
    else if (i >= n - tailN) factor = tailFactor
    widths[i] = baseWidth * pressureFactor[i] * speedSmoothed[i] * factor
  }

  // 4) 整笔 5 点平滑（减少宽度抖动毛刺）
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    let cnt = 0
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      sum += widths[j]
      cnt++
    }
    out[i] = sum / cnt
  }
  return out
}

// 圆帽线段 → 圆盘链（capsule 等宽逼近，含端点圆盘）
function capsuleDisks(ax, ay, bx, by, radius, disks) {
  const d = Math.hypot(bx - ax, by - ay)
  if (d <= 0) return
  const step = Math.max(0.5, radius * SEGMENT_DISK_STEP_RATIO)
  const count = Math.max(1, Math.ceil(d / step))
  const ux = (bx - ax) / d
  const uy = (by - ay) / d
  for (let i = 1; i <= count; i++) {
    const t = i / count
    disks.push({ x: ax + ux * d * t, y: ay + uy * d * t, r: radius })
  }
}

// 整条轨迹 → 圆盘序列（每段以两端均值宽作圆帽线段，端点圆盘自然覆盖连接处）
export function strokeDisks(points, widthPx) {
  const baseWidth = Math.max(1, widthPx || BASE_WIDTH)
  const list = []
  let prevX = null
  let prevY = null
  for (const p of points) {
    if (p.x === prevX && p.y === prevY) continue
    prevX = p.x
    prevY = p.y
    list.push({ x: p.x, y: p.y, pressure: p.pressure, timestamp: p.timestamp })
  }
  const n = list.length
  if (n === 0) return []
  if (n === 1) return [{ x: list[0].x, y: list[0].y, r: baseWidth / 2 }]

  const widths = brushWidthsOf(list, baseWidth)
  const disks = [{ x: list[0].x, y: list[0].y, r: widths[0] / 2 }]
  for (let i = 0; i < n - 1; i++) {
    const a = list[i]
    const b = list[i + 1]
    // 该段线宽取两端均值（与原 drawBrushStroke 一致），圆帽半径 = 宽/2
    const radius = Math.max((widths[i] + widths[i + 1]) / 2 / 2, 0.25)
    capsuleDisks(a.x, a.y, b.x, b.y, radius, disks)
  }
  return disks
}

// 轨迹点 → 笔触轮廓 Path2D（书写/回放宿主统一入口）; opts 预留接口对齐（本后端忽略，
// 头尾锥形由宽度序列天然呈现，不区分完结态）
export function strokePath(points, widthPx, opts) {
  const path = new Path2D()
  for (const d of strokeDisks(points, widthPx)) {
    path.moveTo(d.x, d.y)
    path.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  }
  return path
}
