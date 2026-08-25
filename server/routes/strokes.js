import { Router } from 'express'
import { z } from 'zod'
import { validateBody, validateParams } from '../middleware/validation.js'
import { ok } from '../middleware/response.js'
import { AppError } from '../middleware/errorHandler.js'
import { strokeService } from '../services/StrokeService.js'
import { broadcastSync } from '../services/sync.js'
import { createStrokeSchema, updateStrokeSchema, batchCreateStrokesSchema, reorderStrokesSchema } from '../schemas/StrokeSchema.js'

// 挂载于 /api/zi/:ziId/strokes
const router = Router({ mergeParams: true })

// 写操作后广播: 其他端的同字书写页/列表页据此刷新
const strokesChanged = (ziId) =>
  broadcastSync('strokes-changed', { ziId: Number(ziId) })

// 注意: 必须显式声明 ziId —— Zod 的 z.object 默认剥离未声明键，
// 若不声明，validateParams 会把 req.params 替换成 { id } 而丢掉 ziId，
// 导致下游 SQL 绑定 undefined 报错
const ziIdParamsSchema = z.object({
  ziId: z.coerce.number().int().positive()
})
const strokeIdParamsSchema = ziIdParamsSchema.extend({
  id: z.coerce.number().int().positive()
})

// 笔画不存在于该汉字时抛出 404（防跨字符误改）
function strokeNotFoundIfMissing(stroke) {
  if (!stroke) throw new AppError(404, 'NOT_FOUND', 'Stroke not found')
  return stroke
}

router.get('/', validateParams(ziIdParamsSchema), (req, res) => {
  strokeService.assertZiExists(req.params.ziId)  // 不存在则404
  const strokes = strokeService.findByZi(req.params.ziId)
  return ok(res, strokes)
})

router.post('/', validateBody(createStrokeSchema), (req, res) => {
  const stroke = strokeService.create(req.params.ziId, req.body)
  strokesChanged(req.params.ziId)
  return ok(res, stroke, 201)
})

router.post('/batch', validateBody(batchCreateStrokesSchema), (req, res) => {
  const strokes = strokeService.createBatch(req.params.ziId, req.body.strokes)
  strokesChanged(req.params.ziId)
  return ok(res, strokes, 201)
})

// 重排笔画顺序（注意: 必须定义在 '/:id' 之前，避免被参数路由吞掉）
router.post('/reorder', validateBody(reorderStrokesSchema), (req, res) => {
  const strokes = strokeService.reorder(req.params.ziId, req.body.strokeIds)
  strokesChanged(req.params.ziId)
  return ok(res, strokes)
})

router.patch('/:id', validateParams(strokeIdParamsSchema),
  validateBody(updateStrokeSchema), (req, res) => {
    // 校验笔画属于该汉字（防止跨字符误改）
    strokeNotFoundIfMissing(strokeService.findByIdAndZi(
      req.params.id, req.params.ziId))
    const stroke = strokeService.update(req.params.id, req.body)
    strokesChanged(req.params.ziId)
    return ok(res, stroke)
  })

router.delete('/:id', validateParams(strokeIdParamsSchema), (req, res) => {
  strokeNotFoundIfMissing(strokeService.findByIdAndZi(
    req.params.id, req.params.ziId))
  strokeService.delete(req.params.id)
  strokesChanged(req.params.ziId)
  return ok(res, null)
})

export default router
