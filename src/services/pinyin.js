// ============ 拼音工具 ============
// 拼音以数字声调形式存储（如 di2、lü4；轻声不带数字，如 de），
// 展示时按 kuaizi-ime numberToSymbolTonePinyin 的逻辑转换为符号声调（如 dì、lǜ）

// 声调符号映射表
const TONE_MARKS = {
  a: { 1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à' },
  e: { 1: 'ē', 2: 'é', 3: 'ě', 4: 'è' },
  i: { 1: 'ī', 2: 'í', 3: 'ǐ', 4: 'ì' },
  o: { 1: 'ō', 2: 'ó', 3: 'ǒ', 4: 'ò' },
  u: { 1: 'ū', 2: 'ú', 3: 'ǔ', 4: 'ù' },
  ü: { 1: 'ǖ', 2: 'ǘ', 3: 'ǚ', 4: 'ǜ' },
  // n, ng, hng
  n: { 2: 'ń', 3: 'ň', 4: 'ǹ' },
  // m, hm
  m: { 1: 'm̄', 2: 'ḿ', 4: 'm̀' }
}

// 在拼音中找出应该标声调的元音索引（与 kuaizi-ime spell.mjs 一致）
function indexOfMainVowel(py) {
  // 特殊处理 iu 和 ui
  if (py.includes('iu')) return py.lastIndexOf('u')
  if (py.includes('ui')) return py.lastIndexOf('i')
  if (['ng', 'n', 'hng'].includes(py)) return py.lastIndexOf('n')
  if (['hm', 'm'].includes(py)) return py.lastIndexOf('m')

  // 优先级顺序：a > o > e > i > u > ü
  const vowels = ['a', 'o', 'e', 'i', 'u', 'ü']
  for (const vowel of vowels) {
    const idx = py.indexOf(vowel)
    if (idx !== -1) return idx
  }
  return -1
}

// 数字声调拼音 → 符号声调拼音，如 "di2" → "dí"、"lü4" → "lǜ"、"de" → "de"
// 逻辑对齐: https://github.com/crazydan-studio/kuaizi-ime/blob/master/tools/pinyin-dict/src/utils/spell.mjs
export function numberToSymbolTonePinyin(pinyin) {
  const match = String(pinyin || '').match(/(\d+)$/)
  if (!match) return pinyin

  const tone = parseInt(match[1], 10)
  const base = pinyin.slice(0, -match[1].length)

  if (tone === 0) return base

  const vowelIndex = indexOfMainVowel(base)
  if (vowelIndex === -1) return base

  const vowel = base[vowelIndex]
  const mark = TONE_MARKS[vowel]?.[tone]
  if (!mark) return base

  return base.slice(0, vowelIndex) + mark + base.slice(vowelIndex + 1)
}

