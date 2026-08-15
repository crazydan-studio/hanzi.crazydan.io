// ============ 静态数据加载（public/assets，由 build/export-data.js 导出生成） ============
// 静态文件采用单字母紧凑结构（降低存储开销），在此归一化为完整字段供页面使用
import { structureDisplayName } from '@components/CharacterStructures.js'
import { TRAJECTORY_VERSION } from '@components/Constants.js'

async function loadJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载失败: ${url}`)
  return res.json()
}

// meta.json 紧凑结构 → 完整字段
// { c: 汉字, p: 读音[], n: 笔画数, r: 部首, s: 结构编码 }
// unicode 不存储，按汉字直接计算；结构编码映射为展示名（不含「结构」与示例）
export function normalizeMeta(raw) {
  if (!raw) return raw
  return {
    character: raw.c,
    unicode: `U+${raw.c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    pinyin: raw.p,
    total_stroke_count: raw.n,
    radical: raw.r,
    structure: structureDisplayName(raw.s)
  }
}

// 轨迹增量编码点 → 绝对坐标点（strokes.json 存储 v6 增量格式以降低体积）
function deltaDecode(points) {
  const out = []
  let prev = null
  for (const p of points) {
    const point = prev
      ? [p[0] + prev[0], p[1] + prev[1], p[2] + prev[2], p[3] + prev[3]]
      : [p[0], p[1], p[2], p[3]]
    out.push(point)
    prev = point
  }
  return out
}

// strokes.json 紧凑结构 → 完整字段
// [{ o: 笔顺, t: 类型, d: { v: 轨迹版本, p: 点（v6 增量编码，解码为绝对坐标） } }]
export function normalizeStrokes(list) {
  return (list || []).map(s => ({
    stroke_order: s.o,
    stroke_type: s.t,
    trajectory_data: {
      version: s.d?.v,
      points: s.d?.v === TRAJECTORY_VERSION ? deltaDecode(s.d.p || []) : (s.d?.p || [])
    }
  }))
}

// 常用字列表（[字, 读音][]，按权重排序）
export function loadCommons() {
  return loadJson('/assets/zi/commons.json')
}

// 拼音字列表（[字, 读音][]，按权重排序）
export function loadPinyinList(plain) {
  return loadJson(`/assets/pinyin/${encodeURIComponent(plain)}/meta.json`)
}

// 单个汉字信息（public/assets/zi/{Unicode}/meta.json）
export async function loadCharMeta(unicode) {
  return normalizeMeta(await loadJson(`/assets/zi/${unicode}/meta.json`))
}

// 笔画数据（仅常用字存在；无则返回 null）
export async function loadCharStrokes(unicode) {
  const res = await fetch(`/assets/zi/${unicode}/strokes.json`)
  if (!res.ok) return null
  return normalizeStrokes(await res.json())
}
