// 笔画画布/绘制常量（web 端展示配置）;
// 轨迹存储格式常量（v/b/r/p 单字符、各归一化系数与边界）见 shared/stroke-format.js（单一来源）
// 笔画基准宽度（内部 500 坐标系像素）: 无轨迹笔宽数据时的兜底
export const BASE_WIDTH = 4
export const CANVAS_SIZE = { width: 500, height: 500 }
// 笔画动画高亮色（正在绘制的笔画）
export const STROKE_HIGHLIGHT_COLOR = '#dc2626'
// 轨迹格式常量（单一来源，重导出供本组件库使用）
export {
  TRAJECTORY_VERSION, COORD_SCALE, PRESSURE_SCALE, TIMESTAMP_SCALE, BRUSH_SCALE,
  COORD_MIN, COORD_MAX, BRUSH_MIN, BRUSH_MAX
} from '../../shared/stroke-format.js'
