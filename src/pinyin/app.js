// ============ 拼音字列表页组件（pinyin/index.html） ============
// URL 参数路由: /pinyin/?v=<无声调拼音>，加载 public/assets/pinyin/{拼音}/meta.json
// 加载中 / 加载失败 / 无结果 / 结果: 互斥显示
import Alpine from 'alpinejs'

Alpine.data('pinyinApp', () => ({
  p: '',
  list: [],
  loading: true,
  error: '',      // 加载失败提示
  empty: false,   // 无结果提示

  async init() {
    this.p = (new URLSearchParams(location.search).get('v') || '').trim().toLowerCase()
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
    }
  }
}))
