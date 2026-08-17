// ============ 公共书写板组件（零后端耦合，可跨项目复用） ============
// 职责: 汉字书写画布（田字格+楷体参考字）+ 笔触录入 + 笔画回放
// 解耦设计:
//   - 输入: 组件选项 opts 注入配置与数据（参考字、回调函数）
//   - 输出: 录入的笔画、悬停、模式变化、回放进度 全部经回调输出，
//           宿主页面决定数据去向（保存到后端/其他处理）
// 宿主用法:
//   <div x-data="strokePad({
//     referenceChar: '',
//     onStrokeRecorded: (stroke) => { ... },      // 笔画录入完成
//     onStrokeRemoveRequest: ({ strokeId }) => { ... }, // 撤销/清空请求
//     onStrokeHover: (strokeId) => { ... },       // 列表悬停联动
//     onModeChanged: (mode) => { ... },           // 书写/回放切换
//     onPlaybackProgress: ({ index, strokeId, state }) => { ... }
//   })">
//   宿主再通过实例方法注入数据:
//     Alpine.$data($refs.padEl).setCharacter('永')
//     .loadStrokes([...]) / .confirmStrokeSaved(localId, saved) / .removeStroke(id)
//     .setMode('playback') / .seekToStroke(strokeId)
import Alpine from 'alpinejs'
import { StrokeRecorder } from './StrokeRecorder.js'
import { AnimationEngine } from './AnimationEngine.js'
import { computeBrushWidths, drawBrushStroke, normalizeBrush, brushBaseWidth } from './Brush.js'
import { drawTianZiGe, drawCharRef, charInkBox, charFontCovers, charRefColor, strokeInkColor, displayUnit, ensureKaiFont } from './StrokeBackground.js'
import { THEME_CHANGE_EVENT } from './ThemeToggle.js'
import { CANVAS_SIZE, COORD_SCALE, PRESSURE_SCALE, TIMESTAMP_SCALE } from './Constants.js'

