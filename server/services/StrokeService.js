import { getDb, withTransaction } from './database.js'
import { AppError } from '../middleware/errorHandler.js'
import { syncZiStrokes } from './staticSync.js'
import { compressCharTrajectory, decompressCharTrajectory } from './Trajectory.js'

// 笔画单字单行: 一汉字一行，整字笔画聚合为单 BLOB（结构同静态 strokes 分片，
// { v, r: [w,h], s: [[t, [b, flatPts]], ...] }，序号由数组下标推出）。
// API 层仍以逐条笔画对象交互（id = stroke_order，服务端权威编号 1..N）。
export const strokeService = {
  // 读取单行并按笔画序号展开为 API 对象; 单行轨迹损坏时返回空列表
  // （信息/列表等读路径不受坏数据影响，巡检日志见 database.checkStrokeTrajectories）
  findByZi(ziId) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM strokes WHERE zi_id = ?').get(ziId)
    if (!row) return []
    let traj
    try {
      traj = decompressCharTrajectory(row.trajectory_data)
    } catch (e) {
      console.warn(`汉字 ${ziId} 轨迹解压失败（按无笔画处理）: ${e.message}`)
      return []
    }
    return traj.strokes.map((s, i) => ({
      id: i + 1,
      zi_id: ziId,
      stroke_order: i + 1,
      stroke_type: s.t,
      trajectory_data: {
        v: traj.v,
        b: s.d.b,
        r: traj.r,
        p: s.d.p
      }
    }))
  },

  // 校验字符存在性
  assertZiExists(ziId) {
    const db = getDb()
    const exists = db.prepare('SELECT id FROM zi WHERE id = ?').get(ziId)
    if (!exists) throw new AppError(404, 'NOT_FOUND', 'Zi not found')
  },

  // 按 id(=stroke_order) + 所属字符查找（用于校验笔画归属）
  findByIdAndZi(id, ziId) {
    return this.findByZi(ziId).find(s => s.id === Number(id)) || null
  },

  // 读取单行轨迹并解压: 返回 { r, strokes: [{ o, t, d: { b, p } }] }（绝对坐标）或 null;
  // 单行轨迹损坏时按无数据处理（读路径不抛错）
  _loadChar(ziId) {
    const db = getDb()
    const row = db.prepare('SELECT * FROM strokes WHERE zi_id = ?').get(ziId)
    if (!row) return null
    try {
      const traj = decompressCharTrajectory(row.trajectory_data)
      return { r: traj.r, strokes: traj.strokes }
    } catch (e) {
      console.warn(`汉字 ${ziId} 轨迹解压失败（按无数据处理）: ${e.message}`)
      return null
    }
  },

  // 按 stroke_order 排序并重编号 1..N 后写回单行（序号 = 数组下标，必须连续）
  _saveChar(ziId, r, strokes) {
    const db = getDb()
    const ordered = strokes
      .slice()
      .sort((a, b) => a.o - b.o)
      .map((s, i) => ({ o: i + 1, t: s.t, d: s.d }))
    const blob = compressCharTrajectory(r, ordered)
    db.prepare(`
      INSERT INTO strokes (zi_id, stroke_count, trajectory_data)
      VALUES (?, ?, ?)
      ON CONFLICT(zi_id) DO UPDATE SET
        stroke_count = excluded.stroke_count,
        trajectory_data = excluded.trajectory_data
    `).run(ziId, ordered.length, blob)
    return ordered
  },

  // 新增单笔: 仅接受顺序追加（序号 = 现存最大序号 + 1）——
  // 中间插入/跳号会触发静默重编号（连带改变既有笔画 id），统一经 /reorder 调整
  create(ziId, data) {
    this.assertZiExists(ziId)
    const loaded = this._loadChar(ziId)
    const strokes = loaded?.strokes ?? []
    const nextOrder = Math.max(0, ...strokes.map(s => s.o)) + 1
    if (data.stroke_order !== nextOrder) {
      throw new AppError(400, 'VALIDATION_ERROR',
        `Invalid stroke_order ${data.stroke_order}: 新笔画仅支持顺序追加（下一序号 ${nextOrder}），调整顺序请用 /reorder`)
    }
    strokes.push({
      o: nextOrder,
      t: data.stroke_type,
      d: { b: data.trajectory_data.b ?? 0, p: data.trajectory_data.p }
    })
    const r = data.trajectory_data.r ?? loaded?.r ?? null
    this._saveChar(ziId, r, strokes)
    // 同步到静态数据 strokes 分片（仅分片文件已存在时更新）
    syncZiStrokes(ziId, this.findByZi(ziId))
    return this.findByIdAndZi(nextOrder, ziId)
  },

  // 批量创建（顺序追加一组: nextOrder..，事务）; 返回该字全部笔画
  createBatch(ziId, strokesData) {
    this.assertZiExists(ziId)
    const loaded = this._loadChar(ziId)
    const strokes = loaded?.strokes ?? []
    const nextOrder = strokes.length + 1   // 现存笔画序号恒为连续 1..N
    // 新增须为自 nextOrder 起的连续序号（跳号/重排请走 reorder）
    strokesData.forEach((s, i) => {
      if (s.stroke_order !== nextOrder + i) {
        throw new AppError(400, 'VALIDATION_ERROR',
          `Invalid stroke_order ${s.stroke_order}: 新笔画须自序号 ${nextOrder} 起连续追加（调整顺序请用 /reorder）`)
      }
    })
    strokes.push(...strokesData.map(s => ({
      o: s.stroke_order,
      t: s.stroke_type,
      d: { b: s.trajectory_data.b ?? 0, p: s.trajectory_data.p }
    })))
    const r = strokesData[0]?.trajectory_data.r ?? loaded?.r ?? null
    // 事务（node:sqlite 无 db.transaction()，用 withTransaction 助手）
    withTransaction(() => {
      this._saveChar(ziId, r, strokes)
    })
    // 同步到静态数据 strokes 分片（仅分片文件已存在时更新）
    syncZiStrokes(ziId, this.findByZi(ziId))
    return this.findByZi(ziId)
  },

  // 更新单笔（类型/轨迹）; 序号的调整统一经 /reorder（不经本接口）
  update(ziId, id, data) {
    this.assertZiExists(ziId)
    const loaded = this._loadChar(ziId)
    const strokes = loaded?.strokes ?? []
    const idx = strokes.findIndex(s => s.o === Number(id))
    if (idx === -1) return null
    if (data.stroke_type !== undefined) strokes[idx].t = data.stroke_type
    if (data.trajectory_data !== undefined) {
      strokes[idx].d = {
        b: data.trajectory_data.b ?? strokes[idx].d.b ?? 0,
        p: data.trajectory_data.p ?? strokes[idx].d.p
      }
    }
    const r = data.trajectory_data?.r ?? loaded.r
    this._saveChar(ziId, r, strokes)
    // 同步到静态数据 strokes 分片（仅分片文件已存在时更新）
    syncZiStrokes(ziId, this.findByZi(ziId))
    return this.findByIdAndZi(id, ziId)
  },

  delete(ziId, id) {
    this.assertZiExists(ziId)
    const loaded = this._loadChar(ziId)
    if (!loaded) return { success: true }
    const strokes = loaded.strokes.filter(s => s.o !== Number(id))
    if (strokes.length === 0) {
      getDb().prepare('DELETE FROM strokes WHERE zi_id = ?').run(ziId)
    } else {
      this._saveChar(ziId, loaded.r, strokes)
    }
    // 同步到静态数据 strokes 分片（仅分片文件已存在时更新）
    syncZiStrokes(ziId, this.findByZi(ziId))
    return { success: true }
  },

  // 清空该字全部笔画: 单行原子删除（无逐笔删除的重编号竞态），并同步静态数据
  clearAll(ziId) {
    this.assertZiExists(ziId)
    const db = getDb()
    db.prepare('DELETE FROM strokes WHERE zi_id = ?').run(ziId)
    syncZiStrokes(ziId, [])
    return { success: true }
  },

  // 重排笔画顺序（事务）: strokeIds 按新顺序排列，重编号为 1..N
  reorder(ziId, strokeIds) {
    this.assertZiExists(ziId)
    const loaded = this._loadChar(ziId)
    const strokes = loaded?.strokes ?? []
    // 校验: 数量一致、无重复、全部属于该汉字
    if (strokes.length !== strokeIds.length ||
        new Set(strokeIds).size !== strokeIds.length) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid strokeIds: length or duplicates mismatch')
    }
    const known = new Set(strokes.map(s => s.o))
    const unknown = strokeIds.filter(id => !known.has(Number(id)))
    if (unknown.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown stroke ids: ${unknown.join(', ')}`)
    }
    const byOrder = new Map(strokes.map(s => [s.o, s]))
    const ordered = strokeIds.map((id, i) => ({ ...byOrder.get(Number(id)), o: i + 1 }))
    withTransaction(() => {
      this._saveChar(ziId, loaded.r, ordered)
    })
    const result = this.findByZi(ziId)
    // 同步到静态数据 strokes 分片（仅分片文件已存在时更新）
    syncZiStrokes(ziId, result)
    return result
  }
}
