// 汉字结构类型定义（数字编码稳定不变）
// code: 数字编码（characters.structure 存储值） | name: 结构名
// examples: 示例汉字
export const CHARACTER_STRUCTURES = [
  { code: 0, name: '未指定',     examples: [] },
  { code: 1, name: '独体字',     examples: ['人', '日', '水'] },
  { code: 2, name: '左右结构',   examples: ['好', '明', '林'] },
  { code: 3, name: '左中右结构', examples: ['树', '做', '辩'] },
  { code: 4, name: '上下结构',   examples: ['思', '花', '星'] },
  { code: 5, name: '上中下结构', examples: ['意', '草', '竟'] },
  { code: 6, name: '全包围结构', examples: ['国', '园', '回'] },
  { code: 7, name: '半包围结构', examples: ['区', '这', '同'] },
  { code: 8, name: '品字形结构', examples: ['品', '晶', '森'] },
  { code: 9, name: '镶嵌结构',   examples: ['坐', '乘', '爽'] }
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
