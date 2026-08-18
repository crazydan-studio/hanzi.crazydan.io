// ============ 拼音字列表页组件（pinyin/index.html） ============
// URL 参数路由: /pinyin/?v=<无声调拼音>，加载 public/assets/pinyin/{拼音}/meta.json
// 加载中 / 加载失败 / 无结果 / 结果: 互斥显示
// 选中字记录于 URL 参数 c（返回本页时高亮，不做定位滚动）
import Alpine from 'alpinejs'

Alpine.data('pinyinApp', () => ({
  p: '',
  list: [],
  loading: true,
  error: '',      // 加载失败提示
  empty: false,   // 无结果提示
  // 已选中字（URL 参数记录，返回本页时高亮）
  selected: '',

  async init() {
    this.p = (new URLSearchParams(location.search).get('v') || '').trim().toLowerCase()
    this.selected = (new URLSearchParams(location.search).get('c') || '').trim()
    if (!this.p) {
      this.error = '缺少拼音参数'
      this.loading = false
      return
    }
    try {
      const res = await fetch(`/assets/pinyin/${encodeURIComponent(this.p)}/meta.json`)
      if (!res.ok) {
        // 文件不存在（404）→ 无该拼音的汉字
        this.empty = true
        return
      }
      const list = await res.json()
      this.list = list || []
      if (this.list.length === 0) this.empty = true
    } catch {
      this.error = `拼音「${this.p}」数据加载失败`
    } finally {
      this.loading = false
      this.$nextTick(() => this.highlightSelected())
    }
  },

  // 点击汉字: 就地更新 url 参数记录选中字（返回本页时据此高亮），并跳转汉字信息页
  openZi(c) {
    history.replaceState(null, '', `/pinyin/?v=${encodeURIComponent(this.p)}&c=${encodeURIComponent(c[0])}`)
    location.href = `/zi/?v=${encodeURIComponent(c[0])}`
  },

  // 格子点击事件（事件委托）
  onCellClick(event) {
    const cell = event.target.closest('[data-zi]')
    if (!cell) return
    this.openZi({ 0: cell.dataset.zi })
  },

  // 返回本页时高亮已选中字（仅高亮，不做定位滚动）
  highlightSelected() {
    if (!this.selected) return
    const cell = this.$root.querySelector(`[data-zi="${CSS.escape(this.selected)}"]`)
    if (cell) cell.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50', 'dark:bg-gray-700')
  }
}))
