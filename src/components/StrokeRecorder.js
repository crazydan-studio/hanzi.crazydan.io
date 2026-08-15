import { CANVAS_SIZE } from './Constants.js'

// 录制核心（与画布解耦，可复用）
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
  // x/y: 内部像素坐标，保存时归一化(4位小数)后 ×10000 存整数
  addPoint(x, y, pressure) {
    if (!this.isRecording) return
    const ts = performance.now() - this.startTime   // 相对偏移（单调）
    // 防倒退保护: 即使时钟异常也保证单调不减
    const prev = this.points[this.points.length - 1]
    const timestamp = prev ? Math.max(ts, prev.timestamp) : ts
    this.points.push({
      x, y,
      pressure: Math.max(0, Math.min(1, pressure)),
      timestamp
    })
  }

  stopRecording() {
    this.isRecording = false
    return this.generateTrajectoryData()
  }

  // 仅记录坐标点数据（元组数组 [x,y,pressure,timestamp]，降低存储开销）
  // x/y: 归一化×10000 整数；前端显示时 ÷10000 还原
  // pressure: 0-1 浮点 ×100 存整数（保留 2 位小数，0.01 步进不可感知）
  // timestamp: 毫秒浮点 ×10 存整数（保留 1 位小数，0.1ms 远高于 60fps 需求）
  // 整数存储可消除浮点噪声（如 1.4000000059604645）并减小体积
  generateTrajectoryData() {
    return {
      version: '5.0',
      points: this.points.map(p => [
        Math.round(p.x / CANVAS_SIZE.width * 10000),   // x
        Math.round(p.y / CANVAS_SIZE.height * 10000),  // y
        Math.round(p.pressure * 100),                   // pressure ×100
        Math.round(p.timestamp * 10)                    // timestamp ×10
      ])
    }
  }

  // 重置录制状态（供画布在笔画结束/取消后调用）
  reset() {
    this.points = []
    this.isRecording = false
    this.startTime = 0
  }
}
