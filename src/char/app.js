// ============ 汉字信息页组件（char/index.html） ============
// 展示: 书写动画（倍速/暂停/重置）/ 读音试听 / 复制 / 汉典链接 / 笔画分解图
import Alpine from 'alpinejs'
import { AnimationEngine } from '@components/AnimationEngine.js'
import { drawTianZiGe, drawCharRef, charRefColor, strokeInkColor, displayUnit, ensureKaiFont } from '@components/StrokeBackground.js'
import { THEME_CHANGE_EVENT } from '@components/ThemeToggle.js'
import { DISPLAY_PEN_WIDTH_COEF, STROKE_HIGHLIGHT_COLOR } from '@components/Constants.js'
import { loadCharMeta, loadCharStrokes } from '@services/data.js'
import { numberToSymbolTonePinyin } from '@services/pinyin.js'
import { copyText } from '@services/clipboard.js'
import { setBackUrl } from '@services/session.js'

Alpine.data('charApp', () => ({
  char: '',
  unicode: 0,
  zdicUrl: '',
  meta: null,
  strokes: [],
  hasStrokes: false,
  loading: true,
  error: '',
  engine: null,
  SPEEDS: [0.5, 1, 1.5, 2],
  playbackSpeed: 1,
  playing: false,
  audio: null,
  audioHint: '',
  copiedValue: null,
  _copyTimer: null,
  // 本地开发模式下显示跳转笔画书写页的浮动按钮
  writeButton: import.meta.env.DEV,
  writeUrl: '',

  async init() {
    // 路由参数: /char/?v=<汉字>
    this.char = (new URLSearchParams(location.search).get('v') || '').trim()
    if (!this.char) {
      this.error = '缺少汉字参数'
      this.loading = false
      return
    }
    this.unicode = this.char.codePointAt(0)
    this.zdicUrl = `https://zdic.net/hans/${encodeURIComponent(this.char)}`
    this.writeUrl = `/strokes/write/?char=${encodeURIComponent(this.char)}`
    try {
      this.meta = await loadCharMeta(this.unicode)
    } catch {
      this.error = `未找到汉字「${this.char}」的信息`
      this.loading = false
      return
    }
    // 笔画数据仅常用字存在（其余汉字不支持播放书写动画与笔画分解）
    this.strokes = await loadCharStrokes(this.unicode)
    this.hasStrokes = Array.isArray(this.strokes) && this.strokes.length > 0
    this.loading = false
    await this.ensureFont()
    this.$nextTick(() => this.initEngine())
  },

  // 楷体可用后画布才能以楷体绘制字型背景（系统 SimKai 优先）
  async ensureFont() {
    await ensureKaiFont()
  },

  // 书写动画引擎: 田字格 + 字型背景（背景汉字半透明，颜色适配主题），
  // 正在绘制笔画红色，已绘笔画黑色
  // 无笔画数据时同样绘制田字格 + 背景汉字，仅不加载笔画（无播放功能）
  // 画布 CSS 尺寸由父容器决定（w-full + aspect-ratio），内部坐标恒为 500×500，
  // 绘制时机等画布尺寸确定后进行（宽度为 0 时跳过，待布局完成后重绘）
  initEngine() {
    if (!this.$refs.mainCanvas) return
    this.engine = new AnimationEngine(this.$refs.mainCanvas, {
      highlightColor: STROKE_HIGHLIGHT_COLOR,
      strokeGap: 300,
      penWidthCoef: DISPLAY_PEN_WIDTH_COEF,
      completedColor: () => strokeInkColor()   // 已绘笔画墨色（适配主题）
    })
    this.engine.onBeforeRender = () => {
      const canvas = this.$refs.mainCanvas
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (!rect.width) return   // 尺寸未确定，暂不绘制
      drawTianZiGe(this.engine.ctx, this.engine.cssW, this.engine.cssH, displayUnit(canvas, rect), rect.width)
      drawCharRef(this.engine.ctx, this.engine.cssW, this.engine.cssH, this.char, charRefColor())
    }
    this.engine.onComplete = () => {
      this.playing = false
    }
    if (this.hasStrokes) {
      this.engine.loadStrokes(this.strokes)
    } else {
      // 无笔画数据: 显式绘制田字格与背景汉字
      this.engine.clearCanvas()
    }
    // 尺寸未确定时等待布局完成后重绘（尺寸确定后再绘制田字格/背景汉字/笔画）
    const retry = () => {
      const canvas = this.$refs.mainCanvas
      if (!canvas) return
      if (!canvas.getBoundingClientRect().width) {
        requestAnimationFrame(retry)
        return
      }
      const e = this.engine
      e.clearCanvas()
      if (this.hasStrokes) e.redrawCompleted()
    }
    requestAnimationFrame(retry)

    // 主题切换时重绘背景
    window.addEventListener(THEME_CHANGE_EVENT, () => {
      const e = this.engine
      if (!e || e.state === 'PLAYING') return
      e.clearCanvas()
      e.redrawCompleted()
    })
    // 窗口尺寸变化（断点切换等）时按新显示比例重绘静态画面
    window.addEventListener('resize', () => {
      const e = this.engine
      if (!e || e.state === 'PLAYING') return
      e.clearCanvas()
      e.redrawCompleted()
    })
  },

  play() {
    if (!this.engine || !this.hasStrokes) return
    this.engine.singleStrokePlayback = false
    this.engine.play()
    this.playing = this.engine.state === 'PLAYING'
  },

  pause() {
    if (!this.engine) return
    this.engine.pause()
    this.playing = this.engine.state === 'PLAYING'
  },

  resetPlay() {
    if (!this.engine) return
    this.engine.reset()
    this.playing = false
  },

  // 播放倍速（0.25-4 之间实时生效）
  setSpeed(s) {
    this.playbackSpeed = s
    this.engine?.setSpeed(s)
  },

  // 读音试听: 音频 url 为 /assets/audio/pinyin/{数字声调拼音}.mp3（如 di4.mp3）
  playPinyin(p) {
    this.stopAudio()
    const url = `/assets/audio/pinyin/${encodeURIComponent(p)}.mp3`
    const audio = new Audio(url)
    this.audio = audio
    audio.onerror = () => {
      this.audioHint = `音频 ${p}.mp3 不存在`
    }
    audio.play().catch(() => {
      this.audioHint = `音频 ${p}.mp3 播放失败`
    })
  },

  stopAudio() {
    if (this.audio) {
      this.audio.pause()
      this.audio = null
    }
  },

  // 记录返回地址（书写页"返回"按钮据此回到汉字信息页）
  rememberBack() {
    setBackUrl()
  },

  // 数字声调拼音 → 符号声调拼音（展示用）
  symbolPinyin(p) {
    return numberToSymbolTonePinyin(p)
  },

  // 复制到剪贴板（含非安全上下文回退），成功后提示「已复制」
  async copy(value) {
    const ok = await copyText(value)
    if (ok) {
      this.copiedValue = String(value)
      clearTimeout(this._copyTimer)
      this._copyTimer = setTimeout(() => { this.copiedValue = null }, 1500)
    }
  }
}))
