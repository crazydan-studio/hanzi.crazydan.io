import { z } from 'zod'
import { COORD_SCALE, PRESSURE_SCALE } from '../services/trajectory.js'

// 笔画类型数字编码 0-35（与前端 strokeTypes.js 一致）
// 0=未指定, 1=点, 2=横, 3=竖, 4=撇, 5=捺, 6=提, 7=横折, 8=横撇, 9=横钩,
// 10=横折钩, 11=横折提, 12=横折弯, 13=横折折, 14=横斜钩, 15=横折弯钩,
// 16=横撇弯钩, 17=横折折撇, 18=横折折折钩, 19=横折折折, 20=竖提, 21=竖折,
// 22=竖钩, 23=竖弯, 24=竖弯钩, 25=竖折撇, 26=竖折折, 27=竖折折钩,
// 28=撇点, 29=撇折, 30=斜钩, 31=弯钩, 32=卧钩, 33=平捺, 34=点撇, 35=点捺
export const STROKE_TYPE_MIN = 0
export const STROKE_TYPE_MAX = 35
export const strokeTypeSchema = z.number().int().min(STROKE_TYPE_MIN).max(STROKE_TYPE_MAX)

// 轨迹点: 元组数组 [x, y, pressure, timestamp]（均按存储比例取整数，见 trajectory.js）
const pointTuple = z.tuple([
  z.number().int().min(0).max(COORD_SCALE),      // x 归一化 ×1000（0.5px 分辨率）
  z.number().int().min(0).max(COORD_SCALE),      // y
  z.number().int().min(0).max(PRESSURE_SCALE),   // pressure ×100
  z.number().int().min(0).finite()               // timestamp ×10
])

export const trajectorySchema = z.object({
  version: z.string(),
  points: z.array(pointTuple).min(1)
    .superRefine((pts, ctx) => {
      // 时间戳必须单调不减（回放引擎按升序扫描区间）
      for (let i = 1; i < pts.length; i++) {
        if (pts[i][3] < pts[i - 1][3]) {
          ctx.addIssue({ code: 'custom', message: `timestamp not monotonic at index ${i}` })
          break
        }
      }
    })
})

// 接受对象或JSON字符串，归一化为对象
// 注意: 字符串必须先 JSON.parse 再走 trajectorySchema 校验形状（不能只校验可解析）
const trajectoryInput = z.union([
  trajectorySchema,
  z.string().transform((str, ctx) => {
    let parsed
    try {
      parsed = JSON.parse(str)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid trajectory JSON' })
      return z.NEVER
    }
    const result = trajectorySchema.safeParse(parsed)
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: 'Invalid trajectory data shape' })
      return z.NEVER
    }
    return result.data
  })
])

export const createStrokeSchema = z.object({
  stroke_order: z.number().int().min(1),
  stroke_type: strokeTypeSchema.default(0),
  trajectory_data: trajectoryInput
})

// 更新Schema: 显式全optional且无default（避免PATCH时默认值覆盖已存数据）
export const updateStrokeSchema = z.object({
  stroke_order: z.number().int().min(1).optional(),
  stroke_type: strokeTypeSchema.optional(),
  trajectory_data: trajectoryInput.optional()
})

export const batchCreateStrokesSchema = z.object({
  strokes: z.array(createStrokeSchema).min(1).max(100)
})

// 重排笔画顺序: strokeIds 为按新顺序排列的笔画 id 数组
export const reorderStrokesSchema = z.object({
  strokeIds: z.array(z.number().int().positive()).min(1).max(100)
})
