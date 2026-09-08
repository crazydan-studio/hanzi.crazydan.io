// ============ 笔画轮廓后端 A: perfect-freehand ============
// 经 perfect-freehand getStroke 生成平滑的压力笔触轮廓（几何产出，绘制由宿主完成）。
// 与 StrokeMesh.js（自研网格）/ AtramentStroke.js / SignatureStroke.js 同接口，
// 由 StrokeRenderer.js 按开关选用。
// 输入点: { x, y, pressure }（画布内部坐标像素 + 压力 0-1）;
// size: 基准直径（px），经 thinning 按压力调制。
// 说明（针对汉字笔迹的修正，原因与 getStroke 算法相关）:
//   - 库自带端帽圆弧会绕行超过 360°（自交），在端点留下“空洞/断裂”，
//     且轮廓按 (size×smoothing)² 距离抽稀成粗折线，端帽呈多边形“切面”;
//     故关闭其自绘端帽（cap:false），改为在 wrapper 端点补整圆（等宽圆帽），
//     并将 smoothing 调低以加密轮廓采样，使拐角与弧线呈平滑圆角而非切面
import { getStroke } from 'perfect-freehand'
import { BASE_WIDTH } from './Constants.js'

// 笔触轮廓参数（语义见 perfect-freehand StrokeOptions）:
//  - simulatePressure: false —— 轨迹携带真实压力，不做速度伪压力
//  - last: true —— 每次以当前末点为终点（书写随笔画增长、回放按进度露出）
//  - smoothing: 0.15 —— 加密轮廓采样（默认 0.5 时相邻轮廓点间距 ≈ size/2，
//    圆端/弧线呈明显折线切面; 调低后间距 ≈ size×0.15，视觉连续圆滑）
//  - start/end.cap: false —— 关闭库自绘端帽（其圆弧自交造成端点空洞），
//    由 wrapper 用等宽整圆补齐圆帽（见 strokePath 端盘修正）
const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.15,
  streamline: 0.5,
  simulatePressure: false,
  last: true,
  start: { cap: false, taper: 0 },
  end: { cap: false, taper: 0 }
}

function toTriples(points) {
  const out = []
  let prevX = null
  let prevY = null
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    // 过滤完全重合的连续点（除零保护: 零位移会使轮廓计算出现 NaN）
    if (p.x === prevX && p.y === prevY) continue
    prevX = p.x
    prevY = p.y
    out.push([p.x, p.y, p.pressure ?? 0.5])
  }
  return out
}

// 端帽半径（与 getStroke 宽度公式同源: size×(0.25+0.5×pressure)）
function endCapRadius(widthPx, pressure) {
  return Math.max(1, widthPx || BASE_WIDTH) * (0.25 + 0.5 * (pressure ?? 0.5))
}

// 轨迹点 → 笔触轮廓 Path2D（可重复 fill 不同颜色）; opts 预留接口对齐（本后端忽略）
export function strokePath(points, widthPx, opts) {
  const triples = toTriples(points)
  if (triples.length === 0) return new Path2D()
  const width = Math.max(1, widthPx || BASE_WIDTH)

  const outline = getStroke(triples, { ...STROKE_OPTIONS, size: width })
  const path = new Path2D()
  if (outline.length > 0) {
    path.moveTo(outline[0][0], outline[0][1])
    for (let i = 1; i < outline.length; i++) {
      path.lineTo(outline[i][0], outline[i][1])
    }
    path.closePath()
  }

  // 端盘修正: 在首/末点补等宽整圆 —— 圆帽为真圆（无切面），
  // 且覆盖库端帽自交可能留下的端点空洞（断裂）
  const addCap = (x, y, p) => {
    const r = endCapRadius(width, p)
    path.moveTo(x, y)
    path.arc(x, y, r, 0, Math.PI * 2)
  }
  addCap(triples[0][0], triples[0][1], triples[0][2])
  addCap(triples[triples.length - 1][0], triples[triples.length - 1][1],
    triples[triples.length - 1][2])
  return path
}
