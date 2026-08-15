// ============ 拼音字列表页组件（pinyin/index.html） ============
// URL 参数路由: /pinyin/?v=<无声调拼音>，加载 public/assets/pinyin/{拼音}/meta.json
import Alpine from 'alpinejs'
import { loadPinyinList } from '@services/data.js'

Alpine.data('pinyinApp', () => ({
  p: '',
  list: [],
  loading: true,
  error: '',

  init() {
    this.p = (new URLSearchParams(location.search).get('v') || '').trim().toLowerCase()
    if (!this.p) {
      this.error = '缺少拼音参数'
      this.loading = false
      return
    }
    loadPinyinList(this.p)
      .then((list) => {
        this.list = list || []
        if (this.list.length === 0) this.error = `未找到拼音「${this.p}」的汉字`
      })
      .catch(() => {
        this.error = `未找到拼音「${this.p}」的汉字`
      })
      .finally(() => {
        this.loading = false
      })
  }
}))
