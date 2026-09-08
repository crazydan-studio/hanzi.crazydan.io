// ============ 笔画轮廓后端 A: perfect-freehand ============
// 经 perfect-freehand getStroke 生成平滑的压力笔触轮廓（几何产出，绘制由宿主完成）。
// 与 StrokeMesh.js（自研后端）同接口，由 StrokeRenderer.js 按开关选用。
// 输入点: { x, y, pressure }（画布内部坐标像素 + 压力 0-1）;
// size: 基准直径（px），经 thinning 按压力调制。
import { getStroke } from 'perfect-freehand'
import { BASE_WIDTH } from './Constants.js'

// 笔触轮廓参数（语义见 perfect-freehand StrokeOptions）:
//  - simulatePressure: false —— 轨迹携带真实压力，不做速度伪压力
//  - last: true —— 每次以当前末点为终点（书写随笔画增长、回放按进度露出，
//    末端始终收圆帽，不会因未完结而拖尾/截断）
const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
  last: true
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

// 轨迹点 → 笔触轮廓 Path2D（可重复 fill 不同颜色）; opts 预留接口对齐（本后端忽略）
export function strokePath(points, widthPx, opts) {
  const width = Math.max(1, widthPx || BASE_WIDTH)
  const outline = getStroke(toTriples(points), { ...STROKE_OPTIONS, size: width })
  const path = new Path2D()
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) {
    path.lineTo(outline[i][0], outline[i][1])
  }
  path.closePath()
  return path
}
