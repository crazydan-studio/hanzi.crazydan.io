// 笔画分解图中的单个笔画格子（汉字信息页专用）:
// 以田字格 + 汉字字型为背景（背景汉字半透明，颜色适配主题），展示该笔画的
// 位置（此前笔画墨色已绘，当前笔画红色示位）、名称与笔顺。
// 点击分解图即可播放该笔画的书写动画（红色笔触），自动循环播放当前笔画
// （循环间插入短暂等待，避免视觉跳动），再次点击终止播放。
// 田字格线宽按画布显示尺寸缩放，确保缩小显示的分解图中虚线清晰可见。
// 背景字统一使用自带中易楷体（不做系统字体/兜底）: 字体加载完成且覆盖该字
// 后才渲染背景字与笔画（坐标以墨迹盒为坐标系），等待期间显示加载信息。
import Alpine from 'alpinejs'
import { AnimationEngine } from './AnimationEngine.js'
import { drawCanvasBackground, ziInkBox, strokeInkColor, ensureKaiFont } from './StrokeBackground.js'
import { THEME_CHANGE_EVENT } from './ThemeToggle.js'
import { STROKE_HIGHLIGHT_COLOR } from './Constants.js'
import { strokeTypeName } from './StrokeTypes.js'

Alpine.data('strokeCell', (zi, index, strokes) => ({
  canvas: null,
  engine: null,
  playing: false,
  fontReady: false,        // 楷体已加载且覆盖该字（背景字/墨迹盒可渲染）
  _loopTimer: null,
  _box: null,               // 背景字光栅实测盒（笔画坐标还原基准）

  init() {
    this.canvas = this.$refs.canvas
    this.engine = new AnimationEngine(this.canvas, {
      highlightColor: STROKE_HIGHLIGHT_COLOR,
      strokeGap: 0,
      completedColor: () => strokeInkColor(),   // 已绘笔画墨色（适配主题）
      // 墨迹盒提供者: 仅使用背景字光栅实测盒（与背景字严格对齐）;
      // 实测盒不可用（字体未就绪）时笔画不绘制
      ziBox: () => this._box
    })
    // 背景: 田字格 + 半透明汉字字型（颜色适配主题）
    this.engine.onBeforeRender = () => {
      drawCanvasBackground(this.canvas, this.engine.ctx, this.engine.cssW, this.engine.cssH, zi)
    }
    this.engine.onStrokeStart = () => { this.playing = true }
    // 自动循环播放当前笔画（单笔播放，不会继续播放剩余笔画）;
    // 循环间插入短暂等待，避免相隔太近造成视觉跳动
    this.engine.onComplete = () => {
      if (!this.playing) return
      this._loopTimer = setTimeout(() => {
        if (this.playing) {
          this.engine.seekToStroke(index)
          this.engine.play()
        }
      }, 400)
    }

    // 等待自带楷体加载（无系统字体/无兜底）: 就绪后测量背景字光栅实测盒并渲染
    ensureKaiFont().then(ok => {
      this.fontReady = ok
      this.engine.loadStrokes(strokes)
      this.remeasureBox()
      this.renderStatic()
    })

    // 主题切换时重绘（田字格/背景汉字/已绘笔画颜色适配主题色）
    window.addEventListener(THEME_CHANGE_EVENT, () => {
      if (!this.playing) this.renderStatic()
    })
    // 窗口尺寸变化（断点切换等）时按新显示比例重绘
    window.addEventListener('resize', () => {
      if (!this.playing) this.renderStatic()
    })
  },

  // 测量背景字光栅实测盒（字体就绪后）: 笔画按实测盒还原（与背景字严格对齐）
  remeasureBox() {
    if (!this.fontReady) return
    this._box = ziInkBox(this.engine.cssW, this.engine.cssH, zi)
    if (this._box) this.engine.refreshBox()
  },

  // 静态显示: 该笔之前笔画墨色已绘，当前笔画以红色示位；
  // 尺寸未确定/实测盒不可用（字体未就绪）时暂不绘制，待就绪后重绘
  renderStatic() {
    if (!this.engine || this.engine.strokes.length === 0) return
    if (!this.fontReady || !this._box) {
      setTimeout(() => { if (!this.playing) this.renderStatic() }, 50)
      return
    }
    if (!this.canvas.getBoundingClientRect().width) {
      setTimeout(() => { if (!this.playing) this.renderStatic() }, 50)
      return
    }
    this.engine.seekToStroke(index)
    this.engine.renderFrame(this.engine.strokes[index], 1)
  },

  // 笔画名称（由笔画类型编码映射）
  get name() {
    const s = (strokes || [])[index]
    if (!s) return ''
    return strokeTypeName(s.stroke_type)
  },

  // 点击分解图: 播放（自动循环当前笔画）/ 终止播放
  togglePlay() {
    if (this.playing) this.stop()
    else this.play()
  },

  play() {
    if (!this.engine || this.engine.strokes.length === 0) return
    if (!this.fontReady || !this._box) return   // 实测盒未就绪（字体未加载）不可播放
    // 单笔播放: 只播放当前笔画，结束后经 onComplete 循环重播
    this.engine.singleStrokePlayback = true
    this.engine.seekToStroke(index)
    this.engine.play()
    this.playing = true
  },

  stop() {
    if (!this.engine) return
    this.playing = false
    clearTimeout(this._loopTimer)
    this._loopTimer = null
    this.engine.reset()
    this.renderStatic()
  }
}))
