export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function errorHandler(err, req, res, next) {
  // Zod验证错误
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      }
    })
  }

  // 业务错误
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details }
    })
  }

  // SQLite唯一约束冲突（node:sqlite: err.code === 'ERR_SQLITE_ERROR' 且 err.errcode === 2067）
  if (err.code === 'ERR_SQLITE_ERROR' && err.errcode === 2067) {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'Resource already exists', details: {} }
    })
  }

  // SQLite外键约束（node:sqlite errcode: 787 = SQLITE_CONSTRAINT_FOREIGNKEY）
  if (err.code === 'ERR_SQLITE_ERROR' && err.errcode === 787) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid reference', details: {} }
    })
  }

  // 其他 SQLite 约束（CHECK/NOT NULL/PRIMARY KEY）→ 400
  // node:sqlite errcode: 275=CHECK, 1299=NOTNULL, 1555=PRIMARYKEY, 19=CONSTRAINT
  const isConstraint = err.code === 'ERR_SQLITE_ERROR' &&
    [19, 275, 1299, 1555].includes(err.errcode)
  if (isConstraint) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: {} }
    })
  }

  // 未知错误
  console.error(err)
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} }
  })
}
