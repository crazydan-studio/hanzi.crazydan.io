// ============ 常用字列表页组件（commons/index.html） ============
// 加载 public/assets/zi/commons.json（按权重排序的全部常用字）
// 点击汉字: 就地更新当前 url 参数（?v= 指示选中的汉字）并跳转汉字信息页；
// 页面加载时按该参数自动滚动到选中汉字所在位置
import Alpine from 'alpinejs'
import { loadCommons } from '@services/data.js'

Alpine.data('commonsApp', () => ({
  list: [],
  loading: true,
  error: '',
  empty: false,
  selected: '',

  init() {
    this.selected = (new URLSearchParams(location.search).get('v') || '').trim()
    loadCommons()
      .then((list) => {
        this.list = list || []
        if (this.list.length === 0) this.empty = true
      })
      .catch(() => {
        this.error = '常用字数据加载失败'
      })
      .finally(() => {
        this.loading = false
        this.$nextTick(() => this.scrollToSelected())
      })
  },

  // 点击汉字: 就地修改 url 参数指示选中汉字（返回本页时据此定位），并跳转汉字信息页
  openZi(c) {
    history.replaceState(null, '', `/commons/?v=${encodeURIComponent(c[0])}`)
    location.href = `/zi/?v=${encodeURIComponent(c[0])}`
  },

  // 格子点击事件（事件委托）: 取 data-zi 后按选中逻辑处理
  onCellClick(event) {
    const cell = event.target.closest('[data-zi]')
    if (!cell) return
    this.openZi({ 0: cell.dataset.zi })
  },

  // 加载时按 url 参数滚动到选中汉字所在位置并高亮
  scrollToSelected() {
    if (!this.selected) return
    const cell = this.$root.querySelector(`[data-zi="${CSS.escape(this.selected)}"]`)
    if (!cell) return
    cell.scrollIntoView({ block: 'center' })
    cell.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50', 'dark:bg-gray-700')
  }
}))
