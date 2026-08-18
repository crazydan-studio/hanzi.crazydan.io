// 浮动按钮（本地开发模式入口，首页/汉字信息页共用）: 铅笔图标 + 文案
// 用法:
//   <a x-data="fabButton({ label: '笔画管理' })" x-show="devButton" href="/strokes/"
//      x-cloak class="fab" x-html="html"></a>
// 展示条件与跳转行为由页面在宿主元素上配置（x-show/:href/@click）
import Alpine from 'alpinejs'

const PENCIL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>'

Alpine.data('fabButton', (opts = {}) => ({
  get html() {
    return PENCIL_ICON + (opts.label ?? '')
  }
}))
