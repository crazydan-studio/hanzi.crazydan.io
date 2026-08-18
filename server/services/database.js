import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { compressTrajectory, decompressTrajectory, TRAJECTORY_VERSION } from './trajectory.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DB_DIR, 'hanzi_stroke.db')

let db

// 支持指定数据库路径（导入脚本等场景）；缺省用默认路径
export function initDatabase(dbPath = DB_PATH) {
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS zi (
      id INTEGER PRIMARY KEY,                   -- id = 汉字 unicode 数值
      zi TEXT NOT NULL UNIQUE,
      pinyin TEXT NOT NULL DEFAULT '[]',        -- 读音 JSON 数组（数字声调，可多音）
      used_weight INTEGER NOT NULL DEFAULT 0,   -- 使用频率权重
      structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 9),
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

  // 数据格式守卫: 轨迹格式版本不一致（旧格式数据）时删除，由用户重新录入
  migrateStrokeV1()
  // SQLite 页级整理: 自动收缩 + 压缩文件（删除不再留空闲页）
  db.exec('PRAGMA auto_vacuum = FULL')
  db.exec('VACUUM')
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

// 格式守卫: 轨迹版本号须为当前版本（数字 1）且带合法 brush 字段，
// 否则视为旧格式/损坏数据删除（幂等）
function migrateStrokeV1() {
  const rows = db.prepare('SELECT id, trajectory_data FROM strokes').all()
  const outdated = rows.filter(r => {
    let traj
    try { traj = decompressTrajectory(r.trajectory_data) } catch { return true }
    if (!traj || traj.version !== TRAJECTORY_VERSION) return true
    return !Number.isInteger(traj.brush) || traj.brush < 0
  })
  if (outdated.length === 0) return
  const del = db.prepare('DELETE FROM strokes WHERE id = ?')
  for (const r of outdated) del.run(r.id)
  console.log(`DB migrated: stroke format v${TRAJECTORY_VERSION} — 已删除 ${outdated.length} 条旧格式/损坏笔画数据`)
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
