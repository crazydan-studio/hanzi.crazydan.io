// 汉字列表页公共组件（常用字列表 / 拼音字列表共用）:
// 页面结构（顶部栏 + 列表面板）经 x-html 渲染，状态与交互（加载/失败/空态互斥、
// 格子点击跳转、选中字高亮/定位）在此统一实现
// 页面用法: <div x-data="pinyinApp()" class="max-w-4xl mx-auto px-4 py-6" x-html="html"></div>
// 依赖的公共组件（pageHeader/themeToggle/ziGrid/loadingOverlay）随本模块副作用注册，
// 使用页面无需重复导入
import Alpine from 'alpinejs'
import { loadCommons, loadPinyinList } from '@services/data.js'
import './PageHeader.js'
import './ThemeToggle.js'
import './ZiGrid.js'
import './LoadingOverlay.js'

// 列表面板模板: 状态互斥 + 汉字网格（ziGrid 自注册组件）+ 加载悬浮层
const PANEL_HTML = `
  <section class="panel p-4 md:p-6">
    <div class="relative min-h-[120px]">
      <p x-show="!loading && error" x-cloak class="py-12 text-center text-red-600" x-text="error"></p>
      <p x-show="!loading && !error && empty" x-cloak
        class="py-12 text-center text-gray-500 dark:text-gray-400" x-text="emptyText"></p>
      <div x-show="!loading && !error && !empty"
        x-data="ziGrid()" x-effect="setZis(list)" @click="onCellClick($event)" x-html="gridHtml"
        class="zi-grid"></div>
      <div x-show="loading" x-data="loadingOverlay(loadingText)" class="loading-overlay" x-html="html"></div>
    </div>
  </section>
`

// 列表页组件工厂
// config:
//   pagePath:         本页路径（openZi 就地更新 URL 用）
//   load:             (value) => 列表数据 Promise（[字, 读音][]）
//   valueParam:       列表值 URL 参数名（如拼音页 'v'；无值参数时缺省）
//   selectedParam:    选中字 URL 参数名（返回本页时高亮）
//   scrollToSelected: 加载后是否滚动定位到选中字（常用字页定位，拼音页仅高亮）
//   title:            (value) => 标题 HTML（动态部分用 x-text 绑定，避免拼接用户输入）
//   emptyText:        (value) => 空态提示文本
//   loadError:        (value) => 加载失败提示
//   loadingText:      加载中提示
function createZiListPage(config) {
  return {
    p: '',                  // 列表值（拼音等，来自 URL 参数）
    list: [],
    loading: true,
    error: '',
    empty: false,
    selected: '',           // 选中字（返回本页时高亮/定位）
    emptyText: '',
    loadingText: config.loadingText ?? '正在加载…',
    selectedClass: 'ring-2 ring-blue-400 bg-blue-50 dark:bg-gray-700',

    async init() {
      const params = new URLSearchParams(location.search)
      if (config.valueParam) {
        this.p = (params.get(config.valueParam) || '').trim().toLowerCase()
        if (!this.p) {
          this.error = '缺少参数'
          this.loading = false
          return
        }
      }
      this.emptyText = config.emptyText(this.p)
      this.selected = (params.get(config.selectedParam) || '').trim()
      try {
        const list = await config.load(this.p)
        this.list = list || []
        if (this.list.length === 0) this.empty = true
      } catch {
        this.error = config.loadError(this.p)
      } finally {
        this.loading = false
        this.$nextTick(() => this.afterLoad())
      }
    },

    get countText() {
      return this.list.length ? `（${this.list.length} 个）` : ''
    },

    get html() {
      // titleHtml 经 x-data 属性传入: 双引号按 HTML 属性转义（&quot;），
      // 动态部分（拼音值/计数）用 x-text 绑定宿主作用域属性，避免拼接用户输入
      const title = config.title(this.p).replace(/"/g, '&quot;')
      return `
        <div x-data="pageHeader({ titleHtml: '${title}', mb: 'mb-4' })" x-html="html"></div>
        ${PANEL_HTML}
      `
    },

    // 点击汉字: 就地更新 url 参数记录选中字，并跳转汉字信息页
    // 注意: 保留现有全部查询参数并以尾斜杠结尾，避免回退时触发
    // 无尾斜杠的 302 重定向（其 Location 不带查询串，导致参数丢失）
    openZi(c) {
      const params = new URLSearchParams(location.search)
      if (config.valueParam) params.set(config.valueParam, this.p)
      params.set(config.selectedParam, c[0])
      history.replaceState(null, '', `${config.pagePath}/?${params.toString()}`)
      location.href = `/zi/?v=${encodeURIComponent(c[0])}`
    },

    // 格子点击事件（事件委托）
    onCellClick(event) {
      const cell = event.target.closest('[data-zi]')
      if (!cell) return
      this.openZi({ 0: cell.dataset.zi })
    },

    // 返回本页时高亮选中字（常用字页同时滚动定位）
    afterLoad() {
      if (!this.selected) return
      const cell = this.$root.querySelector(`[data-zi="${CSS.escape(this.selected)}"]`)
      if (!cell) return
      if (config.scrollToSelected) cell.scrollIntoView({ block: 'center' })
      cell.classList.add(...this.selectedClass.split(' '))
    }
  }
}

// 常用字列表页
Alpine.data('commonsApp', () => createZiListPage({
  pagePath: '/commons',
  selectedParam: 'v',
  scrollToSelected: true,
  title: () => '常用字列表',
  emptyText: () => '暂无常用字数据',
  loadError: () => '常用字数据加载失败',
  loadingText: '正在加载常用字…',
  load: () => loadCommons()
}))

// 拼音字列表页
Alpine.data('pinyinApp', () => createZiListPage({
  pagePath: '/pinyin',
  valueParam: 'v',
  selectedParam: 'c',
  title: () => '拼音「<span class="text-blue-600" x-text="p"></span>」的汉字',
  emptyText: (p) => `未找到拼音「${p}」的汉字`,
  loadError: (p) => `拼音「${p}」数据加载失败`,
  loadingText: '正在加载汉字…',
  load: (p) => loadPinyinList(p)
}))
