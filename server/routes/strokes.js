import { Router } from 'express'
import { z } from 'zod'
import { validateBody, validateParams } from '../middleware/validation.js'
import { ok } from '../middleware/response.js'
import { AppError } from '../middleware/errorHandler.js'
import { strokeService } from '../services/strokeService.js'
import { broadcastSync } from '../services/sync.js'
import { createStrokeSchema, updateStrokeSchema, batchCreateStrokesSchema, reorderStrokesSchema } from '../schemas/strokeSchema.js'

// 挂载于 /api/characters/:characterId/strokes
const router = Router({ mergeParams: true })

// 写操作后广播: 其他端的同字书写页/列表页据此刷新
const strokesChanged = (characterId) =>
  broadcastSync('strokes-changed', { characterId: Number(characterId) })

// 注意: 必须显式声明 characterId —— Zod 的 z.object 默认剥离未声明键，
// 若不声明，validateParams 会把 req.params 替换成 { id } 而丢掉 characterId，
// 导致下游 SQL 绑定 undefined 报错
const strokeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  characterId: z.coerce.number().int().positive()
})

router.get('/', (req, res) => {
  strokeService.assertCharacterExists(req.params.characterId)  // 不存在则404
  const strokes = strokeService.findByCharacter(req.params.characterId)
  return ok(res, strokes)
})

router.post('/', validateBody(createStrokeSchema), (req, res) => {
  const stroke = strokeService.create(req.params.characterId, req.body)
  strokesChanged(req.params.characterId)
  return ok(res, stroke, 201)
})

router.post('/batch', validateBody(batchCreateStrokesSchema), (req, res) => {
  const strokes = strokeService.createBatch(req.params.characterId, req.body.strokes)
  strokesChanged(req.params.characterId)
  return ok(res, strokes, 201)
})

// 重排笔画顺序（注意: 必须定义在 '/:id' 之前，避免被参数路由吞掉）
router.post('/reorder', validateBody(reorderStrokesSchema), (req, res) => {
  const strokes = strokeService.reorder(req.params.characterId, req.body.strokeIds)
  strokesChanged(req.params.characterId)
  return ok(res, strokes)
})

router.patch('/:id', validateParams(strokeIdParamsSchema),
  validateBody(updateStrokeSchema), (req, res) => {
    // 校验笔画属于该汉字（防止跨字符误改）
    const existing = strokeService.findByIdAndCharacter(
      req.params.id, req.params.characterId)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Stroke not found')
    const stroke = strokeService.update(req.params.id, req.body)
    strokesChanged(req.params.characterId)
    return ok(res, stroke)
  })

router.delete('/:id', validateParams(strokeIdParamsSchema), (req, res) => {
  const existing = strokeService.findByIdAndCharacter(
    req.params.id, req.params.characterId)
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Stroke not found')
  strokeService.delete(req.params.id)
  strokesChanged(req.params.characterId)
  return ok(res, null)
})

export default router
