// ============ 笔画轮廓后端 B: 自研笔触网格（文档方案） ============
// 自研管线: 高频物理采样点 → 动态笔宽（速度细/压感粗）→ 宽度滑动平均 →
// Catmull-Rom 曲线细分 → 左右法线 + 斜接(miter) 网格 → ctx.fill() 多边形填充。
// 与 PerfectStroke.js（perfect-freehand 后端）同接口，由 StrokeRenderer.js 按开关选用。
// 特性（面向汉字的笔锋还原）:
//   - 折/钩骨感: 顶点按“两侧法线斜接”生成，方向急转处以 miter 裁角、
//     过尖处回退为切角（bevel），不再因等宽描边而把折角画圆
//   - 撇/捺尖尾: 末段快速提笔或压感骤降时（last=true 的完整笔画），
//     在轨迹末端按长度把宽度平滑收敛至 0，拉出锐利收笔
//   - 起笔顿笔: 起笔速度低 → 宽度自动偏粗（圆帽起笔），天然呈现顿感
// 输入点: { x, y, pressure, timestamp? }（内部像素坐标 + 压力 0-1）;
// widthPx: 基准直径（px），实际宽度 = 基准 × 速度因子 × 压力映射
import { BASE_WIDTH } from './Constants.js'

const SUBDIVIDE_STEP = 2    // Catmull-Rom 曲线细分步长（px）; 细分点构成近似曲线的折线
const CAP_SEGMENTS = 6      // 起/收圆帽的弧段数
const DOT_SEGMENTS = 16     // 单点笔画的圆分段数
const SPEED_BASE = 10       // 速度因子分母（px/ms）: 速度越快宽度越小
const SPEED_MIN = 0.25      // 速度因子下限（长停顿/慢速时不至于无限粗）
const WIDTH_MIN = 0.75      // 非收笔区的最小半粗度下限（px）
const MITER_MIN_COS = 0.35  // 法线斜接半角余弦下限; 低于该值（急折）回退为切角
const TAIL_LEN = 24         // 收笔尖尾作用长度（px）
const TAIL_SPEED = 1.4      // 末段速度(px/ms)高于该值视为快速提笔（撇/捺收笔）
const TAIL_PRESSURE = 0.35  // 末段平均压力低于该值视为轻提收笔

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// 线段方向单位向量（零长度返回 null）
function unitDir(from, to) {
  const d = dist(from, to)
  if (!(d > 0)) return null
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d }
}

// 左侧法线（运笔方向逆时针旋转 90°）
function leftNormal(d) {
  return { x: -d.y, y: d.x }
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y
}

// ---- 动态笔宽 ----
// 钢笔/毛笔特征: 压感越大越粗、速度越快越细（提笔）、停顿（顿笔）时偏粗
function speedOf(p1, p2) {
  const d = dist(p1, p2)
  const t = Math.max(1e-3, Math.abs(p2.timestamp - p1.timestamp) || 1)
  return d / t
}

function widthOf(pts, i, widthPx) {
  // 取该点前后两段速度的平均（端点取单段）
  let sum = 0
  let count = 0
  if (i > 0) { sum += speedOf(pts[i - 1], pts[i]); count++ }
  if (i < pts.length - 1) { sum += speedOf(pts[i], pts[i + 1]); count++ }
  const speed = count ? sum / count : 0
  const speedFactor = clamp(1 - speed / SPEED_BASE, SPEED_MIN, 1)
  const pressure = clamp(pts[i].pressure ?? 0.5, 0, 1)
  const pressureFactor = 0.4 + 0.6 * pressure   // 压力 0..1 → 0.4..1.0
  return widthPx * speedFactor * pressureFactor
}

// 逐点宽度（含 3 点滑动平均防压力抖动）; endTaper 时把轨迹末端宽度平滑收敛至 0
function widthsOf(pts, widthPx, endTaper) {
  const n = pts.length
  const ws = new Array(n)
  for (let i = 0; i < n; i++) {
    ws[i] = Math.max(WIDTH_MIN, widthOf(pts, i, widthPx))
  }
  // 滑动平均（保持端点的原始值语义，仅中间平滑）
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) { out[i] = ws[i]; continue }
    out[i] = (ws[i - 1] + ws[i] + ws[i + 1]) / 3
  }
  if (endTaper && n > 2) {
    // 末端按几何距离渐细: 距离末端 TAIL_LEN 内宽度按 k² 收敛到 0（尖尾）
    const total = new Array(n)
    let acc = 0
    for (let i = n - 1; i >= 0; i--) {
      if (i < n - 1) acc += dist(pts[i], pts[i + 1])
      total[i] = acc
    }
    for (let i = 0; i < n; i++) {
      const k = clamp(total[i] / TAIL_LEN, 0, 1)   // 0 = 末端, 1 = 尖尾作用边界
      out[i] *= k * k
    }
  }
  return out
}

