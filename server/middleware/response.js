export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data })
}

export function paginated(res, { data, meta }, status = 200) {
  return res.status(status).json({ success: true, data, meta })
}
