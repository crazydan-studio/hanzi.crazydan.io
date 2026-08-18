export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) return next(result.error)
    req.body = result.data
    next()
  }
}

export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params)
    if (!result.success) return next(result.error)
    req.params = result.data
    next()
  }
}

export function validateQuery(schema) {
  return (req, res, next) => {
    // 分页/限制等数字参数转数字（z.coerce 处理）
    const result = schema.safeParse(req.query)
    if (!result.success) return next(result.error)
    req.query = result.data
    next()
  }
}
