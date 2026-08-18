import { Router } from 'express'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js'
import { ok, paginated } from '../middleware/response.js'
import { AppError } from '../middleware/errorHandler.js'
import { ziService } from '../services/ziService.js'
import { broadcastSync } from '../services/sync.js'
import {
  createZiSchema, updateZiSchema,
  idParamsSchema, listQuerySchema
} from '../schemas/ziSchema.js'

const router = Router()

router.get('/', validateQuery(listQuerySchema), (req, res) => {
  const result = ziService.findAll(req.query)
  return paginated(res, result)
})

router.get('/by-zi/:zi', (req, res) => {
  const zi = ziService.findByZi(req.params.zi)
  if (!zi) throw new AppError(404, 'NOT_FOUND', 'Zi not found')
  return ok(res, zi)
})

router.get('/:id', validateParams(idParamsSchema), (req, res) => {
  const zi = ziService.findById(req.params.id)
  if (!zi) throw new AppError(404, 'NOT_FOUND', 'Zi not found')
  return ok(res, zi)
})

router.post('/', validateBody(createZiSchema), (req, res) => {
  const zi = ziService.create(req.body)
  return ok(res, zi, 201)
})

router.patch('/:id', validateParams(idParamsSchema), validateBody(updateZiSchema), (req, res) => {
  const zi = ziService.update(req.params.id, req.body)
  if (!zi) throw new AppError(404, 'NOT_FOUND', 'Zi not found')
  // 结构等字段修改后广播（列表页/书写页同步刷新）
  broadcastSync('zi-updated', { id: zi.id })
  return ok(res, zi)
})

router.delete('/:id', validateParams(idParamsSchema), (req, res) => {
  ziService.delete(req.params.id)
  return ok(res, null)
})

export default router
