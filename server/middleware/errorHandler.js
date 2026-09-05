// 错误响应构造: 统一 { success:false, error: { code, message, details } }
function errorBody(code, message, details = {}) {
  return { success: false, error: { code, message, details } }
}

export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// node:sqlite 约束错误码 → HTTP 语义
// 参考: https://sqlite.org/rescode.html（extended code，node:sqlite errcode 为扩展码）
//   2067 = SQLITE_CONSTRAINT_UNIQUE      唯一索引冲突（重复资源）
//   1555 = SQLITE_CONSTRAINT_PRIMARYKEY  主键冲突（重复资源）
//   787  = SQLITE_CONSTRAINT_FOREIGNKEY  外键引用不存在
//   275  = SQLITE_CONSTRAINT_CHECK       违反 CHECK 约束
//   1299 = SQLITE_CONSTRAINT_NOTNULL     违反 NOT NULL
//   19   = SQLITE_CONSTRAINT             其他约束冲突（兜底）
const SQLITE_CONSTRAINTS = [
  { errcode: 2067, status: 409, code: 'CONFLICT', message: 'Resource already exists' },
  { errcode: 1555, status: 409, code: 'CONFLICT', message: 'Resource already exists' },
  { errcode: 787, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid reference' },
  { errcode: 275, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid data' },
  { errcode: 1299, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid data' },
  { errcode: 19, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid data' }
]

export function errorHandler(err, req, res, next) {
  // Zod 验证错误（字段级明细）
  if (err.name === 'ZodError') {
    return res.status(400).json(errorBody(
      'VALIDATION_ERROR', 'Invalid request data',
      err.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
    ))
  }

  // 业务错误
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details }
    })
  }

  // 请求体解析失败（express.json）: 非法 JSON → 400; 超出大小上限 → 413
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('BAD_REQUEST', 'Invalid JSON body'))
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'Request body too large'))
  }

  // SQLite 约束冲突
  if (err.code === 'ERR_SQLITE_ERROR') {
    const rule = SQLITE_CONSTRAINTS.find(c => c.errcode === err.errcode)
    if (rule) {
      return res.status(rule.status).json(errorBody(rule.code, rule.message))
    }
  }

  // 未知错误
  console.error(err)
  return res.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error'))
}
