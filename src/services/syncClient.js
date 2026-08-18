// ============ 多端同步客户端（页面层专用；基于 SSE + REST 广播） ============
// 事件（服务端广播）:
//   ready            连接确认
//   strokes-changed  某字笔画数据变化 { ziId }（写操作后端自动广播）
//   zi-updated 某字信息变化 { id }
//   navigate         页面跳转 { url }（其他端跟随跳转）
//   pen-width        笔触宽度变化 { width }
// 防回环: 每个页面持有会话级唯一 clientId，emit 时携带，服务端广播排除发起者
import { api } from './api.js'

const CLIENT_KEY = 'hanzi:syncClientId'
const LISTEN_EVENTS = ['navigate', 'strokes-changed', 'zi-updated', 'pen-width']

export function createSyncClient() {
  let clientId = sessionStorage.getItem(CLIENT_KEY)
  if (!clientId) {
    clientId = crypto.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(CLIENT_KEY, clientId)
  }

  const handlers = new Map()   // event -> Set<fn>
  let es = null

  function connect() {
    if (es) return
    es = new EventSource(`/api/sync?client=${encodeURIComponent(clientId)}`)
    es.addEventListener('ready', () => { /* 连接确认 */ })
    for (const evt of LISTEN_EVENTS) {
      es.addEventListener(evt, (e) => {
        let payload = {}
        try { payload = JSON.parse(e.data) } catch { /* 忽略坏数据 */ }
        for (const fn of handlers.get(evt) || []) {
          try { fn(payload) } catch { /* 单个处理器异常不阻断 */ }
        }
      })
    }
    // EventSource 断线自动重连（无需手动处理）
  }

  // 订阅事件
  function on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event).add(fn)
  }

  // 主动广播（排除自己）
  async function emit(event, payload = {}) {
    try {
      await api.post('/api/sync/emit', { client: clientId, event, payload })
    } catch { /* 同步广播失败不影响主流程 */ }
  }

  connect()
  return { on, emit }
}
