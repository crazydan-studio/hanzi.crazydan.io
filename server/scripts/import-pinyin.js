// 从 sqlite 汉字数据源导入到 hanzi_stroke.db
// 用法:
//   pnpm import:pinyin                                    # 默认数据源 data/pinyin-dict.sqlite
//   pnpm import:pinyin -- --source /path/to/dict.sqlite   # 指定数据源路径
//   pnpm import:pinyin -- /path/to/dict.sqlite            # 位置参数指定
//   pnpm import:pinyin -- --source a.sqlite --db out.db   # 同时指定目标库
// 数据源表 pinyin_zi 列: zi_(字) spell_value_(拼音无声调) spell_tone_(声调 0-4)
//       used_weight_(该读音使用频率) total_stroke_count_(笔画数) glyph_struct_(结构) radical_(部首)
// 聚合规则:
//   - 读音: spell_value_ + spell_tone_ 构成数字声调拼音（如 di+2 → di2，轻声不带数字），
//           按 used_weight_ 降序排序（该汉字读音的排序结果）
//   - 权重: 该汉字带声调拼音组合 used_weight_ 的最大值
//   - 结构: glyph_struct_ 按数字编码存储（前端映射展示名与示例）
// 存储: characters 表（id = 汉字 unicode 数值）；已存在记录更新（保留已有笔画）
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { STRUCTURE_MAP, numberTonePinyin } from '../services/pinyinDict.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const DEFAULT_SRC = path.join(ROOT, 'data', 'pinyin-dict.sqlite')
const DEFAULT_DST = path.join(ROOT, 'server', 'data', 'hanzi_stroke.db')

// 解析命令行参数: --source/--db 选项 + 位置参数（相对 CWD 解析）
function parseArgs() {
  const args = process.argv.slice(2)
  let source = null
  let target = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--source' && args[i + 1]) { source = args[++i] }
    else if (a === '--db' && args[i + 1]) { target = args[++i] }
    else if (a === '--help' || a === '-h') {
      console.log(`用法: node import-pinyin.js [--source <数据源.sqlite>] [--db <目标.db>]`)
      console.log(`      也可用位置参数: node import-pinyin.js <数据源.sqlite>`)
      process.exit(0)
    }
    else if (!a.startsWith('-') && !source) { source = a }   // 位置参数
  }
  return {
    source: source ? path.resolve(source) : DEFAULT_SRC,
    target: target ? path.resolve(target) : DEFAULT_DST
  }
}


async function main() {
  const { source: SRC_DB, target: DST_DB } = parseArgs()

  if (!fs.existsSync(SRC_DB)) {
    console.error(`数据源不存在: ${SRC_DB}`)
    console.error(`用法: pnpm import:pinyin -- --source <数据源.sqlite>`)
    process.exit(1)
  }
  console.log(`数据源: ${SRC_DB}`)
  console.log(`目标库: ${DST_DB}`)
  // 确保目标表结构存在（支持指定目标路径）
  const { initDatabase, getDb } = await import('../services/database.js')
  initDatabase(DST_DB)
  const src = new DatabaseSync(SRC_DB, { readOnly: true })
  const dst = getDb()

  // 读取全部 pinyin_zi（按字聚合）
  const rows = src.prepare(`
    SELECT zi_, spell_value_, spell_tone_, used_weight_, total_stroke_count_, glyph_struct_, radical_
    FROM pinyin_zi
    ORDER BY id_
  `).all()

  // 聚合: zi_ → { readings:Map(数字声调拼音 → 权重), weight, strokes, struct, radical }
  const agg = new Map()
  for (const r of rows) {
    if (!r.zi_ || r.zi_.length !== 1) continue
    let e = agg.get(r.zi_)
    if (!e) {
      e = { readings: new Map(), weight: 0, strokes: 0, struct: 0, radical: '' }
      agg.set(r.zi_, e)
    }
    // 权重: 该汉字各带声调拼音组合 used_weight_ 的最大值
    if (r.spell_value_) {
      const pinyin = numberTonePinyin(r.spell_value_, r.spell_tone_)
      if (!e.readings.has(pinyin)) {
        e.readings.set(pinyin, r.used_weight_ ?? 0)
        e.weight = Math.max(e.weight, r.used_weight_ ?? 0)
      }
    }
    e.strokes = Math.max(e.strokes, r.total_stroke_count_ ?? 0)
    if (r.radical_ && !e.radical) e.radical = r.radical_
    if (r.glyph_struct_ && STRUCTURE_MAP[r.glyph_struct_] !== undefined) {
      e.struct = STRUCTURE_MAP[r.glyph_struct_]
    }
  }

  // 读音按 used_weight_ 降序（该汉字读音的排序结果）
  for (const e of agg.values()) {
    e.readings = [...e.readings.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pinyin]) => pinyin)
  }

  // 写入 hanzi_stroke.db（upsert，保留已有笔画）
  const upsert = dst.prepare(`
    INSERT INTO characters (id, character, pinyin, used_weight, structure, radical, total_stroke_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pinyin = excluded.pinyin,
      used_weight = excluded.used_weight,
      structure = CASE WHEN excluded.structure != 0 THEN excluded.structure ELSE characters.structure END,
      radical = CASE WHEN excluded.radical != '' THEN excluded.radical ELSE characters.radical END,
      total_stroke_count = excluded.total_stroke_count
  `)

  const BATCH = 500
  const entries = [...agg.entries()]
  let count = 0
  for (let i = 0; i < entries.length; i += BATCH) {
    dst.exec('BEGIN')
    try {
      for (let k = i; k < Math.min(i + BATCH, entries.length); k++) {
        const [word, e] = entries[k]
        const unicode = word.codePointAt(0)
        upsert.run(unicode, word,
          JSON.stringify(e.readings),
          e.weight, e.struct, e.radical, e.strokes)
        count++
      }
      dst.exec('COMMIT')
    } catch (err) {
      dst.exec('ROLLBACK')
      throw err
    }
    console.log(`已导入 ${count}/${entries.length}`)
  }

  // 清理: 新词典中不存在的汉字标记删除（保持与数据源一致）
  dst.exec('CREATE TEMP TABLE _keep(id INTEGER PRIMARY KEY)')
  const keep = dst.prepare('INSERT OR IGNORE INTO _keep(id) VALUES (?)')
  for (const w of agg.keys()) keep.run(w.codePointAt(0))
  const { changes } = dst.prepare(
    'DELETE FROM characters WHERE id NOT IN (SELECT id FROM _keep)'
  ).run()
  dst.exec('DROP TABLE _keep')
  if (changes > 0) console.log(`已清理词典外汉字: ${changes} 个`)

  console.log(`导入完成: ${count} 个汉字（多音聚合、重复去重）`)
  src.close()
  const { closeDatabase } = await import('../services/database.js')
  closeDatabase()
}

main()