// 是否需要收笔尖尾（末段快速提笔 或 压感骤降）; 慢速重按的收笔（如点/顿）保留圆尾
function needEndTaper(pts) {
  if (pts.length < 3) return false
  const end = speedOf(pts[pts.length - 2], pts[pts.length - 1])
  if (end >= TAIL_SPEED) return true
  const p1 = pts[pts.length - 2].pressure ?? 0.5
  const p2 = pts[pts.length - 1].pressure ?? 0.5
  return (p1 + p2) / 2 <= TAIL_PRESSURE
}

// ---- Catmull-Rom 曲线细分 ----
// 以原始点为型值点采样平滑曲线（首/末段按端点复制补邻），细分步长 ≤ SUBDIVIDE_STEP;
// 每个细分点携带 frac（其在整条轨迹中的 0..1 参数），用于取回插值宽度
function refineChain(pts) {
  const n = pts.length
  const chain = []
  const last = n - 1
  for (let i = 0; i < last; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(last, i + 2)]
    const segLen = dist(a, b)
    const steps = Math.max(1, Math.min(256, Math.ceil(segLen / SUBDIVIDE_STEP)))
    for (let s = 0; s < steps; s++) {
      if (s === 0 && i > 0) continue   // 与前一段末采样重合
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      const p = {
        x: 0.5 * ((2 * a.x) + (-p0.x + b.x) * t +
          (2 * p0.x - 5 * a.x + 4 * b.x - p3.x) * t2 +
          (-p0.x + 3 * a.x - 3 * b.x + p3.x) * t3),
        y: 0.5 * ((2 * a.y) + (-p0.y + b.y) * t +
          (2 * p0.y - 5 * a.y + 4 * b.y - p3.y) * t2 +
          (-p0.y + 3 * a.y - 3 * b.y + p3.y) * t3),
        frac: (i + t) / last
      }
      chain.push(p)
    }
  }
  chain.push({ x: pts[last].x, y: pts[last].y, frac: 1 })
  return chain
}

