// ============ 笔画渲染门面（web 书写/回放统一入口） ============
// 轮廓后端（几何算法，同一接口，StrokePad/AnimationEngine 无需感知）:
//   - 'brush'     原始自研笔触（默认）: 压力×速度×起收笔锥形宽度 + 逐段圆帽，
//               见 BrushStroke.js（仓库最初实现）
//   - 'atrament'  atrament 算法: 平滑回拉 + 自适应/压感厚度 + 圆帽线段，
//               见 AtramentStroke.js
//   - 'mesh'     自研笔触网格: 动态笔宽 + 曲线细分 + 法线斜接网格 + 收笔尖尾，
//               见 StrokeMesh.js（文档方案）
//   - 'perfect'  perfect-freehand: 压力轮廓多边形，见 PerfectStroke.js
//   - 'signature' signature_pad 算法: 速度滤波笔宽 + 四点三次贝塞尔 + 圆盘填充，
//               见 SignatureStroke.js
// 渲染模式:
//   - 'stroke' 逐段 round-cap 描边（仅 'brush' 后端支持）: 像素级等同原始实现，
//     无 Path2D 缓存，回放逐帧重绘代价与原始一致
//   - 'fill'   轮廓 Path2D 一次 fill（所有后端）: 按点集缓存，颜色/主题可复用
// 书写中/回放进度露出等“未完结”片段经 opts.last=false 传递（fill 模式下该
// 片段逐帧新建点集，直接计算不缓存）
import { strokePath as brushStrokePath, drawBrushStroke } from './BrushStroke.js'
import { strokePath as atramentStrokePath } from './AtramentStroke.js'
import { strokePath as meshStrokePath } from './StrokeMesh.js'
import { strokePath as perfectStrokePath } from './PerfectStroke.js'
import { strokePath as signatureStrokePath } from './SignatureStroke.js'
import { BASE_WIDTH } from './Constants.js'

const STROKE_BACKEND = 'brush'
const STROKE_MODE = 'stroke'

const backends = {
  brush: brushStrokePath,
  atrament: atramentStrokePath,
  mesh: meshStrokePath,
  perfect: perfectStrokePath,
  signature: signatureStrokePath
}

const strokePathImpl = backends[STROKE_BACKEND]
const useStrokeMode = STROKE_MODE === 'stroke' && STROKE_BACKEND === 'brush'

// fill 模式轮廓缓存: 点集数组按约定不可变（坐标换算/加载时整体替换），
// 以数组为键缓存 Path2D 与基准宽; 进度露出片段逐帧新建数组，不走缓存
const outlineCache = new WeakMap()

// 绘制一笔（书写/回放统一入口）:
//   ctx    目标画布上下文; points 像素坐标点（含 pressure/timestamp）
//   widthPx 基准笔宽/直径; color 颜色; opts { last } 笔画是否完结
export function drawStroke(ctx, points, widthPx, color, opts) {
  if (!points || points.length === 0) return
  if (useStrokeMode) {
    drawBrushStroke(ctx, points, widthPx, color)
    return
  }
  const width = Math.max(1, widthPx || BASE_WIDTH)
  if (opts && opts.last === false) {
    // 未完结片段（书写中/回放进度露出）: 每帧点集不同，直接生成并填充
    ctx.fillStyle = color
    ctx.fill(strokePathImpl(points, width, opts))
    return
  }
  const cached = outlineCache.get(points)
  if (cached && cached.width === width) {
    ctx.fillStyle = color
    ctx.fill(cached.path)
    return
  }
  const path = strokePathImpl(points, width, opts)
  outlineCache.set(points, { width, path })
  ctx.fillStyle = color
  ctx.fill(path)
}

// 增量绘制一笔（书写过程中按段续绘，避免每帧重描整笔）:
// 仅 'brush' 后端支持按段续绘（stroke 模式逐段描边 / fill 模式胶囊段）;
// 其他后端忽略 from 回退为完整绘制
export function drawStrokeFrom(ctx, points, widthPx, color, from = 0, opts) {
  if (!points || points.length === 0) return
  if (STROKE_BACKEND === 'brush') {
    if (useStrokeMode) {
      drawBrushStroke(ctx, points, widthPx, color, from)
      return
    }
    const width = Math.max(1, widthPx || BASE_WIDTH)
    ctx.fillStyle = color
    ctx.fill(brushStrokePath(points, width, { ...opts, from }))
    return
  }
  drawStroke(ctx, points, widthPx, color, opts)
}

// 单点笔画圆点（半径 = 基准直径 × 压力映射 × 进度），供 1 点轨迹与起始帧
export function drawDot(ctx, x, y, pressure, widthPx, radiusScale = 1) {
  const width = Math.max(1, widthPx || BASE_WIDTH)
  const r = Math.max(width / 2 * (0.4 + 0.6 * (pressure ?? 0.5)) * radiusScale, 0.5)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
