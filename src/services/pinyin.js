// ============ 拼音工具 ============

// 带声调字符 → [无声调字符, 声调(1-4)]
const TONE_MAP = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4]
}

// 带声调拼音 → 无声调拼音
export function stripTone(py) {
  return String(py || '').split('').map(ch => (TONE_MAP[ch] || [ch, 0])[0]).join('')
}

// 音频文件名: 无声调拼音 + 声调数字（一声到四声 1-4；轻声不加数字）
// 例: yī → yi1, dì → di4, de（轻声）→ de
export function pinyinAudioName(py) {
  let plain = ''
  let tone = 0
  for (const ch of String(py || '')) {
    const t = TONE_MAP[ch]
    if (t) {
      plain += t[0]
      tone = t[1]
    } else {
      plain += ch
    }
  }
  return plain + (tone ? String(tone) : '')
}
