// ============ 汉字信息页组件（char/index.html） ============
// 展示: 书写动画（倍速/暂停/重置）/ 读音试听 / 复制 / 汉典链接 / 笔画分解图
import Alpine from 'alpinejs'
import { AnimationEngine } from '@components/AnimationEngine.js'
import { drawTianZiGe, drawCharRef, charRefColor, strokeInkColor, displayUnit, ensureKaiFont } from '@components/StrokeBackground.js'
import { THEME_CHANGE_EVENT } from '@components/ThemeToggle.js'
import { DISPLAY_PEN_WIDTH_COEF } from '@components/Constants.js'
import { loadCharMeta, loadCharStrokes } from '@services/data.js'
import { pinyinAudioName } from '@services/pinyin.js'
import { copyText } from '@services/clipboard.js'
import { setBackUrl } from '@services/session.js'

// Android 系统图标（App 下载选择窗口按钮）
const ANDROID_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-7 w-7 text-green-500"><path d="M17.5 8.5c-.9 0-1.7.4-2.3 1H8.8c-.6-.6-1.4-1-2.3-1C4.6 8.5 3 10.1 3 12v3.5h18V12c0-1.9-1.6-3.5-3.5-3.5zM6.5 11.5c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm11 0c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zM8.8 9.5 7 6.3c-.3-.5 0-1.1.5-1.3.5-.3 1.1 0 1.3.5l1.8 3.1c.5-.1 1-.2 1.4-.2s.9.1 1.4.2l1.8-3.1c.3-.5.8-.8 1.3-.5.5.3.8.8.5 1.3l-1.8 3.2h-6.4zm-3.3 7.5H4V19.5c0 .6.4 1 1 1s1-.4 1-1V17zm13 0h-1.5v2.5c0 .6.4 1 1 1s1-.4 1-1V17z"/></svg>'

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
  // App 下载平台（系统图标按钮）: 目前仅支持 android
  APP_PLATFORMS: [
    { id: 'android', name: 'Android', ext: 'apk', icon: ANDROID_ICON }
  ],
  showAppDialog: false,

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
      highlightColor: '#dc2626',
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

  // 读音试听: 音频 url 为 /assets/audio/pinyin/{无声调拼音+声调数字}.mp3
  // 声调一到四声用 1-4 表示，轻声拼音无声调不加数字
  playPinyin(p) {
    this.stopAudio()
    const name = pinyinAudioName(p)
    const url = `/assets/audio/pinyin/${encodeURIComponent(name)}.mp3`
    const audio = new Audio(url)
    this.audio = audio
    audio.onerror = () => {
      this.audioHint = `音频 ${name}.mp3 不存在`
    }
    audio.play().catch(() => {
      this.audioHint = `音频 ${name}.mp3 播放失败`
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
