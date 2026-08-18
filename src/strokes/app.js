// ============ 汉字列表页组件（列表页 index.html 专用） ============
// 列: 汉字/读音/结构(内联编辑)/笔画图(小图)；按权重降序
// 过滤: 完整笔画图 + 字/拼音搜索；分页大小可选；过滤与分页均 URL 路由
import Alpine from 'alpinejs'
import { api } from '@services/api.js'
import { createSyncClient } from '@services/syncClient.js'
import { CHARACTER_STRUCTURES, structureLabel } from '@components/CharacterStructures.js'
import { strokeInkColor, charInkBox, ensureKaiFont } from '@components/StrokeBackground.js'
import { COORD_SCALE } from '@components/Constants.js'
import { THEME_CHANGE_EVENT } from '@components/ThemeToggle.js'
import { setBackUrl } from '@services/session.js'
import { numberToSymbolTonePinyin } from '@services/pinyin.js'

Alpine.data('characterList', () => ({
  characters: [],
  search: '',
  page: 1,
  limit: 20,
  hasStrokes: '',          // ''全部 | '1'完整 | '2'仅含部分笔画图 | '0'无笔画图
  totalPages: 1,
  jumpPage: 1,             // 分页跳转输入
  LIMIT_OPTIONS: [20, 50, 100],
  themeVersion: 0,         // 主题版本号（x-effect 依赖，主题切换时重绘笔画缩略图）
  loadError: '',           // 列表加载失败提示（与加载中/无结果互斥）
  CHARACTER_STRUCTURES: CHARACTER_STRUCTURES,   // 结构内联编辑下拉
  structureLabel: structureLabel,               // 结构名显示
  symbolPinyin: numberToSymbolTonePinyin,       // 数字声调拼音 → 符号声调
  loading: false,
  error: null,

  init() {
    // 从 URL 参数恢复 过滤/分页（?page=&limit=&search=&has_strokes=）
    const params = new URLSearchParams(window.location.search)
    this.page = parseInt(params.get('page')) || 1
    this.jumpPage = this.page          // 跳转输入框与 URL 解析的当前页同步
    this.limit = parseInt(params.get('limit')) || 20
    this.search = params.get('search') || ''
    const hs = params.get('has_strokes')
    if (hs === '1' || hs === '0' || hs === '2') this.hasStrokes = hs
    this.load()
    this.setupSync()
    // 主题切换时递增版本号，驱动笔画缩略图 x-effect 重绘（颜色适配主题）
    window.addEventListener(THEME_CHANGE_EVENT, () => {
      this.themeVersion++
    })
    // 楷体加载完成后重绘缩略图（墨迹盒坐标还原依赖字体度量）
    ensureKaiFont().then(() => { this.themeVersion++ })
  },

  // ---- 多端同步: 他端写入笔画/修改信息 → 刷新列表；他端跳转 → 跟随 ----
  setupSync() {
    this.sync = createSyncClient()
    this.sync.on('navigate', (p) => {
      if (p.url) location.href = p.url
    })
    this.sync.on('strokes-changed', () => this.load())
    this.sync.on('character-updated', () => this.load())
  },

  // 更新 URL 路由参数（过滤/分页），并刷新列表
  updateUrl() {
    const params = new URLSearchParams()
    if (this.page > 1) params.set('page', String(this.page))
    if (this.limit !== 20) params.set('limit', String(this.limit))
    if (this.search) params.set('search', this.search)
    if (this.hasStrokes !== '') params.set('has_strokes', this.hasStrokes)
    const qs = params.toString()
    history.replaceState(null, '', qs ? '?' + qs : window.location.pathname)
    this.load()
  },

  async load() {
    this.loading = true
    this.loadError = ''
    try {
      const params = new URLSearchParams({ page: this.page, limit: this.limit })
      if (this.search) params.set('search', this.search)
      if (this.hasStrokes !== '') params.set('has_strokes', this.hasStrokes)
      const res = await api.get(`/api/characters?${params}`)
      this.characters = res.data || []
      this.totalPages = res.meta?.totalPages ?? 1
      this.jumpPage = this.page   // 加载完成后同步跳转输入框
    } catch (e) {
      this.loadError = e.message
      this.characters = []
    } finally {
      this.loading = false
    }
  },

  setPage(p) {
    this.page = Math.max(1, Math.min(p, this.totalPages))
    this.jumpPage = this.page   // 跳转输入框与当前页保持同步
    this.updateUrl()
  },

  // 跳转到指定页码（分页输入框）
  jumpTo() {
    const p = parseInt(this.jumpPage)
    if (Number.isInteger(p) && p >= 1) {
      this.setPage(p)           // setPage 内会同步 jumpPage
    } else {
      this.jumpPage = this.page
    }
  },

  setLimit(l) {
    this.limit = l
    this.page = 1
    this.updateUrl()
  },

  onSearch() {
    this.page = 1
    this.updateUrl()
  },

  setHasStrokes(v) {
    this.hasStrokes = v
    this.page = 1
    this.updateUrl()
  },

  // 结构内联编辑（唯一可编辑字段，其余只读）
  async updateStructure(character, structure) {
    const code = Number(structure)
    if (!Number.isInteger(code) || character.structure === code) return
    try {
      const res = await api.patch(`/api/characters/${character.id}`, { structure: code })
      character.structure = res.data.structure
    } catch (e) {
      this.error = e.message
    }
  },

  // 笔画小图: 以背景汉字墨迹盒为坐标系还原笔画轨迹（归一化 ×1000），
  // 等比缩放到缩略图尺寸；字体未加载/未覆盖该字时不绘制
  renderThumb(canvas, strokes, character) {
    if (!canvas) return
    const size = 44
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const box = character ? charInkBox(size, size, character) : null
    if (!box) return
    ctx.strokeStyle = strokeInkColor()   // 墨色适配主题
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokes || []) {
      const pts = stroke.trajectory_data?.points || []
      if (pts.length === 0) continue
      ctx.beginPath()
      pts.forEach((p, i) => {
        // 盒相对还原: 盒起点 + 归一化值 × 盒宽/高（x、y 分别按盒宽、盒高）
        const x = box.x0 + (p[0] / COORD_SCALE) * box.w
        const y = box.y0 + (p[1] / COORD_SCALE) * box.h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  },

  // 点击行 → 跳转书写页（目录式: 指定目录 write/，自动定位 write/index.html）
  // 记录来源 URL（含过滤/分页参数），书写页"返回"按钮据此恢复进入前的页面
  // 广播 navigate: 其他端的列表/书写页同步跳转到该字的书写页
  openWriter(character) {
    setBackUrl()
    this.sync?.emit('navigate', {
      url: `write/?char=${encodeURIComponent(character.character)}&mode=write`
    })
    location.href = `write/?char=${encodeURIComponent(character.character)}&mode=write`
  }
}))
