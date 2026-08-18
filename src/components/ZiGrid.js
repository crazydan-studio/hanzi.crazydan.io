// 汉字格子（常用字速览 / 拼音字列表共用）:
// 读音在汉字上方，大号楷体汉字 + 读音；点击跳转到汉字信息页
// 数据为数组格式 [汉字, 读音]（降低 json 文件大小）
// 格子由组件统一渲染（x-html + 事件委托），避免页面间重复模板
import Alpine from 'alpinejs'
import { numberToSymbolTonePinyin } from '@services/pinyin.js'

const CELL_CLASS = 'flex flex-col items-center gap-0.5 py-2 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer dark:hover:bg-gray-700 dark:hover:border-blue-500'

Alpine.data('ziGrid', (zis = []) => ({
  zis: zis || [],

  setZis(list) {
    this.zis = list || []
  },

  get gridHtml() {
    return this.zis.map(c =>
      `<button type="button" data-zi="${c[0]}" class="${CELL_CLASS}">` +
        `<span class="text-xs text-gray-400 font-pinyin dark:text-gray-400">${numberToSymbolTonePinyin(c[1])}</span>` +
        `<span class="text-3xl font-kaiti leading-none">${c[0]}</span>` +
      `</button>`).join('')
  },

  // 点击格子 → 汉字信息页（事件委托: /zi/?v=）
  onGridClick(event) {
    const btn = event.target.closest('[data-zi]')
    if (!btn) return
    location.href = `/zi/?v=${encodeURIComponent(btn.dataset.zi)}`
  }
}))
