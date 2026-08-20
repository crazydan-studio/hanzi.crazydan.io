// 页面顶部栏（返回 + 标题/副标题 + 主题切换）: 各功能页共用
// 用法:
//   <div x-data="pageHeader({ backUrl: '/', title: '常用字列表', mb: 'mb-4' })" x-html="html"></div>
//   opts:
//     backUrl:    返回链接（默认 '/'）；backClick 指定时改用按钮点击（如书写页 goBack）
//     backClick:  返回按钮的点击表达式（优先于 backUrl）
//     title:      标题文本（缺省不渲染）
//     titleHtml:  标题 HTML（优先于 title；动态部分用 x-text 绑定宿主作用域属性，
//                 如列表页计数 <span x-text="countText">）
//     subtitle:   副标题（与标题同组渲染）
//     wrap:       返回+标题组是否可换行（左半区独立成组，宽标题下不挤压）
//     size:       'lg' 大标题（笔画管理/书写页）
//     mb:         下边距类（默认 mb-4）
import Alpine from 'alpinejs'

Alpine.data('pageHeader', (opts = {}) => ({
  get html() {
    const back = opts.backClick
      ? `<button type="button" @click="${opts.backClick}" class="btn-sm">← 返回</button>`
      : `<a href="${opts.backUrl ?? '/'}" class="btn-sm">← 返回首页</a>`
    let title = ''
    if (opts.titleHtml || opts.title) {
      const titleCls = opts.size === 'lg' ? 'text-xl md:text-2xl' : 'text-lg md:text-xl'
      const titleText = opts.titleHtml ?? opts.title
      title = opts.subtitle
        ? `<div><h1 class="${titleCls} font-bold">${titleText}</h1>` +
          `<p class="text-xs text-gray-500 dark:text-gray-400">${opts.subtitle}</p></div>`
        : `<h1 class="${titleCls} font-bold">${titleText}</h1>`
    }
    const group = opts.wrap
      ? `<div class="flex items-center gap-3">${back}${title}</div>`
      : back + title
    const cls = `flex ${opts.wrap ? 'flex-wrap ' : ''}items-center justify-between gap-2 ${opts.mb ?? 'mb-4'}`
    return `<header class="${cls}">${group}` +
      `<button x-data="themeToggle()" @click="toggle()" class="icon-btn" :title="tip" x-html="icon"></button>` +
      `</header>`
  }
}))
