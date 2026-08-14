// 从 sqlite 汉字数据源导入到 hanzi_stroke.db
// 用法:
//   pnpm import:pinyin                                    # 默认数据源 server/data/pinyin-dict.v3.sqlite
//   pnpm import:pinyin -- --source /path/to/dict.sqlite   # 指定数据源路径
//   pnpm import:pinyin -- /path/to/dict.sqlite            # 位置参数指定
//   pnpm import:pinyin -- --source a.sqlite --db out.db   # 同时指定目标库
// 数据源表 pinyin_word 列: word_(字) spell_(读音含声调) spell_chars_(拼音无声调)
//       used_weight_(权重) total_stroke_count_(笔画数) glyph_struct_(结构)
// 存储: characters 表（id = 汉字 unicode 数值），仅 读音/拼音/权重/结构/笔画数
// 多音字聚合多个读音/拼音；重复行去重；已存在记录更新（保留已有笔画）
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SRC = path.join(__dirname, '..', 'data', 'pinyin-dict.v3.sqlite')
const DEFAULT_DST = path.join(__dirname, '..', 'data', 'hanzi_stroke.db')

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

// 字典结构名 → 数字编码（与前端 CHARACTER_STRUCTURES 一致）
// 0未指定 1独体 2左右 3左中右 4上下 5上中下 6全包围 7半包围 8品字 9镶嵌
const STRUCTURE_MAP = {
  '独体结构': 1, '左右结构': 2, '左中右结构': 3, '上下结构': 4,
  '上中下结构': 5, '全包围结构': 6, '半包围结构': 7, '品字结构': 8,
  // 半包围细分均归为半包围(7)
  '左下包围结构': 7, '左上包围结构': 7, '上包围结构': 7,
  '右上包围结构': 7, '左包围结构': 7, '下包围结构': 7, '右包围结构': 7
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

  // 读取全部 pinyin_word（按字聚合）
  const rows = src.prepare(`
    SELECT word_, spell_, spell_chars_, used_weight_, total_stroke_count_, glyph_struct_
    FROM pinyin_word
    ORDER BY word_
  `).all()

  // 聚合: word_ → { pinyin:Set, plain:Set, weight, strokes, struct }
  const agg = new Map()
  for (const r of rows) {
    if (!r.word_ || r.word_.length !== 1) continue
    let e = agg.get(r.word_)
    if (!e) {
      e = { pinyin: new Set(), plain: new Set(), weight: 0, strokes: 0, struct: 0 }
      agg.set(r.word_, e)
    }
    if (r.spell_) e.pinyin.add(r.spell_)
    if (r.spell_chars_) e.plain.add(r.spell_chars_)
    e.weight = Math.max(e.weight, r.used_weight_ ?? 0)
    e.strokes = Math.max(e.strokes, r.total_stroke_count_ ?? 0)
    if (r.glyph_struct_ && STRUCTURE_MAP[r.glyph_struct_] !== undefined) {
      e.struct = STRUCTURE_MAP[r.glyph_struct_]
    }
  }

  // 写入 hanzi_stroke.db（upsert，保留已有笔画）
  const upsert = dst.prepare(`
    INSERT INTO characters (id, character, pinyin, pinyin_plain, used_weight, structure, total_stroke_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pinyin = excluded.pinyin,
      pinyin_plain = excluded.pinyin_plain,
      used_weight = excluded.used_weight,
      structure = CASE WHEN excluded.structure != 0 THEN excluded.structure ELSE characters.structure END,
      total_stroke_count = excluded.total_stroke_count,
      updated_at = datetime('now')
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
          JSON.stringify([...e.pinyin]),
          JSON.stringify([...e.plain]),
          e.weight, e.struct, e.strokes)
        count++
      }
      dst.exec('COMMIT')
    } catch (err) {
      dst.exec('ROLLBACK')
      throw err
    }
    console.log(`已导入 ${count}/${entries.length}`)
  }

  console.log(`导入完成: ${count} 个汉字（多音聚合、重复去重）`)
  src.close()
  const { closeDatabase } = await import('../services/database.js')
  closeDatabase()
}

main()
