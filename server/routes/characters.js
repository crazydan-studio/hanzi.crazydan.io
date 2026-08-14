import { Router } from 'express'
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js'
import { ok, paginated } from '../middleware/response.js'
import { AppError } from '../middleware/errorHandler.js'
import { characterService } from '../services/characterService.js'
import { broadcastSync } from '../services/sync.js'
import {
  createCharacterSchema, updateCharacterSchema,
  idParamsSchema, listQuerySchema
} from '../schemas/characterSchema.js'

const router = Router()

router.get('/', validateQuery(listQuerySchema), (req, res) => {
  const result = characterService.findAll(req.query)
  return paginated(res, result)
})

router.get('/by-char/:char', (req, res) => {
  const character = characterService.findByCharacter(req.params.char)
  if (!character) throw new AppError(404, 'NOT_FOUND', 'Character not found')
  return ok(res, character)
})

router.get('/:id', validateParams(idParamsSchema), (req, res) => {
  const character = characterService.findById(req.params.id)
  if (!character) throw new AppError(404, 'NOT_FOUND', 'Character not found')
  return ok(res, character)
})

router.post('/', validateBody(createCharacterSchema), (req, res) => {
  const character = characterService.create(req.body)
  return ok(res, character, 201)
})

router.patch('/:id', validateParams(idParamsSchema), validateBody(updateCharacterSchema), (req, res) => {
  const character = characterService.update(req.params.id, req.body)
  if (!character) throw new AppError(404, 'NOT_FOUND', 'Character not found')
  // 结构等字段修改后广播（列表页/书写页同步刷新）
  broadcastSync('character-updated', { id: character.id })
  return ok(res, character)
})

router.delete('/:id', validateParams(idParamsSchema), (req, res) => {
  characterService.delete(req.params.id)
  return ok(res, null)
})

export default router
