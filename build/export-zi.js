// 从笔画数据库导出静态数据到 public/assets（供前端页面直接加载）
// 数据源: server/data/hanzi_stroke.db（zi 表: 汉字信息；strokes 表: 笔画轨迹，
//         由 pnpm import:pinyin 导入维护）
// 导出内容:
//   - public/assets/zi/commons.json          常用字列表（[字, 读音][]，按权重排序，仅字+第一个读音）
//   - public/assets/pinyin/{拼音}/meta.json  拼音字列表（[字, 读音][]，按权重排序；
//                                            读音为该无声调拼音对应的第一个带声调拼音）
//   - public/assets/zi/{Unicode}/meta.json   单个汉字信息（读音/笔画数/部首/结构/Unicode）
//   - public/assets/zi/{Unicode}/strokes.json 笔画数据（与 meta.json 同时导出；
//     仅该汉字存在笔画数据时创建；轨迹点为增量编码，含笔刷面积比）
// 用法:
//   pnpm export:zi                                      # 默认导出 1500 个常用字 + 全量拼音
//   pnpm export:zi -- --count 200                       # 指定常用字数量
//   pnpm export:zi -- --db b.db --out public            # 指定库与输出目录
import { DatabaseSync } from 'node:sqlite'
import { decompressTrajectory, deltaEncode, TRAJECTORY_VERSION } from '../server/services/Trajectory.js'
import { stripTone } from '../server/services/PinyinDict.js'
import path from 'path'
import fs from 'fs'
import { PUBLIC_DIR, HANZI_DB_PATH } from '../paths.js'

const DEFAULT_OUT = PUBLIC_DIR

// 常用字默认导出数量
const DEFAULT_COUNT = 1500

function parseArgs() {
  const args = process.argv.slice(2)
  const opt = { count: DEFAULT_COUNT }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--count' && args[i + 1]) { opt.count = Math.max(1, Math.floor(Number(args[++i]) || DEFAULT_COUNT)) }
    else if (a === '--db' && args[i + 1]) { opt.db = path.resolve(args[++i]) }
    else if (a === '--out' && args[i + 1]) { opt.out = path.resolve(args[++i]) }
    else if (a === '--help' || a === '-h') {
      console.log('用法: node build/export-zi.js [--count N] [--db <库>] [--out <目录>]')
      process.exit(0)
    }
  }
  return {
    count: opt.count,
    db: opt.db || HANZI_DB_PATH,
    out: opt.out || DEFAULT_OUT
  }
}


function writeJson(file, data, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0))
  return file
}

