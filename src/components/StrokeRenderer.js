// ============ 笔画渲染（web: perfect-freehand 压力笔触轮廓） ============
// 书写与回放共用同一渲染路径: 把带真实压力的轨迹点经 perfect-freehand 生成
// 平滑的压力笔触轮廓多边形，再由宿主 canvas 填充绘制。
// 输入点: { x, y, pressure }（画布内部坐标像素 + 压力 0-1）;
// size: 基准直径（px，内部坐标系），由轨迹笔刷面积比还原或书写笔宽给定;
// 经 thinning 按压力调制: 宽度 ≈ size × (0.5 + p)（p 越大越粗）。
// 仅产出几何，不负责颜色/画布管理; 参数集中在下方便于整体调校。
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

// 轨迹点 → 笔触轮廓 Path2D（可重复 fill 不同颜色）
export function strokePath(points, widthPx) {
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

// 单点笔画圆点（半径随压力与进度增长，供 1 点轨迹与进度起始帧使用）
export function drawDot(ctx, x, y, pressure, widthPx, radiusScale = 1) {
  const width = Math.max(1, widthPx || BASE_WIDTH)
  const r = Math.max(width / 2 * (0.4 + 0.6 * (pressure ?? 0.5)) * radiusScale, 0.5)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
