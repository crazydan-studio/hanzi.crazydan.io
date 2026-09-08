// ============ 笔画轮廓后端 D: atrament 算法 ============
// 按 jakubfiala/atrament（MIT，src/index.js 及其 constants）的绘制算法实现几何:
//   1. 平滑: 每段先按 smoothing 把当前点向上一处理点回拉
//      （factor = min(0.87, 0.85 + (距离-60)/3000)，距离越大越平滑）
//   2. 厚度: 未提供真实压感（pressure=0.5）时按“自适应”逐段逼近
//      target = 基准宽 + (段距-2)/98×30，步进 0.25 —— 速度变化带来粗细渐变;
//      有压感时按 pressureLow..pressureHigh(0..2) 线性放大基准宽，
//      压感值先经 0.3 低通滤波（防抬笔末端抖细）
//   3. 渲染: 每段为带 round cap 的恒定宽度线段 —— 以沿段分布的圆盘链
//      （端点+中间，步距≤0.6×半径）等价逼近，宿主一次 fill 合成
// 说明: 与 StrokeMesh/PerfectStroke/SignatureStroke 同接口，由
// StrokeRenderer.js 按开关选用; widthPx 语义: 基准线宽（直径）
import { BASE_WIDTH } from './Constants.js'

// ---- atrament 默认参数（src/constants.js） ----
const MIN_LINE_THICKNESS = 2
const LINE_THICKNESS_RANGE = 98        // 100 - 2
const THICKNESS_INCREMENT = 0.25       // 自适应厚度逐段步进
const MIN_SMOOTHING_FACTOR = 0.87
const INITIAL_SMOOTHING_FACTOR = 0.85
const WEIGHT_SPREAD = 30               // 自适应可达到的最大厚度增量
const DEFAULT_PRESSURE = 0.5
const PRESSURE_SMOOTHING = 0.3          // 压感低通滤波系数
const PRESSURE_LOW = 0                  // 压力 0 时的厚度倍率
const PRESSURE_HIGH = 2                 // 压力 1 时的厚度倍率

function scale(value, smin, smax, tmin, tmax) {
  return (value - smin) / (smax - smin) * (tmax - tmin) + tmin
}

// 平滑系数（同 atrament getSmoothingFactor）: 段距越大回拉越多（更平滑）
function smoothingFactor(dist) {
  return Math.min(
    MIN_SMOOTHING_FACTOR,
    INITIAL_SMOOTHING_FACTOR + (dist - 60) / 3000)
}

// 压感 → 厚度倍率（同 atrament #getWeightWithPressure）
function weightWithPressure(pressure, weight) {
  if (pressure === DEFAULT_PRESSURE) return weight
  if (pressure < DEFAULT_PRESSURE) {
    return weight * scale(pressure, 0, 0.5, PRESSURE_LOW, 1)
  }
  return weight * scale(pressure, 0.5, 1, 1, PRESSURE_HIGH)
}

// 沿线分布圆盘（逼近 round-cap 等宽线段; step ≤ 0.6×半径，凹陷 <0.05×半径）
function capsuleDisks(ax, ay, bx, by, radius, disks) {
  const d = Math.hypot(bx - ax, by - ay)
  if (d <= 0) return
  const step = Math.max(0.5, radius * 0.6)
  const count = Math.max(1, Math.ceil(d / step))
  const ux = (bx - ax) / d
  const uy = (by - ay) / d
  for (let i = 1; i <= count; i++) {
    const t = i / count
    disks.push({ x: ax + ux * d * t, y: ay + uy * d * t, r: radius })
  }
}

// 整条轨迹 → 圆盘序列（逐段平滑位置 + 厚度推进，同 atrament 每段 draw）
export function strokeDisks(points, widthPx) {
  const weight = Math.max(1, widthPx || BASE_WIDTH)

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
  if (n === 1) return [{ x: list[0].x, y: list[0].y, r: weight / 2 }]

  // 状态（同 atrament: beginStroke 起 thickness=weight; previousPressure=0.5）
  let px = list[0].x
  let py = list[0].y
  let thickness = weight
  let previousPressure = DEFAULT_PRESSURE
  const disks = [{ x: px, y: py, r: weight / 2 }]

  for (let i = 1; i < n; i++) {
    const cur = list[i]
    const rawDist = Math.hypot(cur.x - px, cur.y - py)
    const factor = smoothingFactor(rawDist)
    const procX = cur.x - (cur.x - px) * factor
    const procY = cur.y - (cur.y - py) * factor

    const pressure = cur.pressure ?? DEFAULT_PRESSURE
    const diff = pressure - previousPressure
    const smoothedPressure = pressure - diff * PRESSURE_SMOOTHING

    const dist = Math.hypot(procX - px, procY - py)
    if (pressure === DEFAULT_PRESSURE) {
      // 无真实压感: 自适应厚度（速度/段距变化带来粗细渐变）
      const ratio = (dist - MIN_LINE_THICKNESS) / LINE_THICKNESS_RANGE
      const target = ratio * (weight + WEIGHT_SPREAD - weight) + weight
      const delta = target - thickness
      if (Math.abs(delta) <= THICKNESS_INCREMENT) {
        thickness = target
      } else if (delta > 0) {
        thickness += THICKNESS_INCREMENT
      } else {
        thickness -= THICKNESS_INCREMENT
      }
    } else {
      thickness = weightWithPressure(smoothedPressure, weight)
    }

    capsuleDisks(px, py, procX, procY, Math.max(thickness / 2, 0.25), disks)

    px = procX
    py = procY
    previousPressure = pressure
  }
  return disks
}

// 轨迹点 → 笔触轮廓 Path2D（书写/回放宿主统一入口）; opts 预留接口对齐（本后端忽略）
export function strokePath(points, widthPx, opts) {
  const path = new Path2D()
  for (const d of strokeDisks(points, widthPx)) {
    path.moveTo(d.x, d.y)
    path.arc(d.x, d.y, d.r, 0, Math.PI * 2)
  }
  return path
}
