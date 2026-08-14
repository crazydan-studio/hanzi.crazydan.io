// 汉字结构类型定义（数字编码稳定不变）
// code: 数字编码（characters.structure 存储值） | name: 结构名
// examples: 示例汉字 | desc: 说明
export const CHARACTER_STRUCTURES = [
  { code: 0, name: '未指定',     examples: [],                     desc: '尚未指定结构' },
  { code: 1, name: '独体字',     examples: ['人', '日', '水'],     desc: '单一形体，不可拆分' },
  { code: 2, name: '左右结构',   examples: ['好', '明', '林'],     desc: '左+右两部分' },
  { code: 3, name: '左中右结构', examples: ['树', '做', '辩'],     desc: '左+中+右三部分' },
  { code: 4, name: '上下结构',   examples: ['思', '花', '星'],     desc: '上+下两部分' },
  { code: 5, name: '上中下结构', examples: ['意', '草', '竟'],     desc: '上+中+下三部分' },
  { code: 6, name: '全包围结构', examples: ['国', '园', '回'],     desc: '四面包围' },
  { code: 7, name: '半包围结构', examples: ['区', '这', '同'],     desc: '部分包围（上/下/左/右）' },
  { code: 8, name: '品字形结构', examples: ['品', '晶', '森'],     desc: '三部分品字排列' },
  { code: 9, name: '镶嵌结构',   examples: ['坐', '乘', '爽'],     desc: '嵌入结构' }
]

// code → 结构对象映射
export const characterStructuresMap = Object.fromEntries(
  CHARACTER_STRUCTURES.map(s => [s.code, s]))

// 结构显示文本（名称 + 示例，如 "左右结构 (好·明·林)"）
export function structureLabel(code) {
  const s = characterStructuresMap[code ?? 0]
  if (!s) return '未指定'
  return s.examples?.length ? `${s.name} (${s.examples.join('·')})` : s.name
}
