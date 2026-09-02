// 汉字列表页公共组件（常用字列表 / 拼音字列表共用）:
// 页面结构（顶部栏 + 列表面板 + 分页控件）经 x-html 渲染，状态与交互
// （加载/失败/空态互斥、格子点击跳转、分页、选中字高亮/定位）在此统一实现
// 分页: 每页 50/100/200，可上一页/下一页/跳转指定页; page/size/选中字记录在 URL，
//   从汉字信息页返回后按 URL 恢复分页并定位选中字所在页
// 页面用法: <div x-data="pinyinApp()" class="max-w-4xl mx-auto px-4 py-6" x-html="html"></div>
// 依赖的公共组件（pageHeader/themeToggle/ziGrid/loadingOverlay）随本模块副作用注册，
// 使用页面无需重复导入
import Alpine from 'alpinejs'
import { loadCommons, loadPinyinList } from '@services/data.js'
import './PageHeader.js'
import './ThemeToggle.js'
import './ZiGrid.js'
import './LoadingOverlay.js'

// 分页大小选项
const PAGE_SIZES = [50, 100, 200]
const DEFAULT_PAGE_SIZE = 100
// URL 参数名
const PAGE_PARAM = 'page'
const SIZE_PARAM = 'size'

// 列表面板模板: 状态互斥 + 汉字网格（ziGrid 自注册组件，按当前页渲染）+ 分页控件 + 加载悬浮层
const PANEL_HTML = `
  <section class="panel p-4 md:p-6">
    <div class="relative min-h-[120px]">
      <p x-show="!loading && error" x-cloak class="py-12 text-center text-red-600" x-text="error"></p>
      <p x-show="!loading && !error && empty" x-cloak
        class="py-12 text-center text-gray-500 dark:text-gray-400" x-text="emptyText"></p>
      <div x-show="!loading && !error && !empty"
        x-data="ziGrid()" x-effect="setZis(pageList)" @click="onCellClick($event)" x-html="gridHtml"
        class="zi-grid"></div>
      <div x-show="loading" x-data="loadingOverlay(loadingText)" class="loading-overlay" x-html="html"></div>
    </div>
    <!-- 分页控件: 每页大小 / 页码 / 跳转（仅列表非空时显示） -->
    <div x-show="!loading && !error && !empty" x-cloak
      class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-300">
      <div class="flex items-center gap-1.5">
        <span>每页</span>
        <select x-model.number="pageSize" @change="onPageSizeChange()"
          class="input !w-16 !py-1 !px-1">
          <template x-for="s in PAGE_SIZES" :key="s">
            <option :value="s" x-text="s"></option>
          </template>
        </select>
        <span>第 <b x-text="page"></b> / <b x-text="totalPages"></b> 页</span>
        <span class="text-gray-400 dark:text-gray-500">（第 <b x-text="pageStart"></b>-<b x-text="pageEnd"></b> 字，共 <b x-text="list.length"></b> 字）</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button type="button" class="btn-sm" :disabled="page <= 1" @click="goPage(page - 1)"
          :class="page <= 1 ? 'disabled:cursor-not-allowed disabled:opacity-40' : ''">上一页</button>
        <button type="button" class="btn-sm" :disabled="page >= totalPages" @click="goPage(page + 1)"
          :class="page >= totalPages ? 'disabled:cursor-not-allowed disabled:opacity-40' : ''">下一页</button>
        <span class="mx-0.5">跳转</span>
        <input type="number" min="1" x-model.number="jumpPage" @keydown.enter="goJump()"
          class="input !w-16 !py-1 text-sm" aria-label="跳转到第几页">
        <button type="button" class="btn-sm" @click="goJump()">前往</button>
      </div>
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
    list: [],               // 全量列表（[字, 读音][]）
    loading: true,
    error: '',
    empty: false,
    selected: '',           // 选中字（返回本页时高亮/定位）
    emptyText: '',
    loadingText: config.loadingText ?? '正在加载…',
    selectedClass: 'ring-2 ring-blue-400 bg-blue-50 dark:bg-gray-700',
    // 分页状态（page/size 记录于 URL）
    PAGE_SIZES: PAGE_SIZES,
    pageSize: DEFAULT_PAGE_SIZE,
    page: 1,
    jumpPage: 1,

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
      const size = Number(params.get(SIZE_PARAM))
      if (PAGE_SIZES.includes(size)) this.pageSize = size
      const page = Number(params.get(PAGE_PARAM))
      if (Number.isInteger(page) && page > 0) this.page = page
      try {
        const list = await config.load(this.p)
        this.list = list || []
        if (this.list.length === 0) this.empty = true
        else {
          // 页码钳制; 含选中字时定位到其所在页（返回本页/直达链接均能恢复）
          if (this.page > this.totalPages) this.page = this.totalPages
          if (this.selected) {
            const idx = this.list.findIndex(c => c[0] === this.selected)
            if (idx !== -1) this.page = Math.floor(idx / this.pageSize) + 1
          }
          this.jumpPage = this.page
          this.syncUrl()   // 定位结果回写 URL（钳制/选中字跨页时）
        }
      } catch {
        this.error = config.loadError(this.p)
      } finally {
        this.loading = false
        this.$nextTick(() => this.afterLoad())
      }
    },

    // ---- 分页 ----
    get totalPages() {
      return Math.max(1, Math.ceil(this.list.length / this.pageSize))
    },

    get pageList() {
      const start = (this.page - 1) * this.pageSize
      return this.list.slice(start, start + this.pageSize)
    },

    get pageStart() {
      return this.list.length ? (this.page - 1) * this.pageSize + 1 : 0
    },

    get pageEnd() {
      return Math.min(this.page * this.pageSize, this.list.length)
    },

    // 页码变更: 记录 URL 并回到页首
    goPage(n) {
      const target = Math.max(1, Math.min(n, this.totalPages))
      if (target === this.page) return
      this.page = target
      this.jumpPage = target
      this.syncUrl()
      window.scrollTo({ top: 0 })
    },

    // 每页大小变更: 保持当前页不越界
    onPageSizeChange() {
      if (this.page > this.totalPages) {
        this.page = this.totalPages
      }
      this.jumpPage = this.page
      this.syncUrl()
      window.scrollTo({ top: 0 })
    },

    // 跳转到指定页（输入框）
    goJump() {
      const n = Math.floor(Number(this.jumpPage))
      if (!Number.isInteger(n) || n < 1) {
        this.jumpPage = this.page
        return
      }
      this.goPage(n)
    },

    // 分页/选中字写入 URL（返回本页或分享链接时据此恢复）
    syncUrl() {
      const params = new URLSearchParams(location.search)
      if (config.valueParam && this.p) params.set(config.valueParam, this.p)
      if (this.selected) params.set(config.selectedParam, this.selected)
      params.set(PAGE_PARAM, String(this.page))
      params.set(SIZE_PARAM, String(this.pageSize))
      history.replaceState(null, '', `${config.pagePath}/?${params.toString()}`)
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

    // 点击汉字: 就地更新 url 参数记录选中字与分页，并跳转汉字信息页
    // 注意: 保留现有全部查询参数并以尾斜杠结尾，避免回退时触发
    // 无尾斜杠的 302 重定向（其 Location 不带查询串，导致参数丢失）
    openZi(c) {
      this.selected = c[0]
      this.syncUrl()
      location.href = `/zi/?v=${encodeURIComponent(c[0])}`
    },

    // 格子点击事件（事件委托）
    onCellClick(event) {
      const cell = event.target.closest('[data-zi]')
      if (!cell) return
      this.openZi({ 0: cell.dataset.zi })
    },

// 返回本页时高亮并滚动定位选中字（分页后所在页已恢复，滚动到该字）
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
  scrollToSelected: true,
  title: () => '拼音「<span class="text-blue-600" x-text="p"></span>」的汉字',
  emptyText: (p) => `未找到拼音「${p}」的汉字`,
  loadError: (p) => `拼音「${p}」数据加载失败`,
  loadingText: '正在加载汉字…',
  load: (p) => loadPinyinList(p)
}))
