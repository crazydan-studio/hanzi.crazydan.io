// 从笔画数据库导出静态数据到 public/assets（供前端页面直接加载）
// 数据源: server/data/hanzi_stroke.db（zi 表: 汉字信息；strokes 表: 笔画轨迹单字单行，
//         由 pnpm import:pinyin 导入维护）
// 导出内容:
//   - public/assets/zi/commons.json          常用字列表（[字, 读音][]，按权重排序，仅字+第一个读音）
//   - public/assets/pinyin/{拼音}/meta.json  拼音字列表（[字, 读音][]，按权重排序；
//                                            读音为该无声调拼音对应的第一个带声调拼音）
//   - public/assets/zi/index.json            全部汉字信息单文件字典化
//    （读音/部首/结构三字典 + 每字紧凑行 [id, 读音索引, 笔画数, 部首索引, 结构索引, 繁体]；
//     汉字与 unicode 不存储，由码点经 String.fromCodePoint 还原）
//   - public/assets/zi/strokes/{码点>>12}.json 笔画数据码点分片（每字一条目:
//     [r, [[t, [b, 扁平点阵]], ...]]，序号由数组下标推出，轨迹点为增量编码;
//     仅该汉字存在笔画数据时创建分片）
// 用法:
//   pnpm export:zi                                      # 默认导出 1500 个常用字 + 全量拼音
//   pnpm export:zi -- --count 200                       # 指定常用字数量
//   pnpm export:zi -- --db b.db --out public            # 指定库与输出目录
import { DatabaseSync } from 'node:sqlite'
import { decompressCharTrajectory, deltaEncode, flattenPoints, TRAJECTORY_VERSION } from '../server/services/Trajectory.js'
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

  // ---- 2. 读取笔画数据（全部汉字的笔画轨迹，单字单行） ----
  const strokeRows = src.prepare(`
    SELECT zi_id, trajectory_data
    FROM strokes
  `).all()

  // unicode → { r, strokes: [{t, d:{b,p}}] }（绝对坐标）
  const strokeMap = new Map()
  for (const s of strokeRows) {
    let traj = null
    try { traj = decompressCharTrajectory(s.trajectory_data) } catch { continue }
    if (!traj || !Array.isArray(traj.strokes) || traj.strokes.length === 0) continue
    strokeMap.set(s.zi_id, traj)
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

  // 清理旧导出（先删除现有目录与文件，含 index.json/strokes 分片，
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

  // ---- 6. 全部汉字信息: 单文件字典化（读音/部首/结构三字典 + 每字紧凑行） ----
  // 行结构 [id, 读音索引(多音为数组), 笔画数, 部首索引, 结构索引, 繁体标记]，
  // 按 id（码点）升序排列，前端二分查找; 汉字与 unicode 均不存储，由码点还原
  const dictP = []
  const dictR = ['']   // 索引 0 = 无部首
  const dictS = []
  const ziIndexRows = []
  for (const w of [...words.values()].sort((a, b) => a.zi.codePointAt(0) - b.zi.codePointAt(0))) {
    const p = w.readings.map(reading => {
      let idx = dictP.indexOf(reading)
      if (idx === -1) { dictP.push(reading); idx = dictP.length - 1 }
      return idx
    })
    let rIdx = dictR.indexOf(w.radical)
    if (rIdx === -1) { dictR.push(w.radical); rIdx = dictR.length - 1 }
    let sIdx = dictS.indexOf(w.structure)
    if (sIdx === -1) { dictS.push(w.structure); sIdx = dictS.length - 1 }
    const row = [w.zi.codePointAt(0), p.length === 1 ? p[0] : p, w.totalStrokes, rIdx, sIdx]
    if (w.traditional) row.push(1)
    ziIndexRows.push(row)
  }
  writeJson(path.join(ziDir, 'index.json'), {
    v: 1,
    p: dictP,
    r: dictR,
    s: dictS,
    z: ziIndexRows
  })
  console.log(`已导出汉字信息索引: ${ziIndexRows.length} 字 → ${path.join(ziDir, 'index.json')}（读音 ${dictP.length} / 部首 ${dictR.length} / 结构 ${dictS.length}）`)

  // ---- 7. 笔画数据: 码点分片合并（每字一条目，序号由数组下标推出，点阵扁平化） ----
  // 分片路径 strokes/{码点>>12}.json，仅存在笔画数据的码点分片才创建;
  // 条目结构: { 码点: [r, [[t, [b, 扁平点阵]], ...]] }，r 为 [w,h] 或 null
  let strokeCount = 0
  const shardDir = path.join(ziDir, 'strokes')
  fs.mkdirSync(shardDir, { recursive: true })
  const shards = new Map()   // cp>>12 → { v, z: {} }
  for (const [cp, traj] of strokeMap) {
    const shardKey = cp >> 12
    let shard = shards.get(shardKey)
    if (!shard) {
      shard = { v: TRAJECTORY_VERSION, z: {} }
      shards.set(shardKey, shard)
    }
    shard.z[String(cp)] = [
      traj.r ? [traj.r.w, traj.r.h] : null,
      traj.strokes.map(s => [
        s.t,
        [s.d.b ?? 0, flattenPoints(deltaEncode(s.d.p))]
      ])
    ]
    strokeCount++
  }
  for (const [shardKey, shard] of shards) {
    writeJson(path.join(shardDir, `${shardKey}.json`), shard)
  }
  if (shards.size > 0) {
    console.log(`已导出笔画数据: ${strokeCount} 字 → ${shards.size} 个分片（${shardDir}）`)
  }

  console.log(`导出完成: 汉字信息 ${ziIndexRows.length} 个，笔画数据 ${strokeCount} 个`)
}

main()
