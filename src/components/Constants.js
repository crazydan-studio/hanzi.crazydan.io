// 笔画基准宽度（内部 500 坐标系像素）: 无轨迹笔宽数据时的兜底
export const BASE_WIDTH = 4
export const CANVAS_SIZE = { width: 500, height: 500 }
// 笔画动画高亮色（正在绘制的笔画）
export const STROKE_HIGHLIGHT_COLOR = '#dc2626'
// 笔画轨迹存储格式（版本号为数字，从 1 开始; 属性采用单字符，与静态 strokes 分片一致）:
//   v: 版本号; b: 笔刷面积/背景字面积 比值 ×BRUSH_SCALE 存整数（整轨迹共享笔宽），
//      还原笔宽 = sqrt(b / BRUSH_SCALE × 盒面积)
//   r: 绘制时背景字光栅实测盒 { w, h }（内部坐标系像素，整数; v2 起记录）——
//      盒的位置按约定为画布中心对齐，笔画可脱离字体按盒还原与按比例缩放
//   p: 轨迹点 [x, y, pressure, timestamp] ×1000/×100/×10 存整数;
//      x/y 以背景汉字墨迹盒为坐标系分别归一化（x 按盒宽、y 按盒高），
//      范围 [-2000, 3000]（允许笔画落在盒外 2 倍范围内）
export const TRAJECTORY_VERSION = 2
export const COORD_SCALE = 1000
export const PRESSURE_SCALE = 100
export const TIMESTAMP_SCALE = 10
export const BRUSH_SCALE = 100000
// 笔刷面积比取值边界（与 server/schemas/StrokeSchema.js 的 BRUSH_MAX 一致）
export const BRUSH_MIN = 0
export const BRUSH_MAX = 100 * BRUSH_SCALE
