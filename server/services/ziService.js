import { getDb, serializeZi, serializeStroke } from './database.js'
import { syncZiMeta } from './staticSync.js'

export const ziService = {
  // 列表: 按权重降序，支持 按字/拼音搜索 + 笔画图过滤，附带笔画（缩略图用）
  // has_strokes: '1'/'true' 完整(cnt==total) | '2'/'partial' 仅含部分笔画图(cnt>0且不等) | '0'/'false' 无笔画图(cnt=0)
  findAll({ page = 1, limit = 20, search, has_strokes }) {
    const db = getDb()
    const conditions = ['1=1']
    const params = []

    if (search) {
      // 匹配字 或 拼音（无声调 JSON 数组）或 读音
      conditions.push(`(c.zi LIKE ? OR c.pinyin LIKE ?)`)
      const term = `%${search}%`
      params.push(term, term)
    }

    let strokeJoin = ''
    if (has_strokes !== undefined) {
      const wantComplete = has_strokes === '1' || has_strokes === 'true'
      const wantPartial = has_strokes === '2' || has_strokes === 'partial'
      // 完整: 实际笔画记录数 == total_stroke_count
      // 仅含部分笔画图: 已有笔画记录 且 数量与预期不相等
      // 无笔画图: 笔画记录数为 0
      strokeJoin = `
        LEFT JOIN (
          SELECT zi_id, COUNT(*) AS cnt FROM strokes
          GROUP BY zi_id
        ) sc ON sc.zi_id = c.id
      `
      if (wantComplete) {
        conditions.push('sc.cnt = c.total_stroke_count')
      } else if (wantPartial) {
        conditions.push('sc.cnt > 0 AND sc.cnt != c.total_stroke_count')
      } else {
        conditions.push('(sc.cnt IS NULL OR sc.cnt = 0)')
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`
    const { total } = db.prepare(
      `SELECT COUNT(*) AS total FROM zi c ${strokeJoin} ${where}`
    ).get(...params)

    const offset = (page - 1) * limit
    const rows = db.prepare(`
      SELECT c.* FROM zi c
      ${strokeJoin} ${where}
      ORDER BY c.used_weight DESC, c.id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    // 附带每字的笔画（trajectory 供前端小图渲染）
    const data = rows.map(row => {
      const zi = serializeZi(row)
      const strokes = db.prepare(
        'SELECT * FROM strokes WHERE zi_id = ? ORDER BY stroke_order'
      ).all(zi.id).map(serializeStroke)
      return { ...zi, strokes }
    })

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }
  },

  findById(id) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM zi WHERE id = ?').get(id)
    if (!row) return null

    const strokes = db.prepare(
      'SELECT * FROM strokes WHERE zi_id = ? ORDER BY stroke_order'
    ).all(id).map(serializeStroke)

    return { ...serializeZi(row), strokes }
  },

  findByZi(zi) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM zi WHERE zi = ?').get(zi)
    if (!row) return null
    return this.findById(row.id)
  },

  create(data) {
    const db = getDb()
    const id = data.zi.codePointAt(0)
    db.prepare(`
      INSERT INTO zi (id, zi, pinyin, used_weight, structure, total_stroke_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.zi,
      JSON.stringify(data.pinyin || []),
      data.used_weight ?? 0, data.structure ?? 0, data.total_stroke_count ?? 0)
    return this.findById(id)
  },

  // 仅允许更新 structure / radical（其余只读）
  update(id, data) {
    const db = getDb()
    const updates = []
    const params = []
    if (data.structure !== undefined) {
      updates.push('structure = ?')
      params.push(data.structure)
    }
    if (data.radical !== undefined) {
      updates.push('radical = ?')
      params.push(data.radical)
    }
    if (updates.length === 0) return this.findById(id)
    params.push(id)
    db.prepare(`
      UPDATE zi SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)
    const updated = this.findById(id)
    // 同步到静态数据 meta.json（仅文件已存在时更新）
    syncZiMeta(updated)
    return updated
  },

  delete(id) {
    getDb().prepare('DELETE FROM zi WHERE id = ?').run(id)
    return { success: true }
  }
}
