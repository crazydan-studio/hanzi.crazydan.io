// ============ 多端实时同步（SSE 广播，零依赖） ============
// 机制:
//   - 所有页面通过 EventSource 订阅全局频道 /api/sync?client=<id>
//   - 后端在笔画/汉字写操作后自动广播 strokes-changed/character-updated
//   - 前端主动广播 页面跳转(navigate)/模式(mode-changed)/笔宽(pen-width)
//   - 广播按 client 排除发起者，防止回环
const CHANNEL = 'hanzi-sync'
const HEARTBEAT_MS = 25000
const clients = new Map()   // clientId -> res

let heartbeatTimer = null

function ensureHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    for (const res of clients.values()) {
      res.write(': ping\n\n')
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
    try { old.end() } catch { /* ignore */ }
  }
  clients.set(clientId, res)
  ensureHeartbeat()
  // 初始连接确认（前端据此判断通道就绪）
  sseSend(res, 'ready', { client: clientId })
  res.write(': connected\n\n')
}

// 退订: 连接关闭时清理
// 注意: 必须比对 res 引用——旧连接被替换后其 close 事件不得删除新连接
export function unsubscribeSync(clientId, res) {
  if (clients.get(clientId) === res) {
    clients.delete(clientId)
  }
}

// 广播到除发起者外的所有客户端
export function broadcastSync(event, payload, exceptClientId) {
  const data = JSON.stringify(payload)
  for (const [clientId, res] of clients) {
    if (clientId === exceptClientId) continue
    try {
      res.write(`event: ${event}\ndata: ${data}\n\n`)
    } catch { /* 连接失效，稍后由 close 清理 */ }
  }
}

// 客户端主动广播（页面跳转/模式/笔宽等配置）
export function publishSync(clientId, event, payload) {
  broadcastSync(event, payload, clientId)
}

export const SYNC_CHANNEL = CHANNEL
