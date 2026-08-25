// 数据源 pinyin_zi 相关常量与工具（同步/导出脚本共用）

// 字典结构名 → 数字编码（与前端 ZI_STRUCTURES 一致）
// 0未指定 1独体 2左右 3左中右 4上下 5上中下 6全包围 7半包围(通用) 8品字 9镶嵌
// 10-16 半包围按包围方向细分
export const STRUCTURE_MAP = {
  '独体结构': 1, '左右结构': 2, '左中右结构': 3, '上下结构': 4,
  '上中下结构': 5, '全包围结构': 6, '半包围结构': 7, '品字结构': 8,
  '左上包围结构': 10, '右上包围结构': 11, '左下包围结构': 12,
  '上包围结构': 13, '下包围结构': 14, '左包围结构': 15, '右包围结构': 16
}

// 数字声调拼音: spell_value_ + spell_tone_（轻声不带数字），如 di+2 → di2
export const numberTonePinyin = (value, tone) => value + (tone ? String(tone) : '')

// 数字声调拼音 → 无声调拼音（去掉尾部声调数字）
export const stripTone = (py) => String(py || '').replace(/\d+$/, '')
