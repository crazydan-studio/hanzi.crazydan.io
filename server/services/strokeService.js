import { getDb, serializeStroke, withTransaction } from './database.js'
import { AppError } from '../middleware/errorHandler.js'

export const strokeService = {
  findByCharacter(characterId) {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM strokes WHERE character_id = ? AND deleted_at IS NULL ORDER BY stroke_order'
    ).all(characterId)
    return rows.map(serializeStroke)
  },

  // 校验字符存在性
  assertCharacterExists(characterId) {
    const db = getDb()
    const exists = db.prepare(
      'SELECT id FROM characters WHERE id = ? AND deleted_at IS NULL'
    ).get(characterId)
    if (!exists) throw new AppError(404, 'NOT_FOUND', 'Character not found')
  },

  // 按 id + 所属字符查找（用于校验笔画归属）
  findByIdAndCharacter(id, characterId) {
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM strokes WHERE id = ? AND character_id = ? AND deleted_at IS NULL'
    ).get(id, characterId)
    return row ? serializeStroke(row) : null
  },

  create(characterId, data) {
    this.assertCharacterExists(characterId)
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO strokes (character_id, stroke_order, stroke_type, trajectory_data)
      VALUES (?, ?, ?, ?)
    `).run(characterId, data.stroke_order, data.stroke_type,
      JSON.stringify(data.trajectory_data))
    return serializeStroke(db.prepare('SELECT * FROM strokes WHERE id = ?').get(result.lastInsertRowid))
  },

  // 批量创建（事务）
  createBatch(characterId, strokes) {
    this.assertCharacterExists(characterId)
    // 顺序唯一性校验
    const orders = strokes.map(s => s.stroke_order)
    if (new Set(orders).size !== orders.length) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Duplicate stroke_order in batch')
    }
    // 与已存在笔画冲突校验
    const existing = this.findByCharacter(characterId).map(s => s.stroke_order)
    const dup = orders.filter(o => existing.includes(o))
    if (dup.length > 0) {
      throw new AppError(409, 'CONFLICT', `stroke_order conflict: ${dup.join(', ')}`)
    }

    const db = getDb()
    const insert = db.prepare(`
      INSERT INTO strokes (character_id, stroke_order, stroke_type, trajectory_data)
      VALUES (?, ?, ?, ?)
    `)
    // 事务（node:sqlite 无 db.transaction()，用 withTransaction 助手）
    const ids = withTransaction(() => {
      const result = []
      for (const s of strokes) {
        const r = insert.run(characterId, s.stroke_order, s.stroke_type,
          JSON.stringify(s.trajectory_data))
        result.push(r.lastInsertRowid)
      }
      return result
    })
    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(`SELECT * FROM strokes WHERE id IN (${placeholders})`)
      .all(...ids).map(serializeStroke)
  },

  update(id, data) {
    const db = getDb()
    const current = db.prepare('SELECT * FROM strokes WHERE id = ? AND deleted_at IS NULL').get(id)
    if (!current) return null

    const updates = []
    const params = []
    // trajectory_data 单独处理（需JSON序列化），其余字段直接透传
    if (data.trajectory_data !== undefined) {
      updates.push('trajectory_data = ?')
      params.push(JSON.stringify(data.trajectory_data))
    }
    for (const field of ['stroke_order', 'stroke_type']) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`)
        params.push(data[field])
      }
    }
    if (updates.length === 0) return serializeStroke(current)

    updates.push("updated_at = datetime('now')")
    params.push(id)
    db.prepare(`UPDATE strokes SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...params)
    return serializeStroke(db.prepare('SELECT * FROM strokes WHERE id = ?').get(id))
  },

  delete(id) {
    const db = getDb()
    db.prepare("UPDATE strokes SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id)
    return { success: true }
  },

  // 重排笔画顺序（事务）: strokeIds 按新顺序排列，stroke_order 赋值为 1..N
  reorder(characterId, strokeIds) {
    this.assertCharacterExists(characterId)
    const existing = this.findByCharacter(characterId).map(s => s.id)

    // 校验: 数量一致、无重复、全部属于该汉字
    if (existing.length !== strokeIds.length ||
        new Set(strokeIds).size !== strokeIds.length) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid strokeIds: length or duplicates mismatch')
    }
    const unknown = strokeIds.filter(id => !existing.includes(id))
    if (unknown.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown stroke ids: ${unknown.join(', ')}`)
    }

    const db = getDb()
    const update = db.prepare(
      "UPDATE strokes SET stroke_order = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL"
    )
    withTransaction(() => {
      // 先整体偏移到安全区间，再赋最终值 1..N。
      // 注意: 不能直接偏移 +N —— SQLite 逐行更新时立即检查部分唯一索引，
      // 若顺序存在缺口（如 1,3,4,5），第一行 1→5 会与尚未更新的原 order=5 冲突。
      // 偏移量取「当前最大 order + N」，保证偏移后所有值都大于原最大值，逐行无碰撞。
      const { maxOrder } = db.prepare(
        'SELECT COALESCE(MAX(stroke_order), 0) AS maxOrder FROM strokes WHERE character_id = ? AND deleted_at IS NULL'
      ).get(characterId)
      const offset = maxOrder + strokeIds.length
      db.prepare(
        "UPDATE strokes SET stroke_order = stroke_order + ?, updated_at = datetime('now') WHERE character_id = ? AND deleted_at IS NULL"
      ).run(offset, characterId)
      // 再按新顺序逐个赋最终值 1..N
      strokeIds.forEach((id, index) => update.run(index + 1, id))
    })
    return this.findByCharacter(characterId)
  }
}
