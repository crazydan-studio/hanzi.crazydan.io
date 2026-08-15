// 站点页脚（各页面共用）: 外部链接与版权声明
import Alpine from 'alpinejs'

const FOOTER_HTML = [
  '<div class="mx-auto max-w-4xl px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">',
  '  <div class="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">',
  '    <a href="https://github.com/crazydan-studio/kuaizi-ime" target="_blank" rel="noopener" class="hover:text-gray-600 dark:hover:text-gray-300">筷子输入法</a>',
  '    <a href="https://zdic.net/" target="_blank" rel="noopener" class="hover:text-gray-600 dark:hover:text-gray-300">汉典网</a>',
  '  </div>',
  '  <p>本网站内容版权归',
  '    <a href="https://studio.crazydan.org/" target="_blank" rel="noopener" class="hover:text-gray-600 dark:hover:text-gray-300">Crazydan Studio</a>',
  '    所有</p>',
  '</div>'
].join('')

Alpine.data('appFooter', () => ({
  get html() {
    return FOOTER_HTML
  }
}))