// 按 0..1 参数取插值宽度（原始逐点宽度线性内插）
function widthAt(widths, frac) {
  const idx = clamp(frac, 0, 1) * (widths.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(widths.length - 1, lo + 1)
  const blend = idx - lo
  return widths[lo] + (widths[hi] - widths[lo]) * blend
}

// ---- 左右轮廓网格（斜接/切角） ----
// 顶点在两侧法线方向上偏移半径; 直线段方向变化处以两侧法线斜接求尖角（骨感），
// 折角过尖（cos 低于下限）时回退为切角避免网格自交/变形
function meshSides(chain, widths) {
  const m = chain.length
  const left = []
  const right = []
  for (let i = 0; i < m; i++) {
    const p = chain[i]
    const radius = widthAt(widths, p.frac) / 2
    const inDir = i > 0 ? unitDir(chain[i - 1], p) : null
    const outDir = i < m - 1 ? unitDir(p, chain[i + 1]) : null

    if (radius <= 0.001) {
      // 尖尾端点: 两侧收缩到同一点
      left.push({ x: p.x, y: p.y })
      right.push({ x: p.x, y: p.y })
      continue
    }

    if (inDir && outDir) {
      const nIn = leftNormal(inDir)
      const nOut = leftNormal(outDir)
      const bx = nIn.x + nOut.x
      const by = nIn.y + nOut.y
      const bl = Math.hypot(bx, by)
      if (bl > 1e-9 && (bx * nIn.x + by * nIn.y) / bl >= MITER_MIN_COS) {
        // 斜接: 两侧法线平分方向 × 半径/半角余弦 → 尖角折点
        const f = radius * bl / (bx * nIn.x + by * nIn.y)
        left.push({ x: p.x + bx / bl * f, y: p.y + by / bl * f })
        right.push({ x: p.x - bx / bl * f, y: p.y - by / bl * f })
      } else {
        // 急折: 切角（各侧取两段法线端点），避免斜接过长/自交
        left.push({ x: p.x + nIn.x * radius, y: p.y + nIn.y * radius })
        left.push({ x: p.x + nOut.x * radius, y: p.y + nOut.y * radius })
        right.push({ x: p.x - nIn.x * radius, y: p.y - nIn.y * radius })
        right.push({ x: p.x - nOut.x * radius, y: p.y - nOut.y * radius })
      }
    } else {
      // 端点: 单段法线
      const d = inDir || outDir
      const nx = -d.y
      const ny = d.x
      left.push({ x: p.x + nx * radius, y: p.y + ny * radius })
      right.push({ x: p.x - nx * radius, y: p.y - ny * radius })
    }
  }
  return { left, right }
}

// 圆帽弧点: θ 从 from 扫到 to（默认 0.5π → 1.5π，绕运笔方向 d 从左侧法线到右侧法线，
// 经过笔尾方向）; 仅取弧内采样点，两端点由相邻轮廓点衔接
function capArc(p, d, radius, steps, from = Math.PI / 2, to = Math.PI * 1.5) {
  const out = []
  for (let k = 1; k <= steps; k++) {
    const theta = from + (to - from) * k / (steps + 1)
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    out.push({
      x: p.x + (d.x * cos - d.y * sin) * radius,
      y: p.y + (d.x * sin + d.y * cos) * radius
    })
  }
  return out
}

// 自研轮廓多边形（文档方案的几何核心，纯计算; strokePath 负责建 Path2D）
// opts.last = false 时表示笔画尚未完结（书写中/回放进度露出），不做收笔尖尾
export function meshOutline(points, widthPx, opts) {
  const width = Math.max(1, widthPx || BASE_WIDTH)
  const list = []
  let prevX = null
  let prevY = null
  for (const p of points) {
    if (p.x === prevX && p.y === prevY) continue   // 滤重合点（除零保护）
    prevX = p.x
    prevY = p.y
    list.push({ x: p.x, y: p.y, pressure: p.pressure, timestamp: p.timestamp })
  }
  const n = list.length
  if (n === 0) return []

  // 单点笔画: 压力映射半径的圆
  if (n === 1) {
    const p = list[0]
    const radius = Math.max(1, width * (0.4 + 0.6 * (p.pressure ?? 0.5))) / 2
    const poly = []
    for (let k = 0; k < DOT_SEGMENTS; k++) {
      const t = k / DOT_SEGMENTS * Math.PI * 2
      poly.push({ x: p.x + Math.cos(t) * radius, y: p.y + Math.sin(t) * radius })
    }
    return poly
  }

  const last = opts ? opts.last !== false : true
  const widths = widthsOf(list, width, last && needEndTaper(list))
  const chain = refineChain(list)
  const { left, right } = meshSides(chain, widths)

  const firstDir = unitDir(list[0], list[1])
  const lastDir = unitDir(list[n - 2], list[n - 1])
  const r0 = widths[0] / 2
  const rn = widths[n - 1] / 2

  // 沿周长连续拼接: 左侧轮廓 → 收笔圆帽(π/2→3π/2，扫过笔尾) → 右侧轮廓(反向) →
  // 起笔圆帽(3π/2→π/2 递减，同样扫过笔尾) → 闭合到左起点
  // （弧段两端点与相邻轮廓点重合，由 closePath 自然闭合）
  const poly = []
  for (const p of left) poly.push(p)
  if (rn > 0.001) {
    poly.push(...capArc(list[n - 1], lastDir, rn, CAP_SEGMENTS))
  }
  for (let i = right.length - 1; i >= 0; i--) poly.push(right[i])
  if (r0 > 0.001) {
    // 起笔圆帽: 从右端点(3π/2)递减扫过笔尾(-π)回到左端点(π/2)
    poly.push(...capArc(list[0], firstDir, r0, CAP_SEGMENTS,
      Math.PI * 1.5, Math.PI * 0.5))
  }
  return poly
}

// 轨迹点 → 笔触轮廓 Path2D（书写/回放宿主统一入口）
// opts: { last } 笔画是否完结（见 meshOutline）
export function strokePath(points, widthPx, opts) {
  const poly = meshOutline(points, widthPx, opts)
  const path = new Path2D()
  if (poly.length === 0) return path
  path.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) {
    path.lineTo(poly[i].x, poly[i].y)
  }
  path.closePath()
  return path
}
