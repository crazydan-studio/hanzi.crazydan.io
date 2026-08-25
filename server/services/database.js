import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import * as fontkit from 'fontkit'
import { compressTrajectory, decompressTrajectory, inkBoxFromGlyph, TRAJECTORY_VERSION } from './trajectory.js'
import { HANZI_DB_PATH, KAI_FONT_WOFF2_PATH } from '../../paths.js'

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

  // 轨迹格式迁移: v1（无 box）→ v2（记录光栅实测盒），旧格式/损坏数据删除
  migrateStrokeV2()
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

// 轨迹格式迁移（幂等）: 版本低于当前或缺失 box 的旧轨迹升级为 v2 ——
// 用中易楷体字形度量近似填充光栅实测盒（无法测量或数据损坏的删除）
function migrateStrokeV2() {
  const rows = db.prepare(`
    SELECT s.id, z.zi, s.trajectory_data
    FROM strokes s JOIN zi z ON z.id = s.zi_id
  `).all()
  const outdated = rows.filter(r => {
    let traj
    try { traj = decompressTrajectory(r.trajectory_data) } catch { return true }
    if (!traj || !Number.isInteger(traj.brush) || traj.brush < 0) return true
    return traj.version !== TRAJECTORY_VERSION || !traj.box
  })
  if (outdated.length === 0) return

  // 惰性加载中易楷体（仅迁移时）
  const font = loadKaiFontForMigration()
  const del = db.prepare('DELETE FROM strokes WHERE id = ?')
  const update = db.prepare('UPDATE strokes SET trajectory_data = ? WHERE id = ?')
  let upgraded = 0
  for (const r of outdated) {
    let traj
    try { traj = decompressTrajectory(r.trajectory_data) } catch { traj = null }
    if (traj && font) {
      const box = inkBoxFromGlyph(font, r.zi)
      if (box) {
        traj.version = TRAJECTORY_VERSION
        traj.box = box
        update.run(compressTrajectory(traj), r.id)
        upgraded++
        continue
      }
    }
    del.run(r.id)   // 无法升级的旧格式/损坏数据删除
  }
  console.log(
    `DB migrated: stroke format v${TRAJECTORY_VERSION}` +
    ` — 升级 ${upgraded} 条，删除 ${outdated.length - upgraded} 条旧格式/损坏笔画数据`
  )
}

// 加载中易楷体（迁移近似测量用; 字体缺失时跳过升级，仅删除旧数据）
function loadKaiFontForMigration() {
  try {
    return fontkit.openSync(KAI_FONT_WOFF2_PATH)
  } catch (e) {
    console.warn('加载中易楷体失败，旧轨迹将删除: ' + e.message)
    return null
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
