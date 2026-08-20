// 列表加载中悬浮层（列表区域上层，文案可定制）: 各列表页共用
// 用法: <div x-show="loading" x-data="loadingOverlay('正在加载…')" class="loading-overlay" x-html="html"></div>
import Alpine from 'alpinejs'

Alpine.data('loadingOverlay', (text = '正在加载…') => ({
  get html() {
    return `<span class="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">` +
      `<span class="spinner"></span>${text}</span>`
  }
}))
