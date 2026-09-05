import { z } from 'zod'
import { HANZI_SINGLE_RE } from '../../src/config.js'
import { STRUCTURE_CODE_MAX } from '../services/PinyinDict.js'

// 单个汉字（覆盖数据源全部范围: CJK 基本区 + 扩展A + 〇，见 src/config.js HANZI_SINGLE_RE）
export const singleZiSchema = z.string()
  .length(1, 'Must be a single zi')
  .regex(HANZI_SINGLE_RE, 'Must be a valid Chinese zi')

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive()
})

// 按字查询参数（/api/zi/by-zi/:zi）
export const ziParamSchema = z.object({
  zi: singleZiSchema
})

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().max(50).optional(),        // 按字或拼音(无声调)过滤
  // 笔画图过滤: '1' 完整(cnt==total) | '2' 仅含部分笔画图(cnt>0且不等) | '0' 无笔画图(cnt=0)
  has_strokes: z.enum(['0', '1', '2']).optional()
})

// 汉字仅创建用（脚本直插DB，API保留用于测试；前端不再提供新增）
export const createZiSchema = z.object({
  zi: singleZiSchema,
  pinyin: z.array(z.string()).default([]),            // 读音（数字声调，可多音）
  used_weight: z.number().int().min(0).default(0),
  structure: z.number().int().min(0).max(STRUCTURE_CODE_MAX).default(0),
  total_stroke_count: z.number().int().min(0).default(0)
})

// 更新: 结构/部首/读音/笔画数可编辑（其余数据只读，来自字典导入）
// pinyin: 数字声调拼音列表（可多音，如 ['de','di4','di2']）
export const updateZiSchema = z.object({
  structure: z.number().int().min(0).max(STRUCTURE_CODE_MAX).optional(),
  radical: z.string().max(10).optional(),
  pinyin: z.array(z.string()).max(10).optional(),
  total_stroke_count: z.number().int().min(0).max(999).optional()
})
