import { TRAJECTORY_VERSION, COORD_SCALE, PRESSURE_SCALE, TIMESTAMP_SCALE, BRUSH_MIN, BRUSH_MAX, COORD_MIN, COORD_MAX } from './Constants.js'

// 抽稀降采样阈值: 与上一保留点距离小于 0.001（盒相对归一化坐标，盒宽约 0.4-0.5px）
// 的点丢弃，0.5px 粒度对笔触渲染不可感知，可显著降低轨迹点数与存储占用
const MIN_POINT_DIST = 0.001
const MIN_POINT_DIST_SQ = MIN_POINT_DIST * MIN_POINT_DIST

// 盒相对坐标取值范围 [-2, 3]（允许笔画落在盒外 2 倍宽/高范围内），
// 由格式常量（COORD_MIN/MAX 为 ×COORD_SCALE 整数）推导，与 server 校验同一来源
export const NORM_MIN = COORD_MIN / COORD_SCALE
export const NORM_MAX = COORD_MAX / COORD_SCALE

function clampNorm(v) {
  return Math.max(NORM_MIN, Math.min(NORM_MAX, v))
}

// 录制核心（与画布解耦，可复用）
// 输入坐标均为【背景汉字墨迹盒相对归一化】浮点值:
//   x: (画布x - 盒x0) / 盒宽 ∈ 约[0,1]
//   y: (画布y - 盒y0) / 盒高
// 存储时 ×COORD_SCALE 取整数；笔刷以 面积比 ×BRUSH_SCALE 存整数
export class StrokeRecorder {
  constructor() {
    this.points = []
    this.isRecording = false
    this.startTime = 0
  }

  startRecording() {
    this.points = []
    this.isRecording = true
    // 使用单调时钟 performance.now()（Date.now() 会因系统时间调整回拨，
    // 导致轨迹时间戳不单调，触发后端校验失败）
    this.startTime = performance.now()
  }

  // pressure: 0-1；设备无压力时调用方传 0.5
  // x/y: 盒相对归一化坐标（调用方已换算并 clamp）
  // 抽稀: 与上一保留点距离小于阈值时丢弃该点（首点始终保留）
  addPoint(x, y, pressure) {
    if (!this.isRecording) return
    const last = this.points[this.points.length - 1]
    if (last) {
      const dx = x - last.x
      const dy = y - last.y
      if (dx * dx + dy * dy < MIN_POINT_DIST_SQ) return
    }
    const ts = performance.now() - this.startTime   // 相对偏移（单调）
    // 防倒退保护: 即使时钟异常也保证单调不减
    const prev = this.points[this.points.length - 1]
    const timestamp = prev ? Math.max(ts, prev.timestamp) : ts
    this.points.push({
      x: clampNorm(x), y: clampNorm(y),
      pressure: Math.max(0, Math.min(1, pressure)),
      timestamp
    })
  }

  // 设置该笔画的归一化笔刷值（面积比 ×BRUSH_SCALE），由调用方在笔画结束时传入
  setBrush(brush) {
    this.brush = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Math.round(brush || 0)))
  }

  // 记录绘制时背景字光栅实测盒宽高（v2 格式，单字符 r）: 脱离字体按盒还原与按比例缩放
  setBox(w, h) {
    this.r = { w: Math.round(w), h: Math.round(h) }
  }

  stopRecording() {
    this.isRecording = false
    return this.generateTrajectoryData()
  }

  // 仅记录坐标点数据（元组数组 [x,y,pressure,timestamp]，降低存储开销）;
  // 轨迹属性采用单字符: v 版本 / b 笔刷面积比 / r 光栅实测盒 / p 坐标点
  // x/y: 盒相对归一化 ×COORD_SCALE 整数（x 按盒宽、y 按盒高）
  // pressure/timestamp 同 ×比例取整数; 整数存储可消除浮点噪声并减小体积
  generateTrajectoryData() {
    return {
      v: TRAJECTORY_VERSION,
      b: this.brush ?? 0,
      ...(this.r ? { r: this.r } : {}),
      p: this.points.map(p => [
        Math.round(p.x * COORD_SCALE),
        Math.round(p.y * COORD_SCALE),
        Math.round(p.pressure * PRESSURE_SCALE),
        Math.round(p.timestamp * TIMESTAMP_SCALE)
      ])
    }
  }

  // 重置录制状态（供画布在笔画结束/取消后调用）
  reset() {
    this.points = []
    this.isRecording = false
    this.startTime = 0
    this.brush = 0
    this.r = null
  }
}
