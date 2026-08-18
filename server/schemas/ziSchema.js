import { z } from 'zod'

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().max(50).optional(),        // 按字或拼音(无声调)过滤
  // 笔画图过滤: '1'/'true' 完整(cnt==total) | '2'/'partial' 仅含部分笔画图(cnt>0且不等) | '0'/'false' 无笔画图(cnt=0)
  has_strokes: z.enum(['0', '1', '2', 'true', 'false', 'partial']).optional()
})

// 汉字仅创建用（脚本直插DB，API保留用于测试；前端不再提供新增）
export const createZiSchema = z.object({
  zi: z.string()
    .length(1, 'Must be a single zi')
    .regex(/^[\u4e00-\u9fff]$/, 'Must be a valid Chinese zi'),
  pinyin: z.array(z.string()).default([]),            // 读音（数字声调，可多音）
  used_weight: z.number().int().min(0).default(0),
  structure: z.number().int().min(0).max(9).default(0),
  total_stroke_count: z.number().int().min(0).default(0)
})

// 更新: 仅 structure / radical 可编辑（其余数据只读，来自字典导入）
export const updateZiSchema = z.object({
  structure: z.number().int().min(0).max(9).optional(),
  radical: z.string().max(10).optional()
})