function main() {
  const { count, db, out } = parseArgs()

  if (!fs.existsSync(db)) {
    console.error(`笔画库不存在: ${db}`)
    process.exit(1)
  }

  console.log(`笔画库:   ${db}`)
  console.log(`输出目录: ${out}`)
  console.log(`常用字数量: ${count}`)

  const src = new DatabaseSync(db, { readOnly: true })

  // ---- 1. 读取汉字信息（zi 表: 由 pnpm import:pinyin 从词典导入聚合） ----
  // 读音为已按权重降序排列的数字声调拼音 JSON 数组; 权重为该字所有读音的最大值
  const rows = src.prepare(`
    SELECT id, zi, pinyin, used_weight, structure, radical, total_stroke_count, is_traditional
    FROM zi
  `).all()

  const words = new Map()   // zi → { zi, weight, readings[], plainSet, totalStrokes, radical, structure, traditional }
  for (const r of rows) {
    let readings = []
    try { readings = JSON.parse(r.pinyin) } catch { /* 忽略 */ }
    if (!Array.isArray(readings)) readings = []
    words.set(r.zi, {
      zi: r.zi,
      weight: r.used_weight ?? 0,
      readings,
      plainSet: new Set(readings.map(stripTone).filter(Boolean)),
      totalStrokes: r.total_stroke_count ?? 0,
      radical: r.radical ?? '',
      structure: r.structure ?? 0,
      traditional: (r.is_traditional ?? 0) === 1
    })
  }

  // ---- 2. 读取笔画数据（全部汉字的笔画轨迹） ----
  const strokeRows = src.prepare(`
    SELECT zi_id, stroke_order, stroke_type, trajectory_data
    FROM strokes ORDER BY zi_id, stroke_order
  `).all()

  // unicode → strokes
  const strokeMap = new Map()
  for (const s of strokeRows) {
    let traj = null
    try { traj = decompressTrajectory(s.trajectory_data) } catch { continue }
    if (!traj || !Array.isArray(traj.p) || traj.p.length === 0) continue
    if (!strokeMap.has(s.zi_id)) strokeMap.set(s.zi_id, [])
    strokeMap.get(s.zi_id).push({
      stroke_order: s.stroke_order,
      stroke_type: s.stroke_type,
      trajectory_data: traj
    })
  }
  for (const list of strokeMap.values()) {
    list.sort((a, b) => a.stroke_order - b.stroke_order)
  }

  // ---- 3. 常用字（按权重排序，取前 count 个） ----
  const byWeight = [...words.values()].sort((a, b) => b.weight - a.weight || (a.zi < b.zi ? -1 : 1))

  // 列表条目（数组格式 [汉字, 读音, 繁体标记?]，降低 json 体积）:
  //   - 繁体字追加第 3 元素 1（如 ["馬","ma3",1]），简体字无第 3 元素
  //   - 常用字: 字 + 第一个读音
  const tradFlag = w => (w.traditional ? [1] : [])
  const commons = byWeight.slice(0, count).map(w => [w.zi, w.readings[0] || '', ...tradFlag(w)])

  // 输出目录结构固定为 {out}/assets/{zi,pinyin}（out 默认 public/，可经 --out 指定）
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
    list.sort((a, b) => b.weight - a.weight || (a.zi < b.zi ? -1 : 1))
    writeJson(path.join(pinyinDir, plain, 'meta.json'),
      list.map(w => [w.zi, readingForPlain(w, plain), ...tradFlag(w)]))
  }
  console.log(`已导出拼音字列表: ${pinyinGroups.size} 个拼音 → ${pinyinDir}`)

  // ---- 6. 单个汉字信息（全部汉字）: 与 meta.json 同时导出该汉字笔画数据 ----
  // 笔画数据不限于常用字——凡笔画库中存在笔画的汉字均导出 strokes.json，
  // 无笔画数据的汉字不创建该文件；轨迹点为增量编码，降低存储占用
  let metaCount = 0
  let strokeCount = 0
  const BATCH = 2000
  const entries = [...words.values()]
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    for (const w of batch) {
      const cp = w.zi.codePointAt(0)
      const dir = path.join(ziDir, String(cp))
      // 单字母紧凑结构（c 汉字/p 读音/n 笔画数/r 部首/s 结构编码/t 繁体标记），降低存储开销
      // unicode 不存储，由前端按汉字直接计算
      writeJson(path.join(dir, 'meta.json'), {
        c: w.zi,
        p: w.readings,
        n: w.totalStrokes,
        r: w.radical,
        s: w.structure,
        t: w.traditional ? 1 : undefined
      })
      metaCount++
      // 笔画数据（上层共享结构: 版本与光栅实测盒 r 置于顶层，笔画条目不含重复字段）:
      //   { v, r, s: [{ o, t, d: { b, p } }] }
      const strokes = strokeMap.get(cp)
      if (strokes && strokes.length > 0) {
        const r = strokes[0].trajectory_data.r
        writeJson(path.join(dir, 'strokes.json'), {
          v: TRAJECTORY_VERSION,
          ...(r ? { r } : {}),
          s: strokes.map(st => ({
            o: st.stroke_order,
            t: st.stroke_type,
            d: {
              b: st.trajectory_data.b ?? 0,
              p: deltaEncode(st.trajectory_data.p)
            }
          }))
        })
        strokeCount++
      }
    }
    console.log(`已导出汉字信息 ${metaCount}/${entries.length}`)
  }

  console.log(`导出完成: 汉字信息 ${metaCount} 个，笔画数据 ${strokeCount} 个`)
}

main()
