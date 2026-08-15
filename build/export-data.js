// 从开发数据库导出静态数据到 public/assets（供前端页面直接加载）
// 数据源:
//   - data/pinyin-dict.sqlite     汉字词典（表 pinyin_zi: 读音/权重/结构/部首/笔画数）
//   - server/data/hanzi_stroke.db 笔画数据库（笔画轨迹，由汉字笔画模块维护）
// 导出内容:
//   - public/assets/zi/commons.json          常用字列表（[字, 读音][]，按权重排序，仅字+第一个读音）
//   - public/assets/pinyin/{拼音}/meta.json  拼音字列表（[字, 读音][]，按权重排序；
//                                            读音为该无声调拼音对应的第一个带声调拼音）
//   - public/assets/zi/{Unicode}/meta.json   单个汉字信息（读音/笔画数/部首/结构/Unicode）
//   - public/assets/zi/{Unicode}/strokes.json 笔画数据（与 meta.json 同时导出；
//     仅该汉字存在笔画数据时创建；轨迹点为增量编码 v6）
// 用法:
//   pnpm export:data                                       # 默认导出 100 个常用字 + 全量拼音
//   pnpm export:data -- --count 200                        # 指定常用字数量
//   pnpm export:data -- --source a.sqlite --db b.db --out public
import { DatabaseSync } from 'node:sqlite'
import { decompressTrajectory, deltaEncode, TRAJECTORY_VERSION } from '../server/services/trajectory.js'
import { STRUCTURE_MAP, numberTonePinyin, stripTone } from '../server/services/pinyinDict.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DEFAULT_SRC = path.join(ROOT, 'data', 'pinyin-dict.sqlite')
const DEFAULT_DB = path.join(ROOT, 'server', 'data', 'hanzi_stroke.db')
const DEFAULT_OUT = path.join(ROOT, 'public')
const DEFAULT_COUNT = 20

function parseArgs() {
  const args = process.argv.slice(2)
  const opt = { count: DEFAULT_COUNT }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--count' && args[i + 1]) { opt.count = Math.max(1, Math.floor(Number(args[++i]) || DEFAULT_COUNT)) }
    else if (a === '--source' && args[i + 1]) { opt.source = path.resolve(args[++i]) }
    else if (a === '--db' && args[i + 1]) { opt.db = path.resolve(args[++i]) }
    else if (a === '--out' && args[i + 1]) { opt.out = path.resolve(args[++i]) }
    else if (a === '--help' || a === '-h') {
      console.log('用法: node build/export-data.js [--count N] [--source dict.sqlite] [--db strokes.db] [--out public]')
      process.exit(0)
    }
  }
  return {
    count: opt.count,
    source: opt.source || DEFAULT_SRC,
    db: opt.db || DEFAULT_DB,
    out: opt.out || DEFAULT_OUT
  }
}


function writeJson(file, data, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0))
  return file
}

