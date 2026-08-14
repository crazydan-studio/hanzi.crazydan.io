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
    // 转换字符串为数字
    const raw = { ...req.query }
    for (const key of ['page', 'limit', 'difficulty']) {
      if (raw[key] !== undefined) raw[key] = Number(raw[key])
    }
    const result = schema.safeParse(raw)
    if (!result.success) return next(result.error)
    req.query = result.data
    next()
  }
}
