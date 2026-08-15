// 页面引导（head 内同步加载的经典脚本）:
// 1. 主题初始化: 存储值优先，否则跟随系统（防止暗黑主题闪烁）
// 2. 字体加载遮罩: 系统无 SimKai 时加载静态楷体资源，加载期间遮住页面并提示
(function () {
  try {
    var saved = localStorage.getItem('hanzi:theme')
    if (saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark')
    }
  } catch (e) { /* 存储不可用时忽略 */ }

  function hasSimKai() {
    try { return !!document.fonts && document.fonts.check('100px "SimKai"') } catch (e) { return false }
  }

  function addOverlay() {
    var el = document.createElement('div')
    el.id = 'font-loading-overlay'
    el.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900'
    el.innerHTML =
      '<span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"></span>' +
      '<span class="text-sm text-gray-600 dark:text-gray-300">正在加载中易楷体…</span>'
    document.body.appendChild(el)
  }

  function hideOverlay() {
    var el = document.getElementById('font-loading-overlay')
    if (el) el.remove()
  }

  function initFontLoading() {
    if (!document.fonts || !document.fonts.load || hasSimKai()) { hideOverlay(); return }
    var timer = setTimeout(hideOverlay, 6000)
    document.fonts.load('300px "ZhongYiKaiTi"')
      .then(function () { clearTimeout(timer); hideOverlay() })
      .catch(function () { clearTimeout(timer); hideOverlay() })
  }

  if (document.body) { addOverlay(); initFontLoading() }
  else {
    document.addEventListener('DOMContentLoaded', function () {
      addOverlay()
      initFontLoading()
    })
  }
})()
