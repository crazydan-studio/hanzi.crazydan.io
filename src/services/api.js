const BASE_URL = ''   // 同源（dev由Vite proxy转发，prod由Express托管）

class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body !== undefined) options.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, options)
  let payload = {}
  try { payload = await res.json() } catch { /* 非JSON响应 */ }

  if (!res.ok) {
    // 后端统一错误格式: { success:false, error:{ code, message, details } }
    const err = payload.error || {}
    throw new ApiError(res.status, err.code || 'HTTP_ERROR',
      err.message || `Request failed: ${res.status}`, err.details || {})
  }

  // 响应体校验：必须是 { success:true, data, ... } 形态
  // （防止代理指向错误服务返回HTML/空对象导致 res.data === undefined）
  if (typeof payload !== 'object' || payload === null || payload.success !== true) {
    throw new ApiError(res.status, 'BAD_RESPONSE',
      `Invalid server response for ${method} ${path}`)
  }
  return payload   // 完整响应体 { success, data, meta }
}

export const api = {
  get:    (path)    => request('GET', path),
  post:   (path, b) => request('POST', path, b),
  patch:  (path, b) => request('PATCH', path, b),
  delete: (path)    => request('DELETE', path)
}