Alpine.data('strokePad', (opts = {}) => ({
  width: opts.width || CANVAS_SIZE.width,
  height: opts.height || CANVAS_SIZE.height,
  // 笔触宽度选择（像素基准，内部 500 坐标系；档位 = 基础 ×3）
  // 移动端画布缩小显示（如 320px）后视觉宽度 = penWidth × 显示尺寸/500，
  // 6/12/18/24 对应 细/标准/粗/特粗，默认最粗(24) 保证笔触醒目
  PEN_WIDTHS: opts.penWidths || [6, 12, 18, 24],   // 细/标准/粗/特粗
  penWidth: opts.defaultPenWidth ?? 24,
  strokeColor: opts.strokeColor || null,   // 书写笔触颜色（null → 适配主题的墨色）
  mode: 'write',                 // 'write' 书写 | 'playback' 回放
  _opts: opts,                   // 宿主回调与配置

  // ---- 书写状态 ----
  isActive: false,
  currentStroke: null,
  strokes: [],                   // 显示列表（宿主已保存 + 本地pending）
  recorder: null,
  canvas: null,
  ctx: null,
  inkLayer: null,                // 笔触渲染离屏层（当前笔画实时绘制）
  inkCtx: null,
  activePointerId: null,
  hoveredStrokeId: null,         // 列表悬停高亮的笔画 id
  selectedStrokeId: null,        // 书写模式选中笔画 id（画布置顶高亮）
  currentChar: '',               // 当前汉字（书写模式半透明参考字）
  fontReady: false,              // 中易楷体加载完成（启用书写）
  fontError: false,              // 楷体加载失败（不做兜底，禁用书写）
  // 背景汉字墨迹盒（内部坐标系）: 笔画坐标以盒为坐标系归一化存储/还原
  charBoxValue: null,            // { x0, y0, x1, y1, w, h } | null
  charUnsupported: false,        // 该字不被自带楷体覆盖（无背景字/禁书写，不做兜底）

  // 悬停高亮色（列表行 hover 时画布中对应笔画高亮；仅颜色，不加粗）
  HIGHLIGHT_COLOR: opts.highlightColor || '#3b82f6',   // blue-500

  // ---- 回放状态（引擎复用同一画布） ----
  engine: null,
  playbackStrokes: [],
  playbackState: 'IDLE',         // IDLE | PLAYING | PAUSED | COMPLETED
  playbackSpeed: 1.0,
  playbackIndex: 0,
  hasPlaybackData: false,

  // 字体与墨迹盒就绪（可书写）: 字体加载完成且当前字被覆盖
  get writingReady() {
    return this.fontReady && !this.charUnsupported && !!this.charBoxValue
  },

  init() {
    this.canvas = this.$refs.canvas
    this.ctx = this.canvas.getContext('2d')
    this.recorder = new StrokeRecorder()
    this.setupCanvas()

    // 笔触离屏层: 实时书写时整个笔画用轮廓法重绘（避免与已存笔画叠加）
    const dpr = window.devicePixelRatio || 1
    this.inkLayer = document.createElement('canvas')
    this.inkLayer.width = this.width * dpr
    this.inkLayer.height = this.height * dpr
    this.inkCtx = this.inkLayer.getContext('2d')
    this.inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 回放引擎绑定同一画布
    // - highlightColor: 正在绘制笔画的动画高亮色（蓝）
    // - 背景: 每帧清屏后重绘田字格 + 浅色完整字型（未完成笔画浅灰，作为参照）
    // - 笔画坐标以背景汉字墨迹盒为坐标系（v8），经 charBox 还原
    this.engine = new AnimationEngine(this.canvas, {
      highlightColor: this.HIGHLIGHT_COLOR,
      completedColor: () => strokeInkColor(),      // 已绘笔画墨色（适配主题）
      charBox: () => this.charBoxValue             // 墨迹盒提供者（字体/字符就绪后可用）
    })
    this.engine.onBeforeRender = () => {
      this.drawTianZiGe()
      this.drawPlaybackBackground()
    }
    this.engine.onStrokeStart = (i) => {
      this.playbackIndex = i
      this.notifyPlaybackProgress()
    }
    this.engine.onStrokeEnd = (i) => {
      this.playbackIndex = Math.min(i + 1, this.playbackStrokes.length)
      this.notifyPlaybackProgress()
    }
    this.engine.onComplete = () => {
      this.playbackState = 'COMPLETED'
      // 不覆写 playbackIndex（onStrokeEnd 已更新）:
      // 单笔播放完毕时保持"选中笔+1"，进度指示器据此区分 已完成/后续未播放
      this.notifyPlaybackProgress()
      // 播放完毕恢复静态显示（只显示已播放笔画，无高亮）
      this.renderPlaybackStatic()
    }
    this.engine.onProgress = (i) => {
      if (this.playbackIndex !== i) {
        this.playbackIndex = i
        this.notifyPlaybackProgress()
      }
    }

    // 预加载中易楷体（参考字渲染依赖，4.8MB woff2 加载较慢）:
    // 加载完成前禁用书写（显示等待），完成后测量背景字墨迹盒并重绘；
    // 加载失败不兜底（显示失败状态）
    this.loadFontForWriting()

    // 兜底: 等全部字体就绪后重测墨迹盒并重绘
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        this.remeasureCharBox()
        if (this.mode === 'write') this.redrawCanvas()
        else if (this.mode === 'playback') this.syncPlaybackData()
      })
    }

    // 实例回传给宿主（宿主经此持有组件实例，替代 $refs 时序依赖）
    this._opts.onReady?.(this)

    // 主题切换时重绘背景（田字格与背景汉字颜色适配主题色）
    window.addEventListener(THEME_CHANGE_EVENT, () => {
      if (this.mode === 'write') this.redrawCanvas()
      else if (this.mode === 'playback') this.syncPlaybackData()
    })
  },

  // ---- 宿主数据注入接口 ----

  // 设置当前汉字（书写模式半透明参考字 / 回放背景字型）
  setCharacter(char) {
    const ch = char || ''
    if (ch === this.currentChar) return
    this.currentChar = ch
    this.remeasureCharBox()
    if (this.mode === 'write') this.redrawCanvas()
    else if (this.mode === 'playback') this.syncPlaybackData()
  },

  // 重测背景汉字墨迹盒（字体加载完成/字符变化后调用）
  // 墨迹盒 = 笔画坐标系的基准: 字体未加载/未覆盖该字时置空（不做兜底）
  remeasureCharBox() {
    if (!this.currentChar || !this.fontReady) {
      this.charBoxValue = null
      this.charUnsupported = false
      return
    }
    this.charUnsupported = !charFontCovers(this.currentChar)
    this.charBoxValue = this.charUnsupported
      ? null
      : charInkBox(this.ctx, this.width, this.height, this.currentChar)
  },

  // 切换书写/回放模式
  setMode(mode) {
    if (this.mode === mode) return
    // 若正在书写，先取消当前笔画
    if (this.isActive) this.cancelStroke()
    this.mode = mode
    if (mode === 'playback') {
      this.syncPlaybackData()   // 加载笔画进引擎并清屏（引擎清屏后重绘田字格）
    } else {
      this.engine.reset()       // 停止回放
      this.redrawCanvas()       // 恢复书写模式视图
    }
    // 布局稳定后重测容器宽度（进入书写页时画布可能偏小）
    this.reapplyCssSize()
    this._opts.onModeChanged?.(mode)
  },

  // 加载宿主提供的笔画数据（已保存的服务端笔画 + 本地pending）
  loadStrokes(strokes) {
    this.strokes = (strokes || []).map(s => ({ ...s, isPending: false }))
    this.afterStrokesChange()
  },

  // 宿主保存成功后，用服务端笔画替换本地pending笔画
  confirmStrokeSaved(localId, savedStroke) {
    const idx = this.strokes.findIndex(s => s.id === localId)
    if (idx !== -1) {
      this.strokes[idx] = { ...savedStroke, isPending: false }
      this.afterStrokesChange()
    }
  },

  // 宿主删除成功后通知画布移除
  removeStroke(strokeId) {
    this.strokes = this.strokes.filter(s => s.id !== strokeId)
    this.afterStrokesChange()
  },

  // 回放模式: 点击笔画列表行 → 仅播放该笔画的书写动画（不播放后续）
  seekToStroke(strokeId) {
    if (this.mode !== 'playback' || !strokeId) return
    const idx = this.playbackStrokes.findIndex(s => s.id === strokeId)
    if (idx === -1) return
    this.engine.singleStrokePlayback = true   // 该笔结束后立即停止
    this.seekPlayback(idx)
    if (this.playbackState !== 'PLAYING') {
      this.engine.play()               // 未在播放则自动开始
      this.playbackState = this.engine.state
    }
  },

  // 等待楷体可用后启用书写（仅自带静态中易楷体，无系统字体/无兜底）:
  //  - 加载完成 → 测量墨迹盒并启用书写
  //  - 加载失败 → fontError=true（不做兜底，持续显示失败状态）
  loadFontForWriting() {
    if (!document.fonts?.load) {
      this.fontReady = false
      this.fontError = true
      return
    }
    this.fontReady = false
    this.fontError = false
    ensureKaiFont().then(ok => {
      this.fontReady = ok
      this.fontError = !ok
      this.remeasureCharBox()
      if (this.mode === 'write') this.redrawCanvas()
      else if (this.mode === 'playback') this.syncPlaybackData()
    })
  },

  // 回调输出回放进度（笔画列表联动高亮当前绘制笔画）
  notifyPlaybackProgress() {
    const stroke = this.playbackStrokes[this.playbackIndex]
    this._opts.onPlaybackProgress?.({
      index: this.playbackIndex,
      strokeId: stroke ? stroke.id : null,
      state: this.playbackState
    })
  },

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1
    // 内部坐标系固定为 CANVAS_SIZE(500×500)；物理分辨率按 DPR 缩放
    this.canvas.width = this.width * dpr
    this.canvas.height = this.height * dpr
    // CSS 显示尺寸自适应容器（移动端竖屏缩小，桌面为500）
    this.applyCssSize()
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.redrawCanvas()

    // 窗口尺寸变化（旋转/缩放）时重新适配 CSS 尺寸
    window.addEventListener('resize', () => this.applyCssSize())
  },

  // CSS 显示尺寸: 不超过内部尺寸(500)且不超过容器可用宽度（移动端竖屏自适应）
  applyCssSize() {
    if (!this.canvas) return
    const container = this.canvas.parentElement
    // 容器可能因 x-show 隐藏而 clientWidth=0 → 延时重测
    // clientWidth 含 padding: 减去 容器 p-2(16px) + 边框(2px) + 余量(2px)
    const avail = container
      ? ((container.clientWidth || container.offsetWidth || this.width) - 20)
      : this.width
    const cssSize = Math.max(240, Math.min(this.width, avail))
    this.canvas.style.width = cssSize + 'px'
    this.canvas.style.height = cssSize + 'px'
  },

  // 进入书写页/切换模式后延时重测容器宽度（x-show 布局完成前可能为0）
  reapplyCssSize() {
    requestAnimationFrame(() => requestAnimationFrame(() => this.applyCssSize()))
  },

  // ============ 田字格背景 ============
  // 换算系数由画布设备像素与实测显示宽度得出，任意显示尺寸/DPR 下线宽与虚线模式一致
  drawTianZiGe() {
    const rect = this.canvas.getBoundingClientRect()
    drawTianZiGe(this.ctx, this.width, this.height, displayUnit(this.canvas, rect), rect.width)
  },

  // 书写模式参考字: 以楷体半透明显示当前汉字（供描红参考）
  // - 水平方向: 字形(em框)严格居中（textAlign=center, 绘制x=画布中心）
  // - 垂直方向: 按字体度量(baseline/ascent/descent)精确居中
  // - 缩放: 依据墨迹边界使字形填满田字格内部，四周留均匀空隙
  drawReferenceChar() {
    if (this.mode !== 'write' || !this.currentChar) return
    this.drawCharRef(charRefColor())
  },

  // 楷体半透明参考字核心绘制（书写模式与回放背景共用）— 逻辑在共享模块 strokeBackground.js
  drawCharRef(color) {
    drawCharRef(this.ctx, this.width, this.height, this.currentChar, color)
  },

  // 书写模式重绘: 田字格 → 参考字 → 笔画（展示颜色/宽度均前端配置，墨色适配主题）
  // 悬停笔画提升至最上层绘制（避免被其他笔画遮挡），恢复后按原始顺序重绘
  redrawCanvas() {
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.drawTianZiGe()
    this.drawReferenceChar()
    const hovered = this.hoveredStrokeId
    const selected = this.selectedStrokeId
    const topLayers = new Set([hovered, selected].filter(Boolean))
    for (const stroke of this.strokes) {
      if (topLayers.has(stroke.id)) continue
      // 用轨迹数据重绘（与回放引擎同一渲染路径）
      this.drawTrajectory(stroke.trajectory_data, strokeInkColor(), false)
    }
    // 选中笔画: 置顶高亮（鼠标离开列表行后仍保持）
    if (selected) {
      const s = this.strokes.find(x => x.id === selected)
      if (s) this.drawTrajectory(s.trajectory_data, this.HIGHLIGHT_COLOR, true)
    }
    if (hovered && hovered !== selected) {
      const s = this.strokes.find(x => x.id === hovered)
      if (s) this.drawTrajectory(s.trajectory_data, this.HIGHLIGHT_COLOR, true)
    }
  },

  // ============ 模式切换（URL mode 参数同步） ============
  switchMode(mode) {
    if (this.mode === mode) return
    this.setMode(mode)
    // 同步 URL: 仅书写页（存在 ?char=）时更新 mode 参数
    const params = new URLSearchParams(window.location.search)
    if (params.get('char')) {
      params.set('mode', mode)
      history.replaceState(null, '', `?${params.toString()}`)
    }
  },

  // 从显示列表同步回放数据（加载/保存/删除后调用）
  syncPlaybackData() {
    if (!this.engine) return
    const strokes = (this.strokes || []).filter(s =>
      s.trajectory_data && s.trajectory_data.points?.length > 0)
    this.playbackStrokes = strokes
    this.engine.loadStrokes(strokes)
    this.hasPlaybackData = strokes.length > 0
    this.playbackIndex = 0
    this.playbackState = 'IDLE'
    this.notifyPlaybackProgress()
  },

  // 笔画数据变更后的统一刷新
  afterStrokesChange() {
    // 若悬停笔画已不存在，清除高亮
    if (this.hoveredStrokeId && !this.strokes.some(s => s.id === this.hoveredStrokeId)) {
      this.hoveredStrokeId = null
    }
    if (this.mode === 'playback') {
      this.syncPlaybackData()
    } else {
      this.redrawCanvas()
    }
  },

  togglePlayback() {
    if (this.playbackState === 'PLAYING') {
      this.engine.pause()
    } else {
      // 常规播放/继续: 连续播放全部笔画（单笔模式在点击行时单独设置）
      this.engine.singleStrokePlayback = false
      this.engine.play()
    }
    this.playbackState = this.engine.state
    // 回调输出: 宿主据此清除单笔选中（重新播放全部）
    this._opts.onPlaybackToggle?.({ action: 'toggle', playing: this.playbackState === 'PLAYING' })
  },

  resetPlayback() {
    this.engine.reset()
    this.engine.singleStrokePlayback = false
    this.playbackState = this.engine.state
    this.playbackIndex = 0
    this.notifyPlaybackProgress()
    this._opts.onPlaybackToggle?.({ action: 'reset' })
  },

  seekPlayback(index) {
    this.engine.seekToStroke(index)
    this.playbackState = this.engine.state
    this.playbackIndex = this.engine.currentIndex
    this.notifyPlaybackProgress()
  },

  onPlaybackSpeedChange() {
    this.engine.setSpeed(this.playbackSpeed)
  },

  get playbackLabel() {
    if (this.playbackStrokes.length === 0) return '0 / 0'
    // playbackIndex 语义: 正在播放的笔画索引(0-based)；完成时为长度
    const shown = Math.min(this.playbackIndex, this.playbackStrokes.length - 1) + 1
    return `${shown} / ${this.playbackStrokes.length}`
  },

  // ============ 书写输入处理（仅书写模式生效） ============
  // 移动端兼容: setPointerCapture 在部分浏览器不可靠，指针滑出画布后
  // move/up 事件会丢失且浏览器接管手势（滚动/选中文本）。
  // 方案: 在画布上起始笔画时，同时在 window 上挂全局监听（箭头函数保持 this），
  //       保证滑出画布仍持续接收事件；坐标 clamp 到画布内部。
  onPointerDown(event) {
    if (this.mode !== 'write') return
    // 字体加载完成且当前字被自带楷体覆盖后才能书写（无兜底）
    if (!this.writingReady) return
    // 仅跟踪主指针
    if (this.activePointerId !== null || !event.isPrimary) return
    event.preventDefault()
    this.activePointerId = event.pointerId
    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch { /* 部分浏览器不支持，靠全局监听兜底 */ }

    // 全局监听兜底（滑出画布事件不丢失）
    this._globalMove = (e) => this.onPointerMove(e)
    this._globalUp = (e) => this.onPointerUp(e)
    this._globalCancel = (e) => this.onPointerCancel(e)
    window.addEventListener('pointermove', this._globalMove, { passive: false })
    window.addEventListener('pointerup', this._globalUp)
    window.addEventListener('pointercancel', this._globalCancel)

    this.isActive = true
    this.recorder.startRecording()
    this.recorder.deviceType = event.pointerType  // 'mouse' | 'touch' | 'pen'
    const pressure = this.computePressure(event)
    const point = this.getPointFromEvent(event, pressure)
    if (!point) { this.cancelStroke(); return }   // 墨迹盒缺失（防御）
    this.recorder.addPoint(point.x, point.y, point.pressure)
    // currentStroke 直接引用 recorder 的点数组
    this.currentStroke = { points: this.recorder.points }
    this.renderCurrentSegment()
  },

  onPointerMove(event) {
    if (this.mode !== 'write' || !this.isActive || event.pointerId !== this.activePointerId) return
    event.preventDefault()
    const pressure = this.computePressure(event)
    const point = this.getPointFromEvent(event, pressure)
    // currentStroke.points 与 recorder.points 为同一数组（onPointerDown 建立引用），
    // addPoint 内部已 push —— 不能再次 push point，否则重复点且
    // 时间戳计算时机不同（addPoint 内部更晚）导致相邻递减非单调
    this.recorder.addPoint(point.x, point.y, point.pressure)
    this.renderCurrentSegment()
  },

  onPointerUp(event) {
    if (this.mode !== 'write' || !this.isActive || event.pointerId !== this.activePointerId) return
    this.removeGlobalPointerListeners()
    this.finishStroke()
  },

  onPointerCancel(event) {
    if (this.mode !== 'write' || !this.isActive || event.pointerId !== this.activePointerId) return
    // 系统手势抢占: 丢弃当前未完成笔画
    this.removeGlobalPointerListeners()
    this.cancelStroke()
  },

  // 移除全局兜底监听
  removeGlobalPointerListeners() {
    if (this._globalMove) window.removeEventListener('pointermove', this._globalMove)
    if (this._globalUp) window.removeEventListener('pointerup', this._globalUp)
    if (this._globalCancel) window.removeEventListener('pointercancel', this._globalCancel)
    this._globalMove = this._globalUp = this._globalCancel = null
  },

  // 合成压力（0-1）:
  //   pen   → 真实 pressure（主动笔压感）
  //   touch → 尽力探测接触面积(PointerEvent.width/height，支持有限)，
  //           接触椭圆直径→伪压力；不支持时回退 0.5
  //   mouse → 0.5
  computePressure(event) {
    if (event.pointerType === 'pen') {
      return event.pressure
    }
    if (event.pointerType === 'touch' &&
        event.width > 0 && event.height > 0) {
      const contact = (event.width + event.height) / 2   // 接触直径(px)
      // 接触越大笔越粗: 直径 25px → 压力1.0，最小 0.3
      return Math.max(0.3, Math.min(1, contact / 25))
    }
    return 0.5
  },

  // 坐标归一化: 事件坐标 → 背景汉字墨迹盒相对坐标（x 按盒宽、y 按盒高）。
  // 显示尺寸可能小于内部坐标系(500×500)（移动端自适应），先按比例映射回
  // 内部坐标系，再换算为盒相对坐标（超出盒外部分 clamp 到允许范围）；
  // 滑出画布时同样 clamp，避免越界点
  getPointFromEvent(event, pressure) {
    const box = this.charBoxValue
    if (!box) return null
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.width / (rect.width || this.width)
    const scaleY = this.height / (rect.height || this.height)
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    return {
      x: (x - box.x0) / box.w,      // 盒相对: 0=盒左缘, 1=盒右缘
      y: (y - box.y0) / box.h,
      pressure,
      timestamp: performance.now() - this.recorder.startTime   // 单调时钟，与录制一致
    }
  },

  finishStroke() {
    // 先取指针ID，再释放捕获（不能先置null再release）
    const pointerId = this.activePointerId
    this.isActive = false
    this.activePointerId = null
    if (pointerId !== null && this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId)
    }

    // 单点笔画也支持（"点"）
    if (this.currentStroke && this.currentStroke.points.length >= 1) {
      // 笔刷归一化: 笔刷面积/背景字墨迹盒面积（v8），播放时按当前盒面积还原
      const box = this.charBoxValue
      if (box) {
        this.recorder.setBrush(normalizeBrush(this.penWidth, box.w, box.h))
      }
      // 轨迹数据已归一化（盒相对，2位小数级），仅含坐标点
      const trajectoryData = this.recorder.stopRecording()
      const stroke = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, // 本地临时ID
        isPending: true,                // 尚未保存（由宿主决定）
        stroke_order: null,             // 保存时由宿主按需分配
        trajectory_data: trajectoryData
      }
      this.strokes.push(stroke)
      this.redrawCanvas()
      // 回调输出: 宿主保存到后端或其他处理
      this._opts.onStrokeRecorded?.(stroke)
    }
    this.currentStroke = null
    this.recorder.reset()
    this.clearInkLayer()
  },

  cancelStroke() {
    this.isActive = false
    this.activePointerId = null
    this.currentStroke = null
    this.removeGlobalPointerListeners()
    this.recorder.reset()
    this.clearInkLayer()
    this.redrawCanvas()
  },

  // ---- 渲染 ----
  // 实时书写渲染: 在离屏层上用笔触模拟（轮廓法）绘制当前笔画，再叠到主画布
  // 笔触颜色适配主题（明亮黑色，暗黑近白色）
  // 录制点为盒相对归一化坐标，先换算为内部像素坐标再绘制
  renderCurrentSegment() {
    const pts = this.currentStroke.points
    if (pts.length === 0) return
    const box = this.charBoxValue
    if (!box) return
    const px = pts.map(p => ({
      x: box.x0 + p.x * box.w,
      y: box.y0 + p.y * box.h,
      pressure: p.pressure,
      timestamp: p.timestamp
    }))
    const widths = computeBrushWidths(px, this.penWidth)
    this.inkCtx.clearRect(0, 0, this.width, this.height)
    drawBrushStroke(this.inkCtx, px, widths, this.strokeColor || strokeInkColor())
    // 离屏层按内部坐标系绘制，叠加到主画布
    this.ctx.drawImage(this.inkLayer, 0, 0, this.width, this.height)
  },

  // 切换笔触宽度（实时生效，正在书写的笔画立即重绘；回调输出供多端同步）
  setPenWidth(w) {
    this.penWidth = w
    if (this.isActive && this.currentStroke) {
      this.renderCurrentSegment()
    }
    this._opts.onPenWidthChange?.(w)
  },

  // 结束/取消书写时清空离屏层
  clearInkLayer() {
    if (this.inkCtx) {
      this.inkCtx.clearRect(0, 0, this.width, this.height)
    }
  },

  // 书写模式选中笔画: 画布置顶高亮（点击列表行选中/取消选中）
  setSelectedStroke(strokeId) {
    this.selectedStrokeId = strokeId
    this.redrawCanvas()
  },

  // 列表行悬停: 高亮书写框内对应笔画
  // 书写模式 → 重绘画布高亮；回放模式非播放时 → 静态显示中高亮该笔画
  onStrokeHover(strokeId) {
    if (this.hoveredStrokeId === strokeId) return
    this.hoveredStrokeId = strokeId
    if (this.mode === 'write') {
      this.redrawCanvas()
    } else if (this.mode === 'playback' && this.playbackState !== 'PLAYING') {
      this.renderPlaybackStatic()
    }
  },

  // 与动画引擎共享的轨迹渲染函数（笔触模拟: 压力/速度/锥形轮廓）
  // 轨迹坐标为元组数组 [x,y,pressure,timestamp]（盒相对归一化 ×1000），
  // 此处 ÷1000 还原到当前背景字墨迹盒并映射为画布像素；基准笔宽由轨迹
  // brush（面积比）按当前盒面积还原（忠实显示录制笔宽）；颜色为前端展示配置
  // 高亮仅颜色区分，不改变笔宽
  drawTrajectory(trajectory, color, highlight = false) {
    const box = this.charBoxValue
    if (!box) return
    const pts = trajectory.points
    if (!pts || pts.length === 0) return
    const px = pts.map(p => ({
      x: box.x0 + (p[0] / COORD_SCALE) * box.w,
      y: box.y0 + (p[1] / COORD_SCALE) * box.h,
      pressure: (p[2] ?? PRESSURE_SCALE / 2) / PRESSURE_SCALE,
      timestamp: (p[3] ?? 0) / TIMESTAMP_SCALE
    }))
    const strokeColor = highlight ? this.HIGHLIGHT_COLOR : color
    const baseWidth = brushBaseWidth(trajectory.brush, box.w, box.h)
    const widths = computeBrushWidths(px, baseWidth)
    drawBrushStroke(this.ctx, px, widths, strokeColor)
  },

  // 回放背景: 当前汉字（楷体半透明，颜色适配主题色）作为书写参照，而非书写笔画
  drawPlaybackBackground() {
    if (!this.currentChar) return
    this.drawCharRef(charRefColor())
  },

  // ---- 撤销/清空 ----
  // 撤销最近一笔: 回调请求宿主处理（宿主区分 local-/服务端id）
  // reason: 'undo'（撤销触发）| 'delete'（行内删除触发）
  undo() {
    if (this.mode !== 'write' || this.strokes.length === 0) return
    const last = this.strokes[this.strokes.length - 1]
    this.strokes = this.strokes.slice(0, -1)
    this.redrawCanvas()
    this._opts.onStrokeRemoveRequest?.({ strokeId: last.id, reason: 'undo' })
  },

  // 清空画布（当前会话的全部笔画）: 回调宿主备份全部笔画（支持恢复）
  clearPad() {
    if (this.mode !== 'write') return
    const all = this.strokes
    this.strokes = []
    this.redrawCanvas()
    this._opts.onStrokeClearAll(all)
  },

  // ---- 回放模式静态显示（非播放时: 只显示已播放笔画，后续笔画始终不显示） ----
  // 已播放 = playbackIndex 之前的笔画；悬停笔画提升至最上层高亮（恢复后按原始顺序）
  renderPlaybackStatic() {
    if (this.mode !== 'playback') return
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.drawTianZiGe()
    this.drawPlaybackBackground()
    const highlightId = this.hoveredStrokeId ?? null
    const list = this.playbackStrokes.slice(0, this.playbackIndex)
    for (const s of list) {
      if (highlightId != null && s.id === highlightId) continue
      this.drawTrajectory(s.trajectory_data, strokeInkColor(), false)
    }
    if (highlightId != null) {
      const s = list.find(x => x.id === highlightId)
      if (s) this.drawTrajectory(s.trajectory_data, this.HIGHLIGHT_COLOR, true)
    }
  },
}))
