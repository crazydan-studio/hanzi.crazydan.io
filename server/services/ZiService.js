import { getDb, serializeZi } from './database.js'
import { strokeService } from './StrokeService.js'
import { syncZiMeta, removeZiStatic } from './staticSync.js'

export const ziService = {
  // 列表: 按权重降序，支持 按字/拼音搜索 + 笔画图过滤，附带笔画（缩略图用）
  // has_strokes: '1' 完整(cnt==total) | '2' 仅含部分笔画图(cnt>0且不等) | '0' 无笔画图(cnt=0)
  findAll({ page = 1, limit = 20, search, has_strokes }) {
    const db = getDb()
    const conditions = ['1=1']
    const params = []

    if (search) {
      // zi 恒为单字符（schema 强制）: LIKE 的 %term% 对单字即精确匹配，多字符输入不可能命中，
      // 故单字符搜索直接按 unicode（id = 码点）查询——命中 rowid 主键索引，避免视图全表扫描;
      // 其余输入仅可能命中拼音（读音 JSON 文本）
      const chars = [...search]
      if (chars.length === 1) {
        conditions.push('(z.id = ? OR z.pinyin LIKE ?)')
        params.push(search.codePointAt(0), `%${search}%`)
      } else {
        conditions.push('z.pinyin LIKE ?')
        params.push(`%${search}%`)
      }
    }

    let strokeJoin = ''
    if (has_strokes !== undefined) {
      const wantComplete = has_strokes === '1'
      const wantPartial = has_strokes === '2'
      // 笔画单字单行: stroke_count 列直接比较，无需聚合子查询
      // 完整: 实际笔画数 == total_stroke_count
      // 仅含部分笔画图: 有笔画记录 且 数量与预期不相等
      // 无笔画图: 无笔画记录（单行表无行）或笔画数为 0
      strokeJoin = 'LEFT JOIN strokes sc ON sc.zi_id = z.id'
      if (wantComplete) {
        conditions.push('sc.stroke_count = z.total_stroke_count')
      } else if (wantPartial) {
        conditions.push('sc.stroke_count > 0 AND sc.stroke_count != z.total_stroke_count')
      } else {
        conditions.push('(sc.stroke_count IS NULL OR sc.stroke_count = 0)')
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`
    const { total } = db.prepare(
      `SELECT COUNT(*) AS total FROM zi z ${strokeJoin} ${where}`
    ).get(...params)

    const offset = (page - 1) * limit
    const rows = db.prepare(`
      SELECT z.* FROM zi z
      ${strokeJoin} ${where}
      ORDER BY z.used_weight DESC, z.is_traditional ASC, z.id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    // 附带每字的笔画（trajectory 供前端小图渲染）; 轨迹损坏时 findByZi 按空处理
    const data = rows.map(row => {
      const zi = serializeZi(row)
      return { ...zi, strokes: strokeService.findByZi(zi.id) }
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
    return { ...serializeZi(row), strokes: strokeService.findByZi(id) }
  },

  findByZi(zi) {
    const db = getDb()
    // 按字查询 = 按 unicode 查询（id 即码点，命中 rowid 主键）; 无须 LIKE
    const row = db.prepare('SELECT * FROM zi WHERE id = ?').get(zi.codePointAt(0))
    if (!row) return null
    return this.findById(row.id)
  },

  create(data) {
    const db = getDb()
    const id = data.zi.codePointAt(0)
    db.prepare(`
      INSERT INTO meta_zi (id, pinyin, used_weight, structure, total_stroke_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(id,
      JSON.stringify(data.pinyin || []),
      data.used_weight ?? 0, data.structure ?? 0, data.total_stroke_count ?? 0)
    return this.findById(id)
  },

  // 更新: 结构/部首/读音/笔画数（其余只读，来自字典导入）
  // 返回 { zi, changed }（无字段变更时不写库、不同步、不广播）
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
    if (data.pinyin !== undefined) {
      updates.push('pinyin = ?')
      params.push(JSON.stringify(data.pinyin))
    }
    if (data.total_stroke_count !== undefined) {
      updates.push('total_stroke_count = ?')
      params.push(data.total_stroke_count)
    }
    if (updates.length === 0) {
      return { zi: this.findById(id), changed: false }
    }
    params.push(id)
    db.prepare(`
      UPDATE meta_zi SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)
    const zi = this.findById(id)
    if (zi) {
      // 同步到静态数据 index.json（仅文件已存在时更新）
      syncZiMeta(zi)
    }
    return { zi, changed: zi !== null }
  },

  // 删除（幂等）: DB 行删除（笔画随外键级联），并同步移除静态数据条目
  delete(id) {
    const db = getDb()
    const existed = db.prepare('SELECT 1 FROM meta_zi WHERE id = ?').get(id)
    if (!existed) return { success: true, changed: false }
    db.prepare('DELETE FROM meta_zi WHERE id = ?').run(id)
    removeZiStatic(id)
    return { success: true, changed: true }
  }
}
