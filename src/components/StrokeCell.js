// 笔画分解图中的单个笔画格子（汉字信息页专用）:
// 以田字格 + 汉字字型为背景（背景汉字半透明，颜色适配主题），展示该笔画的
// 位置（此前笔画墨色已绘，当前笔画红色示位）、名称与笔顺。
// 点击分解图即可播放该笔画的书写动画（红色笔触），自动循环播放当前笔画
// （循环间插入短暂等待，避免视觉跳动），再次点击终止播放。
// 田字格线宽按画布显示尺寸缩放，确保缩小显示的分解图中虚线清晰可见。
import Alpine from 'alpinejs'
import { AnimationEngine } from './AnimationEngine.js'
import { drawTianZiGe, drawCharRef, charRefColor, strokeInkColor, displayUnit } from './StrokeBackground.js'
import { THEME_CHANGE_EVENT } from './ThemeToggle.js'
import { DISPLAY_PEN_WIDTH_COEF } from './Constants.js'
import { strokeTypesMap } from './StrokeTypes.js'

Alpine.data('strokeCell', (char, index, strokes) => ({
  canvas: null,
  engine: null,
  playing: false,
  _loopTimer: null,

  init() {
    this.canvas = this.$refs.canvas
    this.engine = new AnimationEngine(this.canvas, {
      highlightColor: '#dc2626',   // 正在绘制的笔画: 红色笔触
      strokeGap: 0,
      penWidthCoef: DISPLAY_PEN_WIDTH_COEF,
      completedColor: () => strokeInkColor()   // 已绘笔画墨色（适配主题）
    })
    // 背景: 田字格 + 半透明汉字字型（颜色适配主题）
    // 换算系数由画布设备像素与实测显示宽度得出，尺寸未确定（宽度为 0）时暂不绘制，
    // 保证任意显示尺寸/DPR 下各格线宽与虚线模式完全一致
    this.engine.onBeforeRender = () => {
      const rect = this.canvas.getBoundingClientRect()
      if (!rect.width) return
      drawTianZiGe(this.engine.ctx, this.engine.cssW, this.engine.cssH, displayUnit(this.canvas, rect), rect.width)
      drawCharRef(this.engine.ctx, this.engine.cssW, this.engine.cssH, char, charRefColor())
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

    this.engine.loadStrokes(strokes)
    this.renderStatic()

    // 主题切换时重绘（田字格/背景汉字/已绘笔画颜色适配主题色）
    window.addEventListener(THEME_CHANGE_EVENT, () => {
      if (!this.playing) this.renderStatic()
    })
    // 窗口尺寸变化（断点切换等）时按新显示比例重绘
    window.addEventListener('resize', () => {
      if (!this.playing) this.renderStatic()
    })
  },

  // 静态显示: 该笔之前笔画墨色已绘，当前笔画以红色示位；
  // 尺寸未确定时暂不绘制，待布局完成后再绘制
  renderStatic() {
    if (!this.engine || this.engine.strokes.length === 0) return
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
    return strokeTypesMap[s.stroke_type]?.name || '未指定'
  },

  // 点击分解图: 播放（自动循环当前笔画）/ 终止播放
  togglePlay() {
    if (this.playing) this.stop()
    else this.play()
  },

  play() {
    if (!this.engine || this.engine.strokes.length === 0) return
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
