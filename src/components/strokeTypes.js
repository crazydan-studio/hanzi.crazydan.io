// 笔画类型定义（35 种细化类型 + 未指定，数字编码稳定不变）
// code: 数字编码（数据库存储值） | name: 中文名 | shape: 示例字形
export const STROKE_TYPES = [
  { code: 0,  name: '未指定',     shape: '' },
  // ---- 基本笔画 ----
  { code: 1,  name: '点',         shape: '丶' },
  { code: 2,  name: '横',         shape: '一' },
  { code: 3,  name: '竖',         shape: '丨' },
  { code: 4,  name: '撇',         shape: '丿' },
  { code: 5,  name: '捺',         shape: '㇏' },
  { code: 6,  name: '提',         shape: '㇀' },
  // ---- 横系折笔 ----
  { code: 7,  name: '横折',       shape: '𠃍' },
  { code: 8,  name: '横撇',       shape: 'フ' },
  { code: 9,  name: '横钩',       shape: '乛' },
  { code: 10, name: '横折钩',     shape: '𠃌' },
  { code: 11, name: '横折提',     shape: '㇊' },
  { code: 12, name: '横折弯',     shape: '㇍' },
  { code: 13, name: '横折折',     shape: '㇅' },
  { code: 14, name: '横斜钩',     shape: '⺄' },
  { code: 15, name: '横折弯钩',   shape: '㇈' },
  { code: 16, name: '横撇弯钩',   shape: '㇌' },
  { code: 17, name: '横折折撇',   shape: '㇋' },
  { code: 18, name: '横折折折钩', shape: '𠄎' },
  { code: 19, name: '横折折折',   shape: '㇎' },
  // ---- 竖系折笔 ----
  { code: 20, name: '竖提',       shape: '𠄌' },
  { code: 21, name: '竖折',       shape: '𠃊' },
  { code: 22, name: '竖钩',       shape: '亅' },
  { code: 23, name: '竖弯',       shape: '㇄' },
  { code: 24, name: '竖弯钩',     shape: '乚' },
  { code: 25, name: '竖折撇',     shape: 'ㄣ' },
  { code: 26, name: '竖折折',     shape: '𠃑' },
  { code: 27, name: '竖折折钩',   shape: '㇉' },
  // ---- 撇/点系 ----
  { code: 28, name: '撇点',       shape: '𡿨' },
  { code: 29, name: '撇折',       shape: '𠃋' },
  { code: 30, name: '斜钩',       shape: '㇂' },
  { code: 31, name: '弯钩',       shape: '㇁' },
  { code: 32, name: '卧钩',       shape: '㇃' },
  { code: 33, name: '平捺',       shape: '㇏' },
  { code: 34, name: '点撇',       shape: '丿' },
  { code: 35, name: '点捺',       shape: '㇏' }
]

// code → 类型对象映射（保存笔画时取名称/形状）
export const strokeTypesMap = Object.fromEntries(STROKE_TYPES.map(t => [t.code, t]))

// 旧字符串编码 → 新数字编码（迁移用）
export const LEGACY_STROKE_TYPE_MAP = {
  unassigned: 0,
  dian: 1, heng: 2, shu: 3, pie: 4, na: 5, ti: 6,
  hengzhe: 7, hengpie: 8, henggou: 9, hengzhegou: 10,
  hengzhehenggou: 18, shuzhe: 21, shugou: 22, shuwangou: 24,
  shuzhe: 21, piezhe: 29
}
