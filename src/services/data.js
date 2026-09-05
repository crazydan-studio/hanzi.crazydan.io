// ============ 静态数据加载（public/assets，由 build/export-zi.js 导出生成） ============
// 静态文件采用紧凑结构（降低存储开销），在此归一化为完整字段供页面使用
import { structureDisplayName } from '@components/ZiStructures.js'
import { deltaDecode, unflattenPoints } from '../../shared/stroke-format.js'

async function loadJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载失败: ${url}`)
  return res.json()
}

// ---------- 汉字信息索引（index.json 单文件字典化） ----------
// 结构: { v, p: 读音字典, r: 部首字典, s: 结构字典, z: 每字紧凑行 }
// 行: [id, 读音索引(多音为数组), 笔画数, 部首索引, 结构索引, 繁体标记]
// 汉字与 unicode 不存储，由 id（码点）经 String.fromCodePoint 还原; 行按 id 升序，二分查找
let ziIndexCache = null

async function loadZiIndex() {
  if (!ziIndexCache) ziIndexCache = await loadJson('/assets/zi/index.json')
  return ziIndexCache
}

// 行查找: 二分查找（行按 id 升序）
function findIndexRow(rows, id) {
  let lo = 0
  let hi = rows.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const rowId = rows[mid][0]
    if (rowId === id) return rows[mid]
    if (rowId < id) lo = mid + 1
    else hi = mid - 1
  }
  return null
}

// index.json 紧凑行 → 完整字段（结构编码映射为展示名，不含「结构」与示例）
function normalizeMeta(index, row) {
  const [id, p, n, rIdx, sIdx, t] = row
  const pIndices = Array.isArray(p) ? p : [p]
  return {
    zi: String.fromCodePoint(id),
    unicode: `U+${id.toString(16).toUpperCase().padStart(4, '0')}`,
    pinyin: pIndices.map(i => index.p[i]),
    total_stroke_count: n,
    radical: index.r[rIdx],
    structure: structureDisplayName(index.s[sIdx]),
    is_traditional: t === 1
  }
}

// ---------- 笔画数据（strokes/{码点>>12}.json 码点分片） ----------
// 分片结构: { v, z: { 码点: [r, [[t, [b, 扁平点阵]], ...]] } }
// 轨迹点为增量编码的扁平一维数组（每 4 个一组: x/y/pr/t）;
// 笔画序号由数组下标推出; r 为光栅实测盒 [w, h] 或 null
// （扁平点阵还原与增量解码共用 shared/stroke-format.js，与 server/build 一致）

// 分片条目 → 完整笔画数组（trajectory_data 含 v/b/r/p 绝对坐标）
function normalizeStrokes(v, entry) {
  const [r, strokes] = entry
  return strokes.map((st, i) => ({
    stroke_order: i + 1,
    stroke_type: st[0],
    trajectory_data: {
      v,
      b: st[1][0],
      r: r ? { w: r[0], h: r[1] } : null,
      p: deltaDecode(unflattenPoints(st[1][1]))
    }
  }))
}

// 常用字列表（[字, 读音][]，按权重排序）
export function loadCommons() {
  return loadJson('/assets/zi/commons.json')
}

// 拼音字列表（pinyin/index.json 单文件，键为无声调拼音）; 无该拼音数据时返回 null
// 条目 [字, 声调数字(0=轻声), 繁体?]: 读音 = 键 + 声调，按列表页所需格式还原为 [字, 读音, 繁体?]
let pinyinIndexCache = null
export async function loadPinyinList(plain) {
  if (!pinyinIndexCache) pinyinIndexCache = await loadJson('/assets/pinyin/index.json')
  const list = pinyinIndexCache[plain]
  if (!list) return null
  return list.map(([zi, tone, trad]) => [
    zi,
    tone ? `${plain}${tone}` : plain,
    ...(trad ? [trad] : [])
  ])
}

// 单个汉字信息（index.json 单文件字典化，二分查找）; 不存在时抛错（页面据此显示未找到）
export async function loadZiMeta(unicode) {
  const index = await loadZiIndex()
  const row = findIndexRow(index.z, unicode)
  if (!row) throw new Error(`未找到汉字信息: ${unicode}`)
  return normalizeMeta(index, row)
}

// 笔画数据（strokes 码点分片; 无笔画数据/分片不存在时返回 null）
export async function loadZiStrokes(unicode) {
  const shard = unicode >> 12
  const res = await fetch(`/assets/zi/strokes/${shard}.json`)
  if (!res.ok) return null
  const data = await res.json()
  const entry = data.z[String(unicode)]
  if (!entry) return null
  return normalizeStrokes(data.v, entry)
}
