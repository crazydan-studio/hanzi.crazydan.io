// 汉字格子（常用字速览 / 拼音字列表共用）:
// 读音在汉字上方，大号楷体汉字 + 读音；点击跳转到汉字信息页
// 数据为数组格式 [汉字, 读音]（降低 json 文件大小）
import Alpine from 'alpinejs'

Alpine.data('charGrid', (chars = []) => ({
  chars: chars || [],

  setChars(list) {
    this.chars = list || []
  },

  // 跳转汉字信息页（URL 参数路由: /char/?v=）
  openChar(c) {
    location.href = `/char/?v=${encodeURIComponent(c[0])}`
  }
}))
