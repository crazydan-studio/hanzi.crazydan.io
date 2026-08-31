import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { decompressCharTrajectory } from './Trajectory.js'
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
  // 繁体字标记列补充（旧库升级; 新库建表时已含）
  migrateTraditionalColumn()
  // 实体表迁移: zi → meta_zi（去掉 zi 列，汉字由视图经 char(id) 计算）
  migrateMetaZiTable()

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_zi (
      id INTEGER PRIMARY KEY,                   -- id = 汉字 unicode 数值
      pinyin TEXT NOT NULL DEFAULT '[]',        -- 读音 JSON 数组（数字声调，可多音）
      used_weight INTEGER NOT NULL DEFAULT 0,   -- 使用频率权重
      structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 99),
      radical TEXT NOT NULL DEFAULT '',         -- 部首（书写页可编辑）
      total_stroke_count INTEGER NOT NULL DEFAULT 0,  -- 笔画数
      is_traditional INTEGER NOT NULL DEFAULT 0        -- 是否为繁体字（以 pinyin-dict 为准）
    );

    -- zi 为视图: 汉字由 id（unicode 数值）经 char(id) 计算，不在实体表冗余存储
    CREATE VIEW IF NOT EXISTS zi AS
      SELECT id, char(id) AS zi,
             pinyin, used_weight, structure, radical, total_stroke_count, is_traditional
      FROM meta_zi;

    -- 笔画单字单行: 一汉字一行，整字笔画聚合为单 BLOB（结构同静态 strokes 分片:
    --   { v, r: [w,h], s: [[t, [b, flatPts]], ...] }，序号由数组下标推出）;
    -- stroke_count 单独成列供过滤/关联查询，无需解压 BLOB
    CREATE TABLE IF NOT EXISTS strokes (
      zi_id INTEGER PRIMARY KEY,
      stroke_count INTEGER NOT NULL,
      trajectory_data BLOB NOT NULL,            -- 整字轨迹经 zlib 压缩存储
      FOREIGN KEY (zi_id) REFERENCES meta_zi(id) ON DELETE CASCADE
    );
  `)

  // 繁体字标记列补充（幂等）: 旧库的 zi 表无 is_traditional 列，补列并默认 0;
  // 标记值本身由 import-pinyin 以 pinyin-dict 为准写入
  function migrateTraditionalColumn() {
    // 旧库的 zi 表才需要补列; meta_zi 已存在（新结构）或 zi 为视图/不存在时跳过
    const ziIsTable = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'zi'"
    ).all().length > 0
    if (!ziIsTable) return
    const cols = db.prepare('PRAGMA table_info(zi)').all()
    if (cols.some(c => c.name === 'is_traditional')) return
    db.exec('ALTER TABLE zi ADD COLUMN is_traditional INTEGER NOT NULL DEFAULT 0')
    console.log('DB migrated: zi 表补充 is_traditional 列')
  }

// 轨迹数据校验: 不删除任何数据——v1（无光栅实测盒 r）轨迹保留，
  // 等待 web 端书写页在获得真实背景字光栅实测盒后升级（见 strokeEditor.js）;
  // 解压失败/字段异常仅记录日志，避免误删
  checkStrokeTrajectories()
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

// 实体表迁移: zi → meta_zi（幂等）
// 目标结构: 实体表 meta_zi 不含 zi 列（id 即 unicode 数值），汉字由视图 zi 经 char(id) 计算。
// 去除 zi 列可省去每行 4 字节存储与两个重复的唯一索引（UNIQUE 约束自动索引 + idx_zi_zi_unique）；
// 查询改走 id（rowid 主键），性能不降反升。
function migrateMetaZiTable() {
  const hasMeta = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta_zi'"
  ).all().length > 0
  if (hasMeta) return
  const hasLegacy = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'zi'"
  ).all().length > 0
  if (!hasLegacy) return   // 全新库: 建表块直接创建 meta_zi + 视图

  // 重建期间关闭外键: DROP TABLE 会隐式执行 DELETE FROM，触发 strokes 的
  // ON DELETE CASCADE 级联清空——关闭后级联不生效，strokes 数据保留
  // （外键为连接级设置，须在事务外切换）
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    withTransaction(() => {
      // 1. 旧表更名: SQLite 自动把 strokes 等表的外键引用改写为 meta_zi
      db.exec('ALTER TABLE zi RENAME TO meta_zi')
      // 2. 重建去 zi 列（DROP COLUMN 不支持含 UNIQUE 约束的列，整体重建）;
      //    DROP TABLE 顺带删除旧 zi 列上的两个重复唯一索引
      db.exec(`
        CREATE TABLE meta_zi_new (
          id INTEGER PRIMARY KEY,
          pinyin TEXT NOT NULL DEFAULT '[]',
          used_weight INTEGER NOT NULL DEFAULT 0,
          structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 99),
          radical TEXT NOT NULL DEFAULT '',
          total_stroke_count INTEGER NOT NULL DEFAULT 0,
          is_traditional INTEGER NOT NULL DEFAULT 0
        )
      `)
      db.exec(`INSERT INTO meta_zi_new
        (id, pinyin, used_weight, structure, radical, total_stroke_count, is_traditional)
        SELECT id, pinyin, used_weight, structure, radical, total_stroke_count, is_traditional FROM meta_zi`)
      db.exec('DROP TABLE meta_zi')
      db.exec('ALTER TABLE meta_zi_new RENAME TO meta_zi')
    })
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  console.log('DB migrated: zi 表 → meta_zi 实体表 + zi 视图（zi 列改由 char(id) 计算）')
}

// 轨迹数据校验（幂等）: 不删除任何数据——
// 解压失败/字段异常仅记录日志（数据保留待人工处理，避免误删）
function checkStrokeTrajectories() {
  const rows = db.prepare('SELECT zi_id, trajectory_data FROM strokes').all()
  let broken = 0
  for (const r of rows) {
    let traj
    try {
      traj = decompressCharTrajectory(r.trajectory_data)
    } catch (e) {
      broken++
      console.warn(`汉字 ${r.zi_id} 轨迹解压失败（保留待处理）: ${e.message}`)
      continue
    }
    if (!traj || !Array.isArray(traj.strokes) || traj.strokes.length === 0 ||
        traj.strokes.some(s => !Number.isInteger(s.d.b) || s.d.b < 0)) {
      broken++
      console.warn(`汉字 ${r.zi_id} 轨迹字段异常（保留待处理）`)
    }
  }
  if (broken > 0) {
    console.log(`轨迹校验: ${broken} 条异常数据已保留（等待处理）`)
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
