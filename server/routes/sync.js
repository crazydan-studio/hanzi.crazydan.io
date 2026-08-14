import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../middleware/validation.js'
import { ok } from '../middleware/response.js'
import { subscribeSync, unsubscribeSync, publishSync } from '../services/sync.js'

// 挂载于 /api/sync
const router = Router()

const emitSchema = z.object({
  client: z.string().min(1).max(100),   // 发起者标识（广播时排除，防回环）
  event: z.enum(['navigate', 'pen-width']),
  payload: z.record(z.unknown()).default({})
})

// SSE 订阅: GET /api/sync?client=<id>
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const clientId = req.query.client || String(Math.random())
  subscribeSync(clientId, res)
  // 传 res: 防止旧连接 close 时误删同 clientId 的新连接
  req.on('close', () => unsubscribeSync(clientId, res))
})

// 客户端主动广播: POST /api/sync/emit { client, event, payload }
router.post('/emit', validateBody(emitSchema), (req, res) => {
  publishSync(req.body.client, req.body.event, req.body.payload)
  return ok(res, null)
})

export default router
