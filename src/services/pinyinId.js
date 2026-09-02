// 拼音分量编码（与 App 端 PinyinId 一致，跨端数值恒等）:
// 数字声调拼音 → 唯一整数。不要求可逆，只保证唯一性——
// 利用拼音结构: 声母(24, 含零声母) × 韵母(40) × 声调(5: 0-3 = 1~4 声, 4 = 轻声)
//   id = ((声母下标 × 韵母数 + 韵母下标) × 5 + 声调槽) < 4800（13 位，uint16 容纳）
// 解析规则: 整字命中韵母表 → 零声母; 否则取最长匹配声母剥离，余部须在韵母表
//   （jue/xue/que/yue 的 ü 按拼写规则写 u → 韵母 ue; 叹词 n/m/ng/hm/hng 为整字韵母）
// 注意: 声母/韵母表一经发布不可变，新增只追加到末尾（否则既有 id 变化）;
//       入参须为规范数字声调拼音（ü 原样，v 需先归一化为 ü），含 v 将抛错。
const INITIALS = ['', 'zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']
const FINALS = ['a', 'o', 'e', 'i', 'u', 'ü',
  'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'er',
  'ia', 'ie', 'iao', 'ian', 'iang', 'iong', 'in', 'ing',
  'ua', 'uo', 'uai', 'uan', 'uang', 'ui', 'un', 'ong',
  'ue', 'üe', 'ün', 'iu', 'n', 'm', 'ng', 'hm', 'hng']
const FINAL_SET = new Set(FINALS)

// 拼音 → 整数（如 "a" → 4、"de" → 1614、"di4" → 1618、"lü4" → 2228; 上限 4799）; 非法拼音抛错
export function pinyinToId(reading) {
  const tone = /\d$/.test(reading) ? Number(reading.slice(-1)) - 1 : 4
  const plain = /\d$/.test(reading) ? reading.slice(0, -1) : reading

  let i = 0
  let f = FINALS.indexOf(plain)   // 整字韵母（零声母，含叹词）
  if (f === -1) {
    i = INITIALS.findIndex(x => x && plain.startsWith(x))
    if (i !== -1) f = FINALS.indexOf(plain.slice(INITIALS[i].length))
  }
  if (i === -1 || f === -1) {
    throw new Error(`非法拼音: ${reading}`)
  }
  return (i * FINALS.length + f) * 5 + tone
}
