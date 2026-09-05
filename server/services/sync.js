// ============ 多端实时同步（SSE 广播，零依赖） ============
// 机制:
//   - 所有页面通过 EventSource 订阅全局频道 /api/sync?client=<id>
//   - 后端在笔画/汉字写操作后自动广播 strokes-changed/zi-updated
//   - 前端主动广播 页面跳转(navigate)/笔宽(pen-width)
//   - 广播按 client 排除发起者，防止回环
const HEARTBEAT_MS = 25000

// 同步事件名（服务端广播与前端订阅共用；前端列表见 src/services/syncClient.js）
export const SYNC_EVENTS = Object.freeze({
  READY: 'ready',
  ZI_UPDATED: 'zi-updated',
  STROKES_CHANGED: 'strokes-changed',
  NAVIGATE: 'navigate',
  PEN_WIDTH: 'pen-width'
})

const clients = new Map()   // clientId -> res

let heartbeatTimer = null

// 心跳保活（客户端存在时才运行，全部断开后停止）
function ensureHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    for (const [clientId, res] of [...clients]) {
      try {
        res.write(': ping\n\n')
      } catch {
        // 写失败 = 连接已失效，直接移除
        if (clients.get(clientId) === res) clients.delete(clientId)
      }
    }
    // 无连接时停止定时器（连接恢复后重新创建）
    if (clients.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }, HEARTBEAT_MS)
  // 进程退出不阻塞
  if (heartbeatTimer.unref) heartbeatTimer.unref()
}

// SSE 发送单个事件
function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// 订阅: 注册长连接并发送初始消息
export function subscribeSync(clientId, res) {
  if (clients.has(clientId)) {
    // 同 client 重复连接（刷新/重连）→ 断开旧连接
    const old = clients.get(clientId)
    try { old.end() } catch { /* 旧连接可能已断开 */ }
  }
  clients.set(clientId, res)
  ensureHeartbeat()
  // 初始连接确认（前端据此判断通道就绪）
  sseSend(res, SYNC_EVENTS.READY, { client: clientId })
  res.write(': connected\n\n')
}

// 退订: 连接关闭时清理
// 注意: 必须比对 res 引用——旧连接被替换后其 close 事件不得删除新连接
export function unsubscribeSync(clientId, res) {
  if (clients.get(clientId) === res) {
    clients.delete(clientId)
  }
}

// 广播到除发起者外的所有客户端; 对已失效（写失败）的连接直接移除
export function broadcastSync(event, payload, exceptClientId) {
  const data = JSON.stringify(payload)
  for (const [clientId, res] of [...clients]) {
    if (clientId === exceptClientId) continue
    try {
      res.write(`event: ${event}\ndata: ${data}\n\n`)
    } catch {
      // 写失败 = 连接已失效（浏览器端 close 可能滞后），直接移除
      if (clients.get(clientId) === res) clients.delete(clientId)
    }
  }
}

// 客户端主动广播（页面跳转/笔宽等配置）
export function publishSync(clientId, event, payload) {
  broadcastSync(event, payload, clientId)
}
