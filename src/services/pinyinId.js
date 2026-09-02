// 拼音双射基数编码（与 App 端 PinyinId 一致，跨端数值恒等）:
// 拼音字符串 ↔ 唯一正整数（无碰撞、可逆、可扩展，任意新读音自动获得唯一 id）。
// 算法: 字母表 31 符号（26 字母 + ü + 声调数字 1-4），位值 = 下标 + 1（无零位），
// 字符串即 31 进制「无零位」数（Excel 列号法推广）。
// 注意: 字母表一经发布不可变，新增符号只能追加到末尾，否则既有 id 全部变化;
//       入参须为规范数字声调拼音（v 已归一化为 ü），含 v 将抛错。
const PINYIN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzü1234'
const PINYIN_BASE = PINYIN_ALPHABET.length   // 31

// 拼音 → 整数（如 "a" → 1、"di4" → 4154、"lü4" → 12400）; 非法字符抛错
export function pinyinToId(reading) {
  let v = 0
  for (const ch of reading) {
    const d = PINYIN_ALPHABET.indexOf(ch) + 1
    if (d === 0) throw new Error(`拼音含非法字符: ${ch}`)
    v = v * PINYIN_BASE + d
  }
  return v
}

// 整数 → 拼音（pinyinToId 的逆运算; 对任意正整数均可还原）
export function idToPinyin(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`非法拼音 id: ${id}`)
  }
  let reading = ''
  let v = id
  while (v > 0) {
    const d = (v - 1) % PINYIN_BASE
    reading = PINYIN_ALPHABET[d] + reading
    v = Math.floor((v - 1) / PINYIN_BASE)
  }
  return reading
}
