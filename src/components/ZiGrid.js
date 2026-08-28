// 汉字格子（常用字速览 / 拼音字列表共用）:
// 读音在汉字上方，大号楷体汉字 + 读音；点击跳转到汉字信息页
// 数据为数组格式 [汉字, 读音]（降低 json 文件大小）
// 格子由组件统一渲染（x-html + 事件委托），避免页面间重复模板
import Alpine from 'alpinejs'
import { numberToSymbolTonePinyin } from '@services/pinyin.js'

const CELL_CLASS = 'flex flex-col items-center gap-0.5 py-2 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer dark:hover:bg-gray-700 dark:hover:border-blue-500'

// 繁体角标（配色醒目: 琥珀底 + 深色字; 浮动于汉字矩形容器右上角，
// 矩形容器 = 汉字 + 左右 padding，汉字在框内水平居中，角标悬在框角不遮汉字）
const TRAD_BADGE = '<span class="absolute -top-1.5 -right-1.5 text-[10px] leading-none font-bold text-amber-700 bg-amber-200 rounded px-1 py-0.5 dark:text-amber-100 dark:bg-amber-600">繁</span>'

// 拼接 HTML 前的字符转义（数据来自静态 JSON，防御性处理）
function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]))
}

Alpine.data('ziGrid', (zis = []) => ({
  zis: zis || [],

  setZis(list) {
    this.zis = list || []
  },

  // 繁体字: 列表条目第 3 元素为 1（[汉字, 读音, 1]，简体无该元素）
  isTraditional(c) {
    return c[2] === 1
  },

  get gridHtml() {
    return this.zis.map(c => {
      const trad = this.isTraditional(c)
      // 汉字置于矩形容器（汉字宽度 + 左右 padding）内水平居中，
      // 繁体角标浮动于容器右上角（悬出框角，不遮汉字）
      return `<button type="button" data-zi="${escapeHtml(c[0])}" class="${CELL_CLASS}">` +
        `<span class="text-xs text-gray-400 font-pinyin dark:text-gray-400">${escapeHtml(numberToSymbolTonePinyin(c[1]))}</span>` +
        `<span class="relative inline-block px-2 text-3xl font-kaiti leading-none">${escapeHtml(c[0])}${trad ? TRAD_BADGE : ''}</span>` +
      `</button>`
    }).join('')
  },

  // 点击格子 → 汉字信息页（事件委托: /zi/?v=）
  onGridClick(event) {
    const btn = event.target.closest('[data-zi]')
    if (!btn) return
    location.href = `/zi/?v=${encodeURIComponent(btn.dataset.zi)}`
  }
}))
