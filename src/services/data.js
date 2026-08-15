// ============ 静态数据加载（public/assets，由 build/export-data.js 导出生成） ============

async function loadJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`加载失败: ${url}`)
  return res.json()
}

// 常用字列表（[{ char, pinyin }]，按权重排序）
export function loadCommons() {
  return loadJson('/assets/zi/commons.json')
}

// 拼音字列表（[{ char, pinyin }]，按权重排序）
export function loadPinyinList(plain) {
  return loadJson(`/assets/pinyin/${encodeURIComponent(plain)}/meta.json`)
}

// 单个汉字信息（public/assets/zi/{Unicode}/meta.json）
export function loadCharMeta(unicode) {
  return loadJson(`/assets/zi/${unicode}/meta.json`)
}

// 笔画数据（仅常用字存在；无则返回 null）
export async function loadCharStrokes(unicode) {
  const res = await fetch(`/assets/zi/${unicode}/strokes.json`)
  if (!res.ok) return null
  return res.json()
}
