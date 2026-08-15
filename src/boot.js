// 页面引导（各页面入口模块副作用导入，随共享 chunk 执行）:
// 字体加载遮罩: 系统无 SimKai 时加载静态楷体资源，加载期间遮住页面并提示
// （主题初始化由 vite 插件注入的内联脚本在 head 阻塞执行，避免刷新跳闪）
(function () {
  function hasSimKai() {
    try { return !!document.fonts && document.fonts.check('100px "SimKai"') } catch (e) { return false }
  }

  function addOverlay() {
    const el = document.createElement('div')
    el.id = 'font-loading-overlay'
    el.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900'
    el.innerHTML =
      '<span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"></span>' +
      '<span class="text-sm text-gray-600 dark:text-gray-300">正在加载中易楷体…</span>'
    document.body.appendChild(el)
  }

  function hideOverlay() {
    const el = document.getElementById('font-loading-overlay')
    if (el) el.remove()
  }

  function initFontLoading() {
    if (!document.fonts || !document.fonts.load || hasSimKai()) { hideOverlay(); return }
    const timer = setTimeout(hideOverlay, 6000)
    document.fonts.load('300px "ZhongYiKaiTi"')
      .then(() => { clearTimeout(timer); hideOverlay() })
      .catch(() => { clearTimeout(timer); hideOverlay() })
  }

  if (document.body) { addOverlay(); initFontLoading() }
  else {
    document.addEventListener('DOMContentLoaded', function () {
      addOverlay()
      initFontLoading()
    })
  }
})()
