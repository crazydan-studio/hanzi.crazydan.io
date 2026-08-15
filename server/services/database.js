import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { compressTrajectory, decompressTrajectory } from './trajectory.js'

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

  // 精简表结构: 去掉 created_at/updated_at/deleted_at（characters 另去 pinyin_plain），
  // 轨迹压缩为 BLOB —— 需在其他迁移之前执行，使其识别新结构后全部跳过
  migrateSlimSchema()
  // 迁移: characters 新模型（id=unicode，去 meaning/radical 等展示列）
  migrateCharactersV2()
  // 迁移: 旧 id 自增 → unicode id 后，strokes.character_id 需重映射
  migrateStrokeCharId()
  // 迁移: characters.structure 列 + strokes.stroke_type 字符串→数字编码
  migrateStructureColumn()
  migrateRadicalColumn()
  migrateStrokeTypeToInt()
  migrateStrokeSchemaV2()
  migrateStrokeCoordV3()
  migrateStrokeV4()
  migrateStrokeV5()
  // 增量编码（v6）: 存量轨迹重压缩（解压还原绝对点后再增量编码）
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
    if (!traj || traj.version === '7.0') continue
    traj.version = '7.0'
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
    if (!traj || traj.version === '6.0') continue
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
      try { traj = JSON.parse(r.trajectory_data) } catch { continue }
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

// 旧字符串笔画编码 → 新数字编码（迁移映射表，与 strokeSchema 一致）
const LEGACY_TYPE_MAP = {
  unassigned: 0, dian: 1, heng: 2, shu: 3, pie: 4, na: 5, ti: 6,
  hengzhe: 7, hengpie: 8, henggou: 9, hengzhegou: 10,
  hengzhehenggou: 18, shuzhe: 21, shugou: 22, shuwangou: 24, piezhe: 29
}

