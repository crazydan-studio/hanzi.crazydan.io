import { getDb, serializeCharacter, serializeStroke } from './database.js'

export const characterService = {
  // 列表: 按权重降序，支持 按字/拼音搜索 + 笔画图过滤，附带笔画（缩略图用）
  // has_strokes: '1'/'true' 完整(cnt==total) | '2'/'partial' 仅含部分笔画图(cnt>0且不等) | '0'/'false' 无笔画图(cnt=0)
  findAll({ page = 1, limit = 20, search, has_strokes }) {
    const db = getDb()
    const conditions = ['c.deleted_at IS NULL']
    const params = []

    if (search) {
      // 匹配字 或 拼音（无声调 JSON 数组）或 读音
      conditions.push(`(c.character LIKE ? OR c.pinyin_plain LIKE ? OR c.pinyin LIKE ?)`)
      const term = `%${search}%`
      params.push(term, term, term)
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
          SELECT character_id, COUNT(*) AS cnt FROM strokes
          WHERE deleted_at IS NULL GROUP BY character_id
        ) sc ON sc.character_id = c.id
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
      `SELECT COUNT(*) AS total FROM characters c ${strokeJoin} ${where}`
    ).get(...params)

    const offset = (page - 1) * limit
    const rows = db.prepare(`
      SELECT c.* FROM characters c
      ${strokeJoin} ${where}
      ORDER BY c.used_weight DESC, c.id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    // 附带每字的笔画（trajectory 供前端小图渲染）
    const data = rows.map(row => {
      const char = serializeCharacter(row)
      const strokes = db.prepare(
        'SELECT * FROM strokes WHERE character_id = ? AND deleted_at IS NULL ORDER BY stroke_order'
      ).all(char.id).map(serializeStroke)
      return { ...char, strokes }
    })

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }
  },

  findById(id) {
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL'
    ).get(id)
    if (!row) return null

    const strokes = db.prepare(
      'SELECT * FROM strokes WHERE character_id = ? AND deleted_at IS NULL ORDER BY stroke_order'
    ).all(id).map(serializeStroke)

    return { ...serializeCharacter(row), strokes }
  },

  findByCharacter(char) {
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM characters WHERE character = ? AND deleted_at IS NULL'
    ).get(char)
    if (!row) return null
    return this.findById(row.id)
  },

  create(data) {
    const db = getDb()
    const id = data.character.codePointAt(0)
    db.prepare(`
      INSERT INTO characters (id, character, pinyin, pinyin_plain, used_weight, structure, total_stroke_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.character,
      JSON.stringify(data.pinyin || []),
      JSON.stringify(data.pinyin_plain || []),
      data.used_weight ?? 0, data.structure ?? 0, data.total_stroke_count ?? 0)
    return this.findById(id)
  },

  // 仅允许更新 structure（其余只读）
  update(id, data) {
    const db = getDb()
    if (data.structure === undefined) return this.findById(id)
    db.prepare(`
      UPDATE characters SET structure = ?, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(data.structure, id)
    return this.findById(id)
  },

  delete(id) {
    const db = getDb()
    db.prepare(
      "UPDATE characters SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL"
    ).run(id)
    return { success: true }
  }
}
