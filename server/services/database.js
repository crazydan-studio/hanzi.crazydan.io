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

  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY,                   -- id = 汉字 unicode 数值
      character TEXT NOT NULL UNIQUE,
      pinyin TEXT NOT NULL DEFAULT '[]',        -- 读音 JSON 数组（数字声调，可多音）
      used_weight INTEGER NOT NULL DEFAULT 0,   -- 使用频率权重
      structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 9),
      radical TEXT NOT NULL DEFAULT '',         -- 部首（书写页可编辑）
      total_stroke_count INTEGER NOT NULL DEFAULT 0    -- 笔画数
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_character_unique
      ON characters(character);

    CREATE TABLE IF NOT EXISTS strokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
      stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
      trajectory_data BLOB NOT NULL,            -- 轨迹 JSON 经 zlib 压缩存储
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_strokes_order_unique
      ON strokes(character_id, stroke_order);
    CREATE INDEX IF NOT EXISTS idx_strokes_character_id
      ON strokes(character_id);
  `)

  // 迁移: 精简表结构 → 轨迹增量编码（v6）→ 坐标精度 ×1000（v7）
  migrateSlimSchema()
  migrateStrokeV6()
  migrateStrokeV7()
  // SQLite 页级整理: 自动收缩 + 压缩文件（删除不再留空闲页）
  db.exec('PRAGMA auto_vacuum = FULL')
  db.exec('VACUUM')
  return db
}

// 迁移: 坐标精度降低（v7）——x/y 由 ×10000（0.05px）降至 ×1000（0.5px），
// 与抽稀阈值一致，整数小 10 倍、存储更省
function migrateStrokeV7() {
  const rows = db.prepare('SELECT id, trajectory_data FROM strokes').all()
  let changed = false
  const update = db.prepare('UPDATE strokes SET trajectory_data = ? WHERE id = ?')
  for (const r of rows) {
    let traj
    try { traj = decompressTrajectory(r.trajectory_data) } catch { continue }
    if (!traj || traj.version === TRAJECTORY_VERSION) continue
    traj.version = TRAJECTORY_VERSION
    traj.points = traj.points.map(pt => [
      Math.round(pt[0] / 10),
      Math.round(pt[1] / 10),
      pt[2],
      pt[3]
    ])
    update.run(compressTrajectory(traj), r.id)
    changed = true
  }
  if (changed) {
    console.log('DB migrated: stroke coords v7 (x/y ×1000)')
  }
}

// 迁移: 轨迹增量编码（v6）——存量 v5 压缩数据重压缩为增量编码格式
function migrateStrokeV6() {
  const rows = db.prepare('SELECT id, trajectory_data FROM strokes').all()
  let changed = false
  const update = db.prepare('UPDATE strokes SET trajectory_data = ? WHERE id = ?')
  for (const r of rows) {
    let traj
    try { traj = decompressTrajectory(r.trajectory_data) } catch { continue }
    if (!traj || traj.version === TRAJECTORY_VERSION) continue
    update.run(compressTrajectory(traj), r.id)
    changed = true
  }
  if (changed) {
    console.log('DB migrated: stroke coords v6 (delta encoding)')
  }
}

// 迁移: 精简表结构（删除 created_at/updated_at/deleted_at，characters 另删 pinyin_plain），
// 轨迹压缩为 BLOB；以重建表方式迁移
function migrateSlimSchema() {
  const cols = db.prepare('PRAGMA table_info(characters)').all()
  if (!cols.some(c => c.name === 'created_at')) return   // 已精简

  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    const chars = db.prepare('SELECT * FROM characters').all()
    const strokes = db.prepare('SELECT * FROM strokes').all()

    db.exec('DROP TABLE IF EXISTS strokes')
    db.exec('DROP TABLE IF EXISTS characters')
    db.exec(`
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY,
        character TEXT NOT NULL UNIQUE,
        pinyin TEXT NOT NULL DEFAULT '[]',
        used_weight INTEGER NOT NULL DEFAULT 0,
        structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 9),
        radical TEXT NOT NULL DEFAULT '',
        total_stroke_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX idx_characters_character_unique ON characters(character);
      CREATE TABLE strokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
        stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
        trajectory_data BLOB NOT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_strokes_order_unique ON strokes(character_id, stroke_order);
      CREATE INDEX idx_strokes_character_id ON strokes(character_id);
    `)
    const insertChar = db.prepare(`
      INSERT INTO characters (id, character, pinyin, used_weight, structure, radical, total_stroke_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const r of chars) {
      insertChar.run(r.id, r.character, r.pinyin, r.used_weight,
        r.structure, r.radical ?? '', r.total_stroke_count)
    }
    const insertStroke = db.prepare(`
      INSERT INTO strokes (id, character_id, stroke_order, stroke_type, trajectory_data)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const r of strokes) {
      let traj
      try { traj = decompressTrajectory(r.trajectory_data) } catch { continue }
      insertStroke.run(r.id, r.character_id, r.stroke_order, r.stroke_type,
        compressTrajectory(traj))
    }
    db.exec('COMMIT')
    console.log('DB migrated: slim schema (no timestamps/deleted_at/pinyin_plain, trajectory compressed)')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
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
export function serializeCharacter(row) {
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
