export const BASE_WIDTH = 4
export const CANVAS_SIZE = { width: 500, height: 500 }
// 展示/播放笔触宽度系数（与书写页默认笔触「特粗」一致）
export const DISPLAY_PEN_WIDTH_COEF = 6
// 笔画动画高亮色（正在绘制的笔画）
export const STROKE_HIGHLIGHT_COLOR = '#dc2626'
// 笔画轨迹存储格式（v7）: x/y 归一化 ×1000（0.5px 分辨率）、压力 ×100、时间戳 ×10
export const TRAJECTORY_VERSION = '7.0'
export const COORD_SCALE = 1000
export const PRESSURE_SCALE = 100
export const TIMESTAMP_SCALE = 10
