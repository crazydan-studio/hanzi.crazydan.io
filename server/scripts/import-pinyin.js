// 从 sqlite 汉字数据源导入到 data/hanzi.db
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
//   - 结构: glyph_struct_ 按数字编码存储（前端映射展示名与示例，见 PinyinDict.STRUCTURE_MAP）
// 存储: meta_zi 表（id = 汉字 unicode 数值，不含 zi 列）；已存在记录更新（保留已有笔画）
// 字体覆盖检查: 导入前检查自带中易楷体是否包含该字，缺失则不导入并输出告警
import { DatabaseSync } from 'node:sqlite'
import * as fontkit from 'fontkit'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { STRUCTURE_MAP, numberTonePinyin } from '../services/PinyinDict.js'
import { initDatabase, getDb, withTransaction, closeDatabase } from '../services/database.js'
import { removeZiStatic } from '../services/staticSync.js'
import { HANZI_DB_PATH, KAI_FONT_WOFF2_PATH } from '../../paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SRC = path.join(__dirname, '..', '..', 'data', 'pinyin-dict.sqlite')
const DEFAULT_DST = HANZI_DB_PATH

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

// 加载自带中易楷体（缺失时告警并跳过检查）
function loadKaiFont() {
  if (!fs.existsSync(KAI_FONT_WOFF2_PATH)) {
    console.warn(`[告警] 未找到自带中易楷体（${KAI_FONT_WOFF2_PATH}），跳过字体覆盖检查`)
    return null
  }
  try {
    return fontkit.openSync(KAI_FONT_WOFF2_PATH)
  } catch (err) {
    console.warn(`[告警] 中易楷体解析失败（${err.message}），跳过字体覆盖检查`)
    return null
  }
}

function main() {
  const { source: SRC_DB, target: DST_DB } = parseArgs()

  if (!fs.existsSync(SRC_DB)) {
    console.error(`数据源不存在: ${SRC_DB}`)
    console.error(`用法: pnpm import:pinyin -- --source <数据源.sqlite>`)
    process.exit(1)
  }
  console.log(`数据源: ${SRC_DB}`)
  console.log(`目标库: ${DST_DB}`)
  // 确保目标表结构存在（支持指定目标路径）
  initDatabase(DST_DB)
  const src = new DatabaseSync(SRC_DB, { readOnly: true })
  const dst = getDb()

  // 读取全部 pinyin_zi（按字聚合）
  const rows = src.prepare(`
    SELECT zi_, spell_value_, spell_tone_, used_weight_, total_stroke_count_, glyph_struct_, radical_, traditional_
    FROM pinyin_zi
    ORDER BY id_
  `).all()

  // 聚合: zi_ → { readings:Map(数字声调拼音 → 权重), weight, strokes, struct, radical, traditional }
  const agg = new Map()
  for (const r of rows) {
    if (!r.zi_ || r.zi_.length !== 1) continue
    let e = agg.get(r.zi_)
    if (!e) {
      e = { readings: new Map(), weight: 0, strokes: 0, struct: 0, radical: '', traditional: false }
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
    // 繁体字标记（以词典为准）: 任一条记录标记为繁体即为繁体
    if (r.traditional_ === 1) e.traditional = true
  }

  // 读音按 used_weight_ 降序（该汉字读音的排序结果）
  for (const e of agg.values()) {
    e.readings = [...e.readings.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pinyin]) => pinyin)
  }

  // 字体覆盖检查: 自带中易楷体不含该字 → 不导入（并删除其静态数据条目）
  const kaiFont = loadKaiFont()
  const isCovered = (word) =>
    kaiFont ? kaiFont.glyphForCodePoint(word.codePointAt(0)).id !== 0 : true

  // 已存在汉字的信息（读音/结构/部首/笔画数）优先保留——
  // 经 web 端书写页更新的汉字信息不被词典数据覆盖; 使用权重与繁体标记随词典更新
  // 写实体表 meta_zi（zi 为视图，不可写）; id = 汉字 unicode 数值
  const upsert = dst.prepare(`
    INSERT INTO meta_zi (id, pinyin, used_weight, structure, radical, total_stroke_count, is_traditional)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pinyin = excluded.pinyin,
      used_weight = excluded.used_weight,
      structure = meta_zi.structure,
      radical = meta_zi.radical,
      total_stroke_count = meta_zi.total_stroke_count,
      is_traditional = excluded.is_traditional
  `)

  const BATCH = 500
  const entries = [...agg.entries()]
  let count = 0
  const missing = []   // 字体未覆盖的汉字（不导入，删除静态条目）
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH)
    withTransaction(() => {
      for (const [word, e] of chunk) {
        if (!isCovered(word)) {
          missing.push(word)
          continue
        }
        const unicode = word.codePointAt(0)
        upsert.run(unicode,
          JSON.stringify(e.readings),
          e.weight, e.struct, e.radical, e.strokes, e.traditional ? 1 : 0)
        count++
      }
    })
    console.log(`已导入 ${count}/${entries.length}`)
  }

  // 静态数据清理（web 端数据源，保持与库一致）:
  //   - 字体未覆盖的汉字无法以楷体显示/测量墨迹盒 → 删除其 index.json 行与笔画分片条目
  //   - 词典中不存在的汉字 → 删除 DB 行（笔画随外键级联）并同步删除静态条目
  if (missing.length > 0) {
    for (const word of missing) {
      removeZiStatic(word.codePointAt(0))
    }
    const sample = missing.slice(0, 20).join('')
    const more = missing.length > 20 ? ` 等 ${missing.length} 个` : ''
    console.warn(`[告警] 自带中易楷体未包含 ${missing.length} 个汉字，已跳过导入并删除其静态数据: ${sample}${more}`)
  }

  // 词典外汉字（含字体未覆盖的历史遗留）: 从 DB 与静态数据一并清理
  const keep = new Set()
  for (const w of agg.keys()) {
    if (isCovered(w)) keep.add(w.codePointAt(0))
  }
  const staleIds = dst.prepare('SELECT id FROM meta_zi').all()
    .map(r => r.id)
    .filter(id => !keep.has(id))
  if (staleIds.length > 0) {
    for (const id of staleIds) removeZiStatic(id)
    // 分批删除（避开 SQLite 单条 SQL 变量上限）
    let deleted = 0
    for (let i = 0; i < staleIds.length; i += 900) {
      const chunk = staleIds.slice(i, i + 900)
      const placeholders = chunk.map(() => '?').join(',')
      deleted += dst.prepare(`DELETE FROM meta_zi WHERE id IN (${placeholders})`).run(...chunk).changes
    }
    console.log(`已清理词典外汉字: ${deleted} 个（DB 与静态数据同步）`)
  }

  console.log(`导入完成: ${count} 个汉字（多音聚合、重复去重）`)
  src.close()
  closeDatabase()
}

main()
