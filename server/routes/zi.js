import { Router } from 'express'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js'
import { ok, paginated } from '../middleware/response.js'
import { AppError } from '../middleware/errorHandler.js'
import { ziService } from '../services/ZiService.js'
import { broadcastSync, SYNC_EVENTS } from '../services/sync.js'
import {
  createZiSchema, updateZiSchema,
  idParamsSchema, ziParamSchema, listQuerySchema
} from '../schemas/ZiSchema.js'

const router = Router()

// 汉字不存在时抛出 404
function notFoundIfMissing(zi) {
  if (!zi) throw new AppError(404, 'NOT_FOUND', 'Zi not found')
  return zi
}

router.get('/', validateQuery(listQuerySchema), (req, res) => {
  const result = ziService.findAll(req.query)
  return paginated(res, result)
})

router.get('/by-zi/:zi', validateParams(ziParamSchema), (req, res) => {
  return ok(res, notFoundIfMissing(ziService.findByZi(req.params.zi)))
})

router.get('/:id', validateParams(idParamsSchema), (req, res) => {
  return ok(res, notFoundIfMissing(ziService.findById(req.params.id)))
})

router.post('/', validateBody(createZiSchema), (req, res) => {
  const zi = ziService.create(req.body)
  return ok(res, zi, 201)
})

router.patch('/:id', validateParams(idParamsSchema), validateBody(updateZiSchema), (req, res) => {
  const { zi, changed } = ziService.update(req.params.id, req.body)
  notFoundIfMissing(zi)
  // 结构等字段实际修改后广播（列表页/书写页同步刷新）; 空 PATCH 不广播
  if (changed) {
    broadcastSync(SYNC_EVENTS.ZI_UPDATED, { id: zi.id })
  }
  return ok(res, zi)
})

// 删除（幂等）: 实际删除后同步静态数据并广播（打开的相关页面据此刷新）
router.delete('/:id', validateParams(idParamsSchema), (req, res) => {
  const { changed } = ziService.delete(req.params.id)
  if (changed) {
    broadcastSync(SYNC_EVENTS.ZI_UPDATED, { id: req.params.id })
  }
  return ok(res, null)
})

export default router
