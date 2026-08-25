import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { compressTrajectory, decompressTrajectory, TRAJECTORY_VERSION } from './Trajectory.js'
import { HANZI_DB_PATH } from '../../paths.js'

let db

// 支持指定数据库路径（导入脚本等场景）；缺省用默认路径
export function initDatabase(dbPath = HANZI_DB_PATH) {
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // 使用 Node.js 原生 sqlite 模块（node:sqlite，Node >= 22.5）
  db = new DatabaseSync(dbPath)

  // SQLite优化配置（node:sqlite 无 db.pragma()，统一走 exec）
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  // 打开时先 checkpoint WAL（崩溃中断的写入得以安全落盘，避免数据滞留/丢失）
  db.exec('PRAGMA wal_checkpoint(PASSIVE)')

  // 旧表名迁移: characters → zi（含列 character → zi、character_id → zi_id）
  migrateZiTable()
  // 结构编码范围迁移: 半包围按包围方向细分（编码 10-16）后扩展 CHECK 取值
  migrateStructureRange()

  db.exec(`
    CREATE TABLE IF NOT EXISTS zi (
      id INTEGER PRIMARY KEY,                   -- id = 汉字 unicode 数值
      zi TEXT NOT NULL UNIQUE,
      pinyin TEXT NOT NULL DEFAULT '[]',        -- 读音 JSON 数组（数字声调，可多音）
      used_weight INTEGER NOT NULL DEFAULT 0,   -- 使用频率权重
      structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 99),
      radical TEXT NOT NULL DEFAULT '',         -- 部首（书写页可编辑）
      total_stroke_count INTEGER NOT NULL DEFAULT 0    -- 笔画数
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_zi_zi_unique
      ON zi(zi);

    CREATE TABLE IF NOT EXISTS strokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zi_id INTEGER NOT NULL,
      stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
      stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
      trajectory_data BLOB NOT NULL,            -- 轨迹 JSON 经 zlib 压缩存储
      FOREIGN KEY (zi_id) REFERENCES zi(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_strokes_order_unique
      ON strokes(zi_id, stroke_order);
    CREATE INDEX IF NOT EXISTS idx_strokes_zi_id
      ON strokes(zi_id);
  `)

  // 轨迹数据清理: 损坏数据删除; 旧版本（v1，无 box）数据保留——
  // 光栅实测盒仅能由前端在真实字体渲染后测得，由 web 端书写页自动升级（见 strokeEditor.js）
  cleanStrokeTrajectories()
  return db
}

// 旧表名迁移: characters → zi（列 character → zi、character_id → zi_id），
// 索引名同步重建（幂等）
function migrateZiTable() {
  const hasOld = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'characters'"
  ).all().length > 0
  if (!hasOld) return
  db.exec('ALTER TABLE characters RENAME TO zi')
  db.exec('ALTER TABLE zi RENAME COLUMN character TO zi')
  db.exec('ALTER TABLE strokes RENAME COLUMN character_id TO zi_id')
  db.exec('DROP INDEX IF EXISTS idx_characters_character_unique')
  db.exec('DROP INDEX IF EXISTS idx_strokes_character_id')
  console.log('DB migrated: characters table → zi')
}

// 结构编码范围迁移（幂等）: 旧库 CHECK 限制 0-9 无法存入半包围细分（10-16），
// 重建 zi 表扩展取值范围；同时修复此前迁移可能破坏的 strokes 外键
// （ALTER TABLE RENAME 会把外键改写为 REFERENCES zi_old，须检测并重建）
function migrateStructureRange() {
  const ziSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'zi'"
  ).get()?.sql
  const strokesSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strokes'"
  ).get()?.sql
  // 精确匹配旧约束（注意: BETWEEN 0 AND 99 含子串 BETWEEN 0 AND 9，须带边界）
  const needZi = ziSql && !/CHECK\(structure BETWEEN 0 AND 99\)/.test(ziSql)
  const badFk = strokesSql && !/REFERENCES zi\(id\)/.test(strokesSql)
  if (!needZi && !badFk) return
  withTransaction(() => {
    if (needZi) {
      // 用新表名重建后替换，避免 RENAME 改写其他表的外键引用
      db.exec(`
        CREATE TABLE zi_new (
          id INTEGER PRIMARY KEY,
          zi TEXT NOT NULL UNIQUE,
          pinyin TEXT NOT NULL DEFAULT '[]',
          used_weight INTEGER NOT NULL DEFAULT 0,
          structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 99),
          radical TEXT NOT NULL DEFAULT '',
          total_stroke_count INTEGER NOT NULL DEFAULT 0
        )
      `)
      db.exec(`INSERT INTO zi_new
        (id, zi, pinyin, used_weight, structure, radical, total_stroke_count)
        SELECT id, zi, pinyin, used_weight, structure, radical, total_stroke_count FROM zi`)
      db.exec('DROP TABLE zi')
      db.exec('ALTER TABLE zi_new RENAME TO zi')
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_zi_zi_unique ON zi(zi)')
    }
    if (badFk) {
      // 重建 strokes（外键正确指向 zi），原数据保留
      db.exec(`
        CREATE TABLE strokes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          zi_id INTEGER NOT NULL,
          stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
          stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
          trajectory_data BLOB NOT NULL,
          FOREIGN KEY (zi_id) REFERENCES zi(id) ON DELETE CASCADE
        )
      `)
      db.exec('INSERT INTO strokes_new SELECT * FROM strokes')
      db.exec('DROP TABLE strokes')
      db.exec('ALTER TABLE strokes_new RENAME TO strokes')
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_strokes_order_unique ON strokes(zi_id, stroke_order)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_strokes_zi_id ON strokes(zi_id)')
    }
  })
  console.log('DB migrated: zi.structure 取值范围扩展 / strokes 外键修复')
}

// 轨迹数据清理（幂等）: 无法解压/字段非法的损坏数据删除;
// 版本低于当前（v1，无光栅实测盒 r）的数据保留，等待 web 端书写页在获得真实光栅实测盒后升级
function cleanStrokeTrajectories() {
  const rows = db.prepare('SELECT id, trajectory_data FROM strokes').all()
  const corrupted = rows.filter(r => {
    let traj
    try { traj = decompressTrajectory(r.trajectory_data) } catch { return true }
    return !traj || !Number.isInteger(traj.b) || traj.b < 0
  })
  if (corrupted.length === 0) return
  const del = db.prepare('DELETE FROM strokes WHERE id = ?')
  for (const r of corrupted) del.run(r.id)
  console.log(`已删除 ${corrupted.length} 条损坏笔画数据`)
}

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase() {
  if (db) db.close()
}

// 事务助手（node:sqlite 无 db.transaction()，手动 BEGIN/COMMIT/ROLLBACK）
export function withTransaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// 行转换助手：将SQLite行转为API响应对象
export function serializeZi(row) {
  if (!row) return null
  const { pinyin, ...rest } = row
  let pinyinArr = []
  try { pinyinArr = JSON.parse(pinyin) } catch { pinyinArr = pinyin ? [pinyin] : [] }
  return {
    ...rest,
    pinyin: pinyinArr
  }
}

export function serializeStroke(row) {
  if (!row) return null
  const { trajectory_data, ...rest } = row
  return {
    ...rest,
    trajectory_data: decompressTrajectory(trajectory_data)
  }
}
