// ============ 首页组件（index.html） ============
// 功能: 汉字/拼音查询（URL 参数路由）+ 常用字速览
import Alpine from 'alpinejs'
import { loadCommons } from '@services/data.js'

Alpine.data('homeApp', () => ({
  commons: [],
  commonsLoading: true,
  query: '',
  error: '',
  // 本地开发模式下显示「笔画管理」浮动入口
  devButton: import.meta.env.DEV,

  init() {
    loadCommons()
      .then((list) => {
        // 常用字速览: 按权重显示前 20 个常用汉字
        this.commons = (list || []).slice(0, 20)
      })
      .catch(() => {
        this.error = '常用字数据加载失败'
      })
      .finally(() => {
        this.commonsLoading = false
      })
  },

  // 查询: 单个汉字 → 汉字信息页 /char/?v=
  //       纯拼音（不带声调，允许 ü）→ 拼音字列表页 /pinyin/?v=
  search() {
    const q = this.query.trim()
    if (!q) return
    if (/^[\u4e00-\u9fff]$/.test(q)) {
      location.href = `/char/?v=${encodeURIComponent(q)}`
    } else if (/^[a-z\u00fc]+$/i.test(q)) {
      location.href = `/pinyin/?v=${q.toLowerCase()}`
    } else {
      this.error = '请输入单个汉字或纯拼音（不带声调）'
    }
  }
}))
