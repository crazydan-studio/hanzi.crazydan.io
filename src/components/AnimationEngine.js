import { BASE_WIDTH, COORD_SCALE, PRESSURE_SCALE, TIMESTAMP_SCALE } from './Constants.js'
import { computeBrushWidths, drawBrushStroke } from './Brush.js'

// 单一RAF状态机。不使用 async/await + Promise 链，全部状态显式管理，
// pause/resume/seek 均为状态切换，天然安全。
export class AnimationEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.strokeGap = options.strokeGap ?? 300   // 笔画间停顿(墙钟毫秒)
    this.baseWidth = options.baseWidth ?? BASE_WIDTH
    this.highlightColor = options.highlightColor ?? null   // 正在绘制笔画的动画高亮色
    this.penWidthCoef = options.penWidthCoef ?? 1   // 前端笔触宽度系数（展示配置）
    // 已完成笔画的颜色: 可为函数（每帧求值，适配主题切换）
    this.completedColor = options.completedColor ?? '#000000'

    this.state = 'IDLE'          // IDLE | PLAYING | PAUSED | COMPLETED
    this.speed = 1.0             // 播放速度倍率 0.25-4
    this.strokes = []            // [{ trajectory_data, pxPoints }]
    this.currentIndex = 0        // 当前笔画索引
    this.elapsed = 0             // 当前笔画已播放时间(ms, 已乘速度)
    this.gapRemaining = 0        // 笔画间剩余停顿(墙钟毫秒，不乘速度)
    this.lastFrameTime = null    // 上一帧 performance.now()
    this.rafId = null
    this.startedIndex = -1       // 已触发onStrokeStart的笔画索引
    this.singleStrokePlayback = false   // 单笔播放模式: 当前笔画结束后立即停止

    // 回调
    this.onStrokeStart = null    // (index) 笔画开始
    this.onStrokeEnd = null      // (index) 笔画完成
    this.onComplete = null       // () 全部完成
    this.onProgress = null       // (index, progress) 笔画内进度 0-1
    this.onBeforeRender = null   // () 清屏后回调（宿主绘制田字格等背景）
    this.onAfterRender = null    // () 笔画绘制完成后回调（宿主绘制覆盖层，如田字格置于笔画上层）

    this.setupCanvas()
  }

  // 已完成笔画颜色（支持函数形式，随主题动态求值）
  resolveCompletedColor() {
    return typeof this.completedColor === 'function' ? this.completedColor() : this.completedColor
  }

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    // 内部坐标系固定 500×500（与编辑器一致）；
    // 物理分辨率按 DPR 缩放；CSS 显示尺寸由宿主（strokePad.applyCssSize）控制，
    // 支持移动端竖屏自适应，此处不覆盖 style
    this.cssW = 500
    this.cssH = 500
    this.canvas.width = this.cssW * dpr
    this.canvas.height = this.cssH * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  loadStrokes(strokes) {
    // 拷贝后排序，不修改调用方数组
    this.strokes = [...strokes]
      .filter(s => s && s.trajectory_data && s.trajectory_data.points?.length > 0)
      .sort((a, b) => (a.stroke_order ?? 0) - (b.stroke_order ?? 0))
    // 元组数组 [x,y,pressure,timestamp]（x/y 归一化×1000；pressure×100；timestamp×10）
    // → ÷还原为内部像素坐标与浮点值
    for (const s of this.strokes) {
      s.pxPoints = s.trajectory_data.points.map(p => ({
        x: (p[0] / COORD_SCALE) * this.cssW,
        y: (p[1] / COORD_SCALE) * this.cssH,
        pressure: (p[2] ?? PRESSURE_SCALE / 2) / PRESSURE_SCALE,
        timestamp: (p[3] ?? 0) / TIMESTAMP_SCALE
      }))
    }
    this.reset()
  }

  reset() {
    this.state = 'IDLE'
    this.currentIndex = 0
    this.elapsed = 0
    this.gapRemaining = 0
    this.startedIndex = -1
    this.lastFrameTime = null
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    this.clearCanvas()
  }

  play() {
    if (this.state === 'PLAYING') return
    // 已完成或播完 → 从头开始
    if (this.state === 'COMPLETED' || this.currentIndex >= this.strokes.length) {
      this.currentIndex = 0
      this.elapsed = 0
      this.gapRemaining = 0
      this.startedIndex = -1
      this.clearCanvas()
    }
    this.state = 'PLAYING'
    this.lastFrameTime = null
    this.rafId = requestAnimationFrame(this.tick.bind(this))
  }

  pause() {
    if (this.state !== 'PLAYING') return
    this.state = 'PAUSED'
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    this.lastFrameTime = null
    // elapsed/gapRemaining 保留，resume 时从断点继续
  }

  setSpeed(speed) {
    this.speed = Math.max(0.25, Math.min(4, speed))
    // 实时生效：下一帧即按新速度累积 elapsed
  }

  // 跳转到指定笔画（从该笔画起点继续）
  seekToStroke(index) {
    if (this.strokes.length === 0) return
    const target = Math.max(0, Math.min(index, this.strokes.length - 1))
    const wasPlaying = this.state === 'PLAYING'
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    this.currentIndex = target
    this.elapsed = 0
    this.gapRemaining = 0
    this.startedIndex = -1
    this.lastFrameTime = null
    this.redrawCompleted()
    if (wasPlaying) {
      this.state = 'PLAYING'
      this.rafId = requestAnimationFrame(this.tick.bind(this))
    } else {
      this.state = 'PAUSED'
    }
  }

  // ---- 单一帧回调 ----
  tick(now) {
    if (this.state !== 'PLAYING') return
    if (this.lastFrameTime === null) this.lastFrameTime = now
    const rawDt = now - this.lastFrameTime
    this.lastFrameTime = now
    const dt = rawDt * this.speed

    // 1) 笔画间停顿（墙钟时间，不乘速度；停顿期间不渲染任何内容）
    if (this.gapRemaining > 0) {
      this.gapRemaining -= rawDt
      if (this.gapRemaining <= 0) this.gapRemaining = 0
      this.rafId = requestAnimationFrame(this.tick.bind(this))
      return
    }

    // 2) 全部完成（最后一笔完成后立即结束，无尾停顿）
    if (this.currentIndex >= this.strokes.length) {
      this.state = 'COMPLETED'
      this.onComplete?.()
      return
    }

    // 3) 笔画开始回调（每笔只触发一次）
    if (this.startedIndex !== this.currentIndex) {
      this.startedIndex = this.currentIndex
      this.onStrokeStart?.(this.currentIndex)
    }

    // 4) 笔画内推进
    const stroke = this.strokes[this.currentIndex]
    const duration = this.getStrokeDuration(stroke.pxPoints)

    this.elapsed += dt
    if (this.elapsed >= duration) {
      // 完成当前笔画 → 全帧重绘（背景+已完成黑色+当前笔黑色）→ 进入下一笔停顿
      // 单笔播放模式（分解图循环播放）: 不重绘为墨色，保持绘制颜色
      // （红色笔触）直至下一轮从头开始，避免循环间闪现已播放（墨色）笔画
      if (!this.singleStrokePlayback) {
        this.renderFrame(stroke, null)
      }
      this.onStrokeEnd?.(this.currentIndex)
      this.currentIndex++
      // 单笔播放模式: 该笔结束即停止，不播放后续笔画
      if (this.singleStrokePlayback || this.currentIndex >= this.strokes.length) {
        this.state = 'COMPLETED'
        this.onComplete?.()
        return
      }
      this.elapsed = 0
      this.gapRemaining = this.strokeGap
    } else {
      const progress = this.elapsed / duration
      // 部分渲染: 全帧重绘（背景+已完成黑色+当前笔高亮色进度）
      this.renderFrame(stroke, progress)
      this.onProgress?.(this.currentIndex, progress)
    }

    if (this.state === 'PLAYING') {
      this.rafId = requestAnimationFrame(this.tick.bind(this))
    }
  }

  // 全帧重绘: 清屏 → 宿主背景（浅色完整字型）→ 已完成笔画(黑) → 当前笔画
  // progress=null 表示当前笔画已完成（黑色）；否则按进度用高亮色绘制
  // 展示颜色为前端配置（数据中不存颜色字段）
  renderFrame(stroke, progress) {
    this.clearCanvas()
    const ink = this.resolveCompletedColor()
    for (let i = 0; i < this.currentIndex && i < this.strokes.length; i++) {
      // 已完成笔画: 永久墨色显示（主题适配）
      this.renderFullStroke(this.strokes[i], ink)
    }
    if (progress === null) {
      // 当前笔画刚完成: 墨色
      this.renderFullStroke(stroke, ink)
    } else {
      // 当前笔画动画中: 高亮色
      this.renderPartial(stroke, progress, this.highlightColor || ink)
    }
    // 覆盖层（田字格等置于笔画上层）
    this.onAfterRender?.()
  }

  getStrokeDuration(pts) {
    if (pts.length <= 1) return 200   // 单点笔画最短时长
    const d = pts[pts.length - 1].timestamp - pts[0].timestamp
    return d > 0 ? d : 200            // 兜底
  }

  // 时间戳 → 位置插值（线性，防除零）
  interpolatePoint(pts, targetTime) {
    if (!pts || pts.length === 0) return null
    if (pts.length === 1) return pts[0]
    if (targetTime <= pts[0].timestamp) return pts[0]
    const last = pts[pts.length - 1]
    if (targetTime >= last.timestamp) return last

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const span = b.timestamp - a.timestamp
      if (span <= 0) continue
      if (targetTime >= a.timestamp && targetTime <= b.timestamp) {
        const t = (targetTime - a.timestamp) / span
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          pressure: a.pressure + (b.pressure - a.pressure) * t
        }
      }
    }
    return last
  }

  // 单点宽度（前端基准笔宽 × 压力），展示配置
  strokeWidthAt(p) {
    const pressure = p?.pressure ?? 0.5
    return (this.penWidthCoef ?? 1) * this.baseWidth * (0.4 + 0.6 * pressure)
  }

  // 部分渲染: 绘制从起点到插值位置的所有轨迹（笔触模拟）
  // colorOverride: 可选，动画进行中传高亮色
  // pts 为 loadStrokes 时换算好的像素坐标
  renderPartial(stroke, progress, colorOverride) {
    const pts = stroke.pxPoints
    if (!pts || pts.length === 0) return
    const color = colorOverride || this.resolveCompletedColor()

    // 单点笔画: 圆点半径随进度增长
    if (pts.length === 1) {
      const r = Math.max(
        (this.strokeWidthAt(pts[0]) / 2) * Math.max(progress, 0.02), 0.5)
      this.ctx.beginPath()
      this.ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2)
      this.ctx.fillStyle = color
      this.ctx.fill()
      return
    }

    const targetTime = pts[0].timestamp +
      Math.max(0, Math.min(progress, 1)) *
        (pts[pts.length - 1].timestamp - pts[0].timestamp)
    const end = this.interpolatePoint(pts, targetTime)

    // 构建当前可见点序列: 时间戳 <= 目标时间的完整点 + 插值尾点
    const visible = []
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].timestamp > targetTime) break
      visible.push(pts[i])
    }
    if (end && (visible.length === 0 ||
        end.x !== visible[visible.length - 1].x ||
        end.y !== visible[visible.length - 1].y)) {
      visible.push({ ...end, timestamp: targetTime })
    }

    if (visible.length <= 1) {
      // 刚开始: 圆点随进度
      const p = visible[0] || pts[0]
      const r = Math.max(this.strokeWidthAt(p) / 2 * Math.max(progress, 0.02), 0.5)
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      this.ctx.fillStyle = color
      this.ctx.fill()
      return
    }

    // 笔触渲染（压力/速度/起收笔），宽度为前端配置基准
    const widths = computeBrushWidths(visible, this.penWidthCoef ?? 1)
    drawBrushStroke(this.ctx, visible, widths, color)
  }

  // 完整笔画渲染（已完成笔画）— 笔触模拟
  renderFullStroke(stroke, colorOverride) {
    const pts = stroke.pxPoints
    if (!pts || pts.length === 0) return
    const color = colorOverride || this.resolveCompletedColor()

    if (pts.length === 1) {
      // 单点: 画个小圆点
      this.ctx.beginPath()
      this.ctx.arc(pts[0].x, pts[0].y, this.strokeWidthAt(pts[0]) / 2, 0, Math.PI * 2)
      this.ctx.fillStyle = color
      this.ctx.fill()
    } else {
      const widths = computeBrushWidths(pts, this.penWidthCoef ?? 1)
      drawBrushStroke(this.ctx, pts, widths, color)
    }
  }

  redrawCompleted() {
    this.clearCanvas()
    const ink = this.resolveCompletedColor()
    for (let i = 0; i < this.currentIndex && i < this.strokes.length; i++) {
      this.renderFullStroke(this.strokes[i], ink)
    }
    this.onAfterRender?.()
  }

  clearCanvas() {
    this.ctx.save()
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.restore()
    // 宿主背景（田字格）重绘：restore 后变换回到 base(dpr)，
    // 背景绘制由宿主通过 onBeforeRender 完成
    this.onBeforeRender?.()
  }
}
