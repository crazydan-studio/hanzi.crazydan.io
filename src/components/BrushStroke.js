// ============ 笔画轮廓后端 E: 原始自研笔触（仓库最初实现） ============
// 恢复自 perfect-freehand 接入前仓库自带的 Brush.js 算法（原 computeBrushWidths
// + drawBrushStroke，参数与 commit f98f4ad 之前完全一致）:
// 逐点计算 压力×速度×起收笔锥形 的笔宽序列，再以每段 round-cap 线段的胶囊轮廓
// 渲染（与原始逐段 ctx.stroke 描边严格等价，差异仅在 fill 求并集）。
// 宽度模型（模拟毛笔/钢笔楷书）:
//   - 压力因子: 压力越大越宽 (0.4 + 0.6×p)
//   - 速度因子: 速度越快越细 (0.7 + 0.5×avgSpeed/local，三点平滑后 0.6..1.4)
//   - 头尾形状: 起笔 12% 顿笔由 1.35× 渐变回 1.0×；收笔 12% 温和出锋到 0.5×
//   - 整笔宽度序列经 5 点平滑去毛刺
// 与 AtramentStroke/PerfectStroke/StrokeMesh/SignatureStroke 同接口，
// 由 StrokeRenderer.js 按开关选用。widthPx 语义: 基准笔宽（宽度基准值）
import { BASE_WIDTH } from './Constants.js'

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

// 圆帽线段（capsule）轮廓: 与原始 drawBrushStroke 的逐段 round-cap 描边严格等价
// （描边结果 = 以该段为轴、半径 r 的胶囊; fill 多个同向子路径即求并集）
function capsulePath(path, ax, ay, bx, by, r) {
  const d = Math.hypot(bx - ax, by - ay)
  if (d <= 0) return
  const theta = Math.atan2(by - ay, bx - ax)
  const nx = Math.cos(theta + Math.PI / 2)
  const ny = Math.sin(theta + Math.PI / 2)
  // 左侧边 A→B，B 端圆帽（经运笔前方），右侧边 B→A，A 端圆帽（经笔尾）
  path.moveTo(ax + nx * r, ay + ny * r)
  path.lineTo(bx + nx * r, by + ny * r)
  path.arc(bx, by, r, theta + Math.PI / 2, theta - Math.PI / 2, true)
  path.lineTo(ax - nx * r, ay - ny * r)
  path.arc(ax, ay, r, theta - Math.PI / 2, theta + Math.PI / 2, true)
  path.closePath()
}

// 轨迹点 → 笔触轮廓 Path2D（书写/回放宿主统一入口）; opts 预留接口对齐（本后端忽略，
// 头尾锥形由宽度序列天然呈现，不区分完结态）
// 渲染: 每段以两端均值宽作 round-cap 线段（同原 drawBrushStroke 的 lineWidth），
// 单点笔画为半径 宽/2 的圆点
export function strokePath(points, widthPx, opts) {
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
  const path = new Path2D()
  const n = list.length
  if (n === 0) return path
  if (n === 1) {
    path.moveTo(list[0].x, list[0].y)
    path.arc(list[0].x, list[0].y, baseWidth / 2, 0, Math.PI * 2)
    return path
  }

  const widths = brushWidthsOf(list, baseWidth)
  for (let i = 0; i < n - 1; i++) {
    const a = list[i]
    const b = list[i + 1]
    // 该段线宽取两端均值（与原实现一致），圆帽半径 = 宽/2
    const radius = Math.max((widths[i] + widths[i + 1]) / 2 / 2, 0.25)
    capsulePath(path, a.x, a.y, b.x, b.y, radius)
  }
  return path
}
