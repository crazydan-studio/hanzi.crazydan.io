// 笔画基准宽度（内部 500 坐标系像素）: 无轨迹笔宽数据时的兜底
export const BASE_WIDTH = 4
export const CANVAS_SIZE = { width: 500, height: 500 }
// 笔画动画高亮色（正在绘制的笔画）
export const STROKE_HIGHLIGHT_COLOR = '#dc2626'
// 笔画轨迹存储格式（版本号为数字，从 1 开始）:
//   - x/y 以背景汉字墨迹盒为坐标系分别归一化（x 按盒宽、y 按盒高），×1000 存整数，
//     范围 [-2000, 3000]（允许笔画落在盒外 2 倍范围内）
//   - pressure ×100、timestamp ×10 存整数
//   - brush: 笔刷面积/背景字面积 比值 ×BRUSH_SCALE 存整数（整轨迹共享笔宽），
//     还原笔宽 = sqrt(brush / BRUSH_SCALE × 当前盒面积)
//     BRUSH_SCALE=100000 精度: 典型盒下笔宽量化误差约 0.03px
export const TRAJECTORY_VERSION = 1
export const COORD_SCALE = 1000
export const PRESSURE_SCALE = 100
export const TIMESTAMP_SCALE = 10
export const BRUSH_SCALE = 100000
// 笔刷面积比取值边界（与 server/trajectory.js 一致）
export const BRUSH_MIN = 0
export const BRUSH_MAX = 100 * BRUSH_SCALE
