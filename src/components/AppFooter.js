// 站点页脚（各页面共用）: 外部链接与版权声明
import Alpine from 'alpinejs'
import { KUAII_IME_URL, ZDIC_URL, STUDIO_URL } from '../config.js'

const FOOTER_HTML = [
  '<div class="mx-auto max-w-4xl px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">',
  '  <div class="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">',
  `    <a href="${KUAII_IME_URL}" target="_blank" rel="noopener" class="hover:text-gray-600 dark:hover:text-gray-300">筷字输入法</a>`,
  `    <a href="${ZDIC_URL}" target="_blank" rel="noopener" class="hover:text-gray-600 dark:hover:text-gray-300">汉典网</a>`,
  '  </div>',
  '  <p>本站点内容版权归',
  `    <a href="${STUDIO_URL}" target="_blank" rel="noopener" class="hover:text-gray-600 dark:hover:text-gray-300">Crazydan Studio</a>`,
  '    所有</p>',
  '</div>'
].join('')

Alpine.data('appFooter', () => ({
  get html() {
    return FOOTER_HTML
  }
}))