// 迁移1: characters 表新增 structure 列（旧库无此列）
// 迁移1: characters 新模型 — id=unicode，仅保留 读音/拼音/权重/结构/笔画数，
// 去掉 meaning/radical/difficulty_level/unicode_code 列。旧表重建 + strokes 映射。
function migrateCharactersV2() {
  const cols = db.prepare("PRAGMA table_info(characters)").all()
  // 已是新模型（id 即 unicode，无 meaning 列）则跳过
  if (!cols.some(c => c.name === 'meaning')) return

  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    // 备份旧数据（旧 id 自增 → 用 unicode_code 作为新 id）
    const rows = db.prepare('SELECT * FROM characters').all()
    // 旧id → unicode 映射（供 strokes.character_id 重映射）
    const idMap = new Map()
    for (const r of rows) {
      const unicode = r.unicode_code ?? r.character.codePointAt(0)
      if (unicode) idMap.set(r.id, unicode)
    }
    // 先重映射 strokes.character_id（旧id → unicode）
    if (idMap.size > 0) {
      const updateStroke = db.prepare('UPDATE strokes SET character_id = ? WHERE character_id = ?')
      for (const [oldId, unicode] of idMap) {
        updateStroke.run(unicode, oldId)
      }
    }

    db.exec(`
      DROP TABLE IF EXISTS characters;
      DROP INDEX IF EXISTS idx_characters_character_unique;
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY,
        character TEXT NOT NULL UNIQUE,
        pinyin TEXT NOT NULL DEFAULT '[]',
        pinyin_plain TEXT NOT NULL DEFAULT '[]',
        used_weight INTEGER NOT NULL DEFAULT 0,
        structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 9),
        total_stroke_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL
      );
      CREATE UNIQUE INDEX idx_characters_character_unique
        ON characters(character) WHERE deleted_at IS NULL;
    `)
    // 旧 pinyin 单值转 JSON 数组
    const insert = db.prepare(`
      INSERT OR REPLACE INTO characters
        (id, character, pinyin, pinyin_plain, used_weight, structure, total_stroke_count, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const r of rows) {
      const unicode = r.unicode_code ?? r.character.codePointAt(0)
      if (!unicode) continue
      insert.run(unicode, r.character,
        r.pinyin ? JSON.stringify([r.pinyin]) : '[]',
        r.pinyin ? JSON.stringify([stripTone(r.pinyin)]) : '[]',
        r.used_weight ?? 0, r.structure ?? 0, r.total_stroke_count ?? 0,
        r.created_at, r.updated_at, r.deleted_at)
    }
    db.exec('COMMIT')
    console.log('DB migrated: characters v2 (id=unicode, minimal fields)')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

// 拼音去声调（v1 pinyin 单值转 pinyin_plain 用）
function stripTone(py) {
  const toneMap = {
    ā: 'a', á: 'a', ǎ: 'a', à: 'a',
    ē: 'e', é: 'e', ě: 'e', è: 'e',
    ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
    ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
    ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
    ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü'
  }
  return (py || '').split('').map(c => toneMap[c] || c).join('')
}

// 迁移1b: characters id 从自增改为 unicode 后，残留孤儿笔画清理
// 仅旧结构（含 meaning 列或 created_at 列）执行；精简表结构直接跳过
function migrateStrokeCharId() {
  const charCols = db.prepare("PRAGMA table_info(characters)").all()
  if (charCols.some(c => c.name === 'meaning') || !charCols.some(c => c.name === 'created_at')) return
  const orphans = db.prepare(`
    SELECT COUNT(*) c FROM strokes s
    WHERE s.deleted_at IS NULL AND s.character_id NOT IN (SELECT id FROM characters)
  `).get().c
  if (orphans > 0) {
    db.prepare(`
      DELETE FROM strokes WHERE deleted_at IS NULL
        AND character_id NOT IN (SELECT id FROM characters)
    `).run()
    console.log(`DB migrated: removed ${orphans} orphan strokes (char id remap)`)
  }
}

// 迁移: characters.structure 列（v1 老库补充；v2 已内置则跳过）
function migrateStructureColumn() {
  const cols = db.prepare("PRAGMA table_info(characters)").all()
  if (cols.some(c => c.name === 'structure')) return
  db.exec("ALTER TABLE characters ADD COLUMN structure INTEGER DEFAULT 0 CHECK(structure BETWEEN 0 AND 9)")
  console.log('DB migrated: characters.structure column added')
}

// 迁移: characters.radical 列（部首，书写页可编辑）
function migrateRadicalColumn() {
  const cols = db.prepare("PRAGMA table_info(characters)").all()
  if (cols.some(c => c.name === 'radical')) return
  db.exec("ALTER TABLE characters ADD COLUMN radical TEXT NOT NULL DEFAULT ''")
  console.log('DB migrated: characters.radical column added')
}

// 迁移2: strokes.stroke_type 从 TEXT 字符串改为 INTEGER 数字编码（0-35）
// 旧表 CHECK 约束无法 ALTER，需重建表并映射数据
function migrateStrokeTypeToInt() {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strokes'"
  ).get()
  // 已是新格式（INTEGER + 数字 CHECK）则跳过
  if (row && row.sql && row.sql.includes('stroke_type INTEGER')) return

  db.exec('BEGIN')
  try {
    db.exec(`
      ALTER TABLE strokes RENAME TO strokes_old;
      DROP INDEX IF EXISTS idx_strokes_order_unique;
      DROP INDEX IF EXISTS idx_strokes_character_id;
      CREATE TABLE strokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
        stroke_name TEXT NOT NULL,
        stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
        svg_contour TEXT NOT NULL,
        trajectory_data TEXT NOT NULL,
        width REAL NOT NULL DEFAULT 1.0 CHECK(width > 0),
        color TEXT NOT NULL DEFAULT '#000000',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
    `)
    // 逐行迁移并映射旧字符串编码 → 数字编码
    const rows = db.prepare('SELECT * FROM strokes_old').all()
    const insert = db.prepare(`
      INSERT INTO strokes (id, character_id, stroke_order, stroke_name, stroke_type,
        svg_contour, trajectory_data, width, color, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const r of rows) {
      const code = LEGACY_TYPE_MAP[r.stroke_type] ?? 0
      insert.run(r.id, r.character_id, r.stroke_order, r.stroke_name, code,
        r.svg_contour, r.trajectory_data, r.width, r.color, r.created_at, r.updated_at, r.deleted_at)
    }
    db.exec('DROP TABLE strokes_old')
    db.exec(`
      CREATE UNIQUE INDEX idx_strokes_order_unique
        ON strokes(character_id, stroke_order) WHERE deleted_at IS NULL;
      CREATE INDEX idx_strokes_character_id
        ON strokes(character_id) WHERE deleted_at IS NULL;
    `)
    db.exec('COMMIT')
    console.log('DB migrated: stroke_type TEXT → INTEGER codes')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// 迁移3: 笔画数据模型 v2
//  - 删除展示相关列: svg_contour / width / color（展示配置全部前端化）
//  - trajectory_data 坐标归一化: 像素(0-500) → 归一化(0-1)，精确 3 位小数
//  - 精简: 移除 canvasSize / boundingBox / metadata（可由 points 推导或前端计算）
function migrateStrokeSchemaV2() {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strokes'"
  ).get()
  // 已是 v2（无 svg_contour 列）则跳过
  if (row && row.sql && !row.sql.includes('svg_contour')) return

  db.exec('BEGIN')
  try {
    db.exec(`
      ALTER TABLE strokes RENAME TO strokes_old;
      DROP INDEX IF EXISTS idx_strokes_order_unique;
      DROP INDEX IF EXISTS idx_strokes_character_id;
      CREATE TABLE strokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
        stroke_name TEXT NOT NULL,
        stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
        trajectory_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
    `)
    // 逐行迁移: 去掉展示列，轨迹坐标归一化(像素/500 → 0-1，3位小数)
    const rows = db.prepare('SELECT * FROM strokes_old').all()
    const insert = db.prepare(`
      INSERT INTO strokes (id, character_id, stroke_order, stroke_name, stroke_type,
        trajectory_data, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const round3 = (v) => Math.round(v * 1000) / 1000
    for (const r of rows) {
      let traj
      try { traj = JSON.parse(r.trajectory_data) } catch { traj = null }
      let data = null
      if (traj && Array.isArray(traj.points) && traj.points.length > 0) {
        // 旧数据 canvasSize 默认 500；若无则视为已归一化（原样保留）
        const cs = traj.canvasSize || { width: 500, height: 500 }
        const w = cs.width || 500
        const h = cs.height || 500
        // 判断是否为归一化: 所有 |x|<=1 且 |y|<=1
        const alreadyNormalized = traj.points.every(p =>
          Math.abs(p.x ?? 0) <= 1 && Math.abs(p.y ?? 0) <= 1)
        data = {
          version: '2.0',
          points: traj.points.map(p => {
            const x = alreadyNormalized ? p.x : (p.x / w)
            const y = alreadyNormalized ? p.y : (p.y / h)
            return {
              x: round3(x),
              y: round3(y),
              pressure: p.pressure ?? 0.5,
              timestamp: p.timestamp ?? 0
            }
          })
        }
      }
      insert.run(r.id, r.character_id, r.stroke_order, r.stroke_name, r.stroke_type,
        data ? JSON.stringify(data) : '{"version":"2.0","points":[]}',
        r.created_at, r.updated_at, r.deleted_at)
    }
    db.exec('DROP TABLE strokes_old')
    db.exec(`
      CREATE UNIQUE INDEX idx_strokes_order_unique
        ON strokes(character_id, stroke_order) WHERE deleted_at IS NULL;
      CREATE INDEX idx_strokes_character_id
        ON strokes(character_id) WHERE deleted_at IS NULL;
    `)
    db.exec('COMMIT')
    console.log('DB migrated: stroke schema v2 (normalized coords, no display fields)')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// 迁移4: 坐标存储 v3 — 归一化小数(0-1) → ×10000 整数（降低存储开销）
// 前端显示时 ÷10000 还原。无需重建表，仅转换 trajectory_data 内容。
function migrateStrokeCoordV3() {
  const cols = db.prepare('PRAGMA table_info(strokes)').all()
  if (!cols.some(c => c.name === 'deleted_at')) return   // 精简表结构，无需迁移
  const rows = db.prepare(
    "SELECT id, trajectory_data FROM strokes WHERE deleted_at IS NULL"
  ).all()
  let changed = false
  const update = db.prepare('UPDATE strokes SET trajectory_data = ? WHERE id = ?')
  for (const r of rows) {
    let traj
    try { traj = JSON.parse(r.trajectory_data) } catch { continue }
    if (!traj || !Array.isArray(traj.points) || traj.points.length === 0) continue
    // 元组数组（v4）跳过: 元素是数组而非对象
    if (Array.isArray(traj.points[0])) continue
    // 判断是否仍为 v2 归一化小数（|x|<=1 且 |y|<=1）
    const isV2 = traj.points.some(p =>
      Math.abs(p.x ?? 0) <= 1 && Math.abs(p.y ?? 0) <= 1)
    if (!isV2) continue
    traj.version = '3.0'
    traj.points = traj.points.map(p => ({
      x: Math.round((p.x ?? 0) * 10000),
      y: Math.round((p.y ?? 0) * 10000),
      pressure: p.pressure ?? 0.5,
      timestamp: p.timestamp ?? 0
    }))
    update.run(JSON.stringify(traj), r.id)
    changed = true
  }
  if (changed) {
    console.log('DB migrated: stroke coords v3 (normalized ×10000 integer)')
  }
}

// 迁移5: strokes v4
//  - 删除 stroke_name 列（只保留 stroke_type 类型编码，名称由前端映射）
//  - trajectory_data.points 由对象数组 [{x,y,pressure,timestamp}] 改为元组数组
//    [[x,y,pressure,timestamp], ...]（降低 JSON 存储开销）
function migrateStrokeV4() {
  const cols = db.prepare('PRAGMA table_info(strokes)').all()
  if (!cols.some(c => c.name === 'deleted_at')) return   // 精简表结构，无需迁移
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'strokes'"
  ).get()
  const hasNameCol = row?.sql?.includes('stroke_name')
  // 检查轨迹是否仍为对象格式（v3）
  const sample = db.prepare(
    "SELECT trajectory_data FROM strokes WHERE deleted_at IS NULL AND trajectory_data IS NOT NULL LIMIT 1"
  ).get()
  let isObjectFormat = false
  if (sample) {
    try {
      const traj = JSON.parse(sample.trajectory_data)
      isObjectFormat = Array.isArray(traj?.points) &&
        traj.points.length > 0 && typeof traj.points[0] === 'object' &&
        !Array.isArray(traj.points[0])
    } catch { /* 忽略 */ }
  }
  if (!hasNameCol && !isObjectFormat) return   // 已是 v4

  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    const rows = db.prepare('SELECT * FROM strokes').all()
    db.exec(`
      ALTER TABLE strokes RENAME TO strokes_old;
      DROP INDEX IF EXISTS idx_strokes_order_unique;
      DROP INDEX IF EXISTS idx_strokes_character_id;
      CREATE TABLE strokes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        stroke_order INTEGER NOT NULL CHECK(stroke_order >= 1),
        stroke_type INTEGER NOT NULL DEFAULT 0 CHECK(stroke_type BETWEEN 0 AND 35),
        trajectory_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
    `)
    const insert = db.prepare(`
      INSERT INTO strokes (id, character_id, stroke_order, stroke_type, trajectory_data, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const r of rows) {
      let traj
      try { traj = JSON.parse(r.trajectory_data) } catch { traj = null }
      if (traj && Array.isArray(traj.points) && traj.points.length > 0 &&
          typeof traj.points[0] === 'object' && !Array.isArray(traj.points[0])) {
        // 对象 → 元组数组（x/y 已是归一化×10000 整数，直接取值）
        traj.version = '4.0'
        traj.points = traj.points.map(p => [
          Math.round(p.x ?? 0),          // x 归一化×10000
          Math.round(p.y ?? 0),          // y
          p.pressure ?? 0.5,              // pressure
          p.timestamp ?? 0                // timestamp
        ])
      }
      insert.run(r.id, r.character_id, r.stroke_order, r.stroke_type,
        traj ? JSON.stringify(traj) : '{"version":"4.0","points":[]}',
        r.created_at, r.updated_at, r.deleted_at)
    }
    db.exec('DROP TABLE strokes_old')
    db.exec(`
      CREATE UNIQUE INDEX idx_strokes_order_unique
        ON strokes(character_id, stroke_order) WHERE deleted_at IS NULL;
      CREATE INDEX idx_strokes_character_id
        ON strokes(character_id) WHERE deleted_at IS NULL;
    `)
    db.exec('COMMIT')
    console.log('DB migrated: stroke schema v4 (no stroke_name, tuple points)')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

// 迁移6: strokes v5 — 轨迹点 pressure ×100、timestamp ×10 存整数
// （消除浮点噪声并减小存储：pressure 保留 2 位小数，timestamp 保留 1 位小数）
function migrateStrokeV5() {
  const cols = db.prepare('PRAGMA table_info(strokes)').all()
  if (!cols.some(c => c.name === 'deleted_at')) return   // 精简表结构，无需迁移
  const rows = db.prepare(
    'SELECT id, trajectory_data FROM strokes WHERE deleted_at IS NULL'
  ).all()
  let changed = false
  const update = db.prepare('UPDATE strokes SET trajectory_data = ? WHERE id = ?')
  for (const r of rows) {
    let traj
    try { traj = JSON.parse(r.trajectory_data) } catch { continue }
    if (!traj || traj.version !== '4.0' || !Array.isArray(traj.points)) continue
    if (traj.points.length === 0 || !Array.isArray(traj.points[0])) continue
    traj.version = '5.0'
    traj.points = traj.points.map(pt => [
      pt[0],
      pt[1],
      Math.round((pt[2] ?? 0.5) * 100),   // pressure ×100
      Math.round((pt[3] ?? 0) * 10)        // timestamp ×10
    ])
    update.run(JSON.stringify(traj), r.id)
    changed = true
  }
  if (changed) {
    console.log('DB migrated: stroke coords v5 (pressure ×100, timestamp ×10)')
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

// 时间转换: SQLite 'YYYY-MM-DD HH:MM:SS' → ISO8601
export function toISO(sqliteTime) {
  if (!sqliteTime) return null
  return new Date(sqliteTime.replace(' ', 'T') + 'Z').toISOString()
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
