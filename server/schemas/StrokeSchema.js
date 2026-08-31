import { z } from 'zod'
import { COORD_MIN, COORD_MAX, PRESSURE_SCALE, BRUSH_SCALE } from '../services/Trajectory.js'

// 笔画类型数字编码 0-35（与前端 StrokeTypes.js 的 STROKE_TYPES 一一对应，
// 数字编码为约定，跨语言无法共享）: 0=未指定, 1-6 基本笔画（点横竖撇捺提）,
// 7-19 横系折笔, 20-27 竖系折笔, 28-35 撇/点系
export const STROKE_TYPE_MIN = 0
export const STROKE_TYPE_MAX = 35
export const strokeTypeSchema = z.number().int().min(STROKE_TYPE_MIN).max(STROKE_TYPE_MAX)

// 轨迹点: 元组数组 [x, y, pressure, timestamp]（均按存储比例取整数，见 Trajectory.js）
// x/y 以背景汉字墨迹盒为坐标系分别归一化: x 相对盒宽、y 相对盒高（×COORD_SCALE 存整数）；
// 范围放宽（-2..3 倍盒尺寸），允许笔画落在盒外
const pointTuple = z.tuple([
  z.number().int().min(COORD_MIN).max(COORD_MAX),   // x 盒相对归一化 ×1000
  z.number().int().min(COORD_MIN).max(COORD_MAX),   // y
  z.number().int().min(0).max(PRESSURE_SCALE),      // pressure ×100
  z.number().int().min(0).finite()                  // timestamp ×10
])

// 笔刷归一化上限: 笔宽 500（内部坐标全画布）对最小盒面积(50×50)的比值 = 100 → ×BRUSH_SCALE
const BRUSH_MAX = 100 * BRUSH_SCALE

// 光栅实测盒（单字符 r）: 绘制时背景字墨迹盒宽高（内部坐标系像素，整数）；
// 盒的位置按约定为画布中心对齐，笔画可脱离字体按盒还原与按比例缩放
const inkBoxSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive()
})

// 轨迹对象采用单字符属性（与静态 strokes 分片紧凑结构一致）: v 版本 / b 笔刷 / r 光栅实测盒 / p 点
export const trajectorySchema = z.object({
  v: z.number().int().positive(),                 // 轨迹格式版本（数字，从 1 开始）
  b: z.number().int().min(0).max(BRUSH_MAX),      // 笔刷面积/背景字面积 ×BRUSH_SCALE
  r: inkBoxSchema,                                // 光栅实测盒宽高（v2 起必填）
  p: z.array(pointTuple).min(1)
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
