// 汉字结构类型定义（数字编码稳定不变; 7 为通用半包围，10-16 按包围方向细分）
// code: 数字编码（zi.structure 存储值） | name: 结构名
// examples: 示例汉字
export const ZI_STRUCTURES = [
  { code: 0, name: '未指定',     examples: [] },
  { code: 1, name: '独体字',     examples: ['人', '日', '水'] },
  { code: 2, name: '左右结构',   examples: ['好', '明', '林'] },
  { code: 3, name: '左中右结构', examples: ['树', '做', '辩'] },
  { code: 4, name: '上下结构',   examples: ['思', '花', '星'] },
  { code: 5, name: '上中下结构', examples: ['意', '草', '竟'] },
  { code: 6, name: '全包围结构', examples: ['国', '园', '回'] },
  { code: 7, name: '半包围结构', examples: ['区', '这', '同'] },
  { code: 8, name: '品字形结构', examples: ['品', '晶', '森'] },
  { code: 9, name: '镶嵌结构',   examples: ['坐', '乘', '爽'] },
  // 半包围按包围方向细分（7 保持通用）
  { code: 10, name: '左上包围结构', examples: ['压', '病', '居', '历'] },
  { code: 11, name: '右上包围结构', examples: ['句', '可', '司', '氧'] },
  { code: 12, name: '左下包围结构', examples: ['这', '边', '建', '廷'] },
  { code: 13, name: '上包围结构',   examples: ['同', '风', '周', '问'] },
  { code: 14, name: '下包围结构',   examples: ['凶', '函', '画', '击'] },
  { code: 15, name: '左包围结构',   examples: ['区', '医', '巨', '匹'] },
  { code: 16, name: '右包围结构',   examples: [] }
]

// code → 结构对象映射
export const ziStructuresMap = Object.fromEntries(
  ZI_STRUCTURES.map(s => [s.code, s]))

// 结构展示名（不含「结构/字/形」后缀、无示例；对应静态数据 index.json 中存储的结构编码）
// 由 ZI_STRUCTURES.name 派生（单一来源，避免两表漂移）: 如「品字形结构」→「品字」
const STRUCTURE_DISPLAY_NAMES = Object.fromEntries(
  ZI_STRUCTURES.map(s => [s.code, s.name.replace(/结构$/, '').replace(/字$/, '').replace(/形$/, '')]))

export function structureDisplayName(code) {
  return STRUCTURE_DISPLAY_NAMES[code ?? 0] ?? '未指定'
}

// 结构显示文本（名称 + 示例，如 "左右结构 (好·明·林)"）
export function structureLabel(code) {
  const s = ziStructuresMap[code ?? 0]
  if (!s) return '未指定'
  return s.examples?.length ? `${s.name} (${s.examples.join('·')})` : s.name
}