function main() {
  const { count, source, db, out } = parseArgs()

  if (!fs.existsSync(source)) {
    console.error(`数据源不存在: ${source}`)
    process.exit(1)
  }

  console.log(`数据源:   ${source}`)
  console.log(`笔画库:   ${db}`)
  console.log(`输出目录: ${out}`)
  console.log(`常用字数量: ${count}`)

  const src = new DatabaseSync(source, { readOnly: true })

  // ---- 1. 读取词典（pinyin_zi: 读音按 used_weight_ 降序，权重为 (zi_, spell_raw_) 组合去重后的和） ----
  const rows = src.prepare(`
    SELECT zi_, spell_value_, spell_tone_, used_weight_,
           total_stroke_count_, glyph_struct_, radical_
    FROM pinyin_zi
    ORDER BY id_
  `).all()
  src.close()

  const words = new Map()   // zi_ → { char, weight, readings[], plainSet, strokes, radical, structure }
  for (const r of rows) {
    if (!r.zi_ || r.zi_.length !== 1) continue
    let e = words.get(r.zi_)
    if (!e) {
      e = {
        char: r.zi_,
        weight: 0,
        readings: new Map(),   // 数字声调拼音 → 权重
        plainSet: new Set(),
        totalStrokes: 0,
        radical: '',
        structure: 0           // 结构编码（前端映射展示名）
      }
      words.set(r.zi_, e)
    }
    // 权重: 该汉字各带声调拼音组合 used_weight_ 的最大值
    if (r.spell_value_) {
      const pinyin = numberTonePinyin(r.spell_value_, r.spell_tone_)
      if (!e.readings.has(pinyin)) {
        e.readings.set(pinyin, r.used_weight_ ?? 0)
        e.weight = Math.max(e.weight, r.used_weight_ ?? 0)
      }
      e.plainSet.add(r.spell_value_)
    }
    e.totalStrokes = Math.max(e.totalStrokes, r.total_stroke_count_ ?? 0)
    if (r.radical_ && !e.radical) e.radical = r.radical_
    if (r.glyph_struct_ && STRUCTURE_MAP[r.glyph_struct_] !== undefined) {
      e.structure = STRUCTURE_MAP[r.glyph_struct_]
    }
  }
  // 读音按 used_weight_ 降序（该汉字读音的排序结果）
  for (const e of words.values()) {
    e.readings = [...e.readings.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([raw]) => raw)
  }

  // ---- 2. 读取笔画库（常用字的笔画数据） ----
  let strokeRows = []
  if (fs.existsSync(db)) {
    const strokeDb = new DatabaseSync(db, { readOnly: true })
    try {
      strokeRows = strokeDb.prepare(`
        SELECT character_id, stroke_order, stroke_type, trajectory_data
        FROM strokes ORDER BY character_id, stroke_order
      `).all()
    } finally {
      strokeDb.close()
    }
  } else {
    console.warn(`笔画库不存在（${db}），跳过笔画导出`)
  }

  // unicode → strokes
  const strokeMap = new Map()
  for (const s of strokeRows) {
    let traj = null
    try { traj = decompressTrajectory(s.trajectory_data) } catch { continue }
    if (!traj || !Array.isArray(traj.points) || traj.points.length === 0) continue
    if (!strokeMap.has(s.character_id)) strokeMap.set(s.character_id, [])
    strokeMap.get(s.character_id).push({
      stroke_order: s.stroke_order,
      stroke_type: s.stroke_type,
      trajectory_data: traj
    })
  }
  for (const list of strokeMap.values()) {
    list.sort((a, b) => a.stroke_order - b.stroke_order)
  }

  // ---- 3. 常用字（按权重排序，取前 count 个） ----
  const byWeight = [...words.values()].sort((a, b) => b.weight - a.weight || (a.char < b.char ? -1 : 1))

  // 列表条目（数组格式 [汉字, 读音]，降低 json 体积）
  //  - 常用字: 字 + 第一个读音
  const commons = byWeight.slice(0, count).map(w => [w.char, w.readings[0] || ''])
  const commonSet = new Set(commons.map(e => e[0]))

  const ziDir = path.join(out, 'assets', 'zi')
  const pinyinDir = path.join(out, 'assets', 'pinyin')

  // 清理旧导出（先删除现有目录与文件，含 meta.json/strokes.json，
  // 防止常用字范围/数据变更后残留过期文件）
  fs.rmSync(ziDir, { recursive: true, force: true })
  fs.rmSync(pinyinDir, { recursive: true, force: true })

  // ---- 4. 常用字列表 ----
  writeJson(path.join(ziDir, 'commons.json'), commons)
  console.log(`已导出常用字列表: ${count} 个 → ${path.join(ziDir, 'commons.json')}`)

  // ---- 5. 拼音字列表（全量拼音） ----
  const pinyinGroups = new Map()   // plain → [word...]
  for (const w of words.values()) {
    for (const plain of w.plainSet) {
      if (!pinyinGroups.has(plain)) pinyinGroups.set(plain, [])
      pinyinGroups.get(plain).push(w)
    }
  }
  // 该字在某无声调拼音下的读音 = 第一个带声调的匹配读音
  const readingForPlain = (w, plain) => w.readings.find(r => stripTone(r) === plain) || ''
  for (const [plain, list] of pinyinGroups) {
    list.sort((a, b) => b.weight - a.weight || (a.char < b.char ? -1 : 1))
    writeJson(path.join(pinyinDir, plain, 'meta.json'),
      list.map(w => [w.char, readingForPlain(w, plain)]))
  }
  console.log(`已导出拼音字列表: ${pinyinGroups.size} 个拼音 → ${pinyinDir}`)

  // ---- 6. 单个汉字信息（全部汉字）: 与 meta.json 同时导出该汉字笔画数据 ----
  // 笔画数据不限于常用字——凡笔画库中存在笔画的汉字均导出 strokes.json，
  // 无笔画数据的汉字不创建该文件；轨迹点为增量编码（v6），降低存储占用
  let metaCount = 0
  let strokeCount = 0
  const BATCH = 2000
  const entries = [...words.values()]
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    for (const w of batch) {
      const cp = w.char.codePointAt(0)
      const dir = path.join(ziDir, String(cp))
      // 单字母紧凑结构（c 汉字/p 读音/n 笔画数/r 部首/s 结构编码），降低存储开销
      // unicode 不存储，由前端按汉字直接计算
      writeJson(path.join(dir, 'meta.json'), {
        c: w.char,
        p: w.readings,
        n: w.totalStrokes,
        r: w.radical,
        s: w.structure
      })
      metaCount++
      // 单字母紧凑结构: o 笔顺/t 类型/d 轨迹（v 版本/p 增量编码点）
      const strokes = strokeMap.get(cp)
      if (strokes && strokes.length > 0) {
        writeJson(path.join(dir, 'strokes.json'),
          strokes.map(st => ({
            o: st.stroke_order,
            t: st.stroke_type,
            d: { v: TRAJECTORY_VERSION, p: deltaEncode(st.trajectory_data.points) }
          })))
        strokeCount++
      }
    }
    console.log(`已导出汉字信息 ${metaCount}/${entries.length}`)
  }

  console.log(`导出完成: 汉字信息 ${metaCount} 个，笔画数据 ${strokeCount} 个`)
}

main()
