// ============ 笔画渲染门面（web 书写/回放统一入口） ============
// 笔触轮廓后端可选（同一接口，StrokePad/AnimationEngine 无需改动）:
//   - 'brush'     原始自研笔触（默认）: 压力×速度×起收笔锥形宽度 + 逐段圆帽线段，
//               见 BrushStroke.js（仓库最初实现）
//   - 'atrament'  atrament 算法: 平滑回拉 + 自适应/压感厚度 + 圆帽线段，
//               见 AtramentStroke.js
//   - 'mesh'     自研笔触网格: 动态笔宽 + 曲线细分 + 法线斜接网格 + 收笔尖尾，
//               见 StrokeMesh.js（文档方案）
//   - 'perfect'  perfect-freehand: 压力轮廓多边形，见 PerfectStroke.js
//   - 'signature' signature_pad 算法: 速度滤波笔宽 + 四点三次贝塞尔 + 圆盘填充，
//               见 SignatureStroke.js
// 书写中/回放进度露出等“未完结”片段经 opts.last=false 传递，避免末端提前收笔。
import { strokePath as brushStrokePath } from './BrushStroke.js'
import { strokePath as atramentStrokePath } from './AtramentStroke.js'
import { strokePath as meshStrokePath } from './StrokeMesh.js'
import { strokePath as perfectStrokePath } from './PerfectStroke.js'
import { strokePath as signatureStrokePath } from './SignatureStroke.js'
import { BASE_WIDTH } from './Constants.js'

const STROKE_BACKEND = 'brush'

const backends = {
  brush: brushStrokePath,
  atrament: atramentStrokePath,
  mesh: meshStrokePath,
  perfect: perfectStrokePath,
  signature: signatureStrokePath
}

const strokePathImpl = backends[STROKE_BACKEND]

// 轨迹点 → 笔触轮廓 Path2D; opts: { last } 笔画是否完结
// 输入点: { x, y, pressure }（内部像素坐标 + 压力 0-1）; widthPx: 基准直径
export function strokePath(points, widthPx, opts) {
  return strokePathImpl(points, widthPx, opts)
}

// 单点笔画圆点（半径 = 基准直径 × 压力映射 × 进度），供 1 点轨迹与起始帧
export function drawDot(ctx, x, y, pressure, widthPx, radiusScale = 1) {
  const width = Math.max(1, widthPx || BASE_WIDTH)
  const r = Math.max(width / 2 * (0.4 + 0.6 * (pressure ?? 0.5)) * radiusScale, 0.5)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
