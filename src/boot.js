// 页面引导（各页面入口模块副作用导入，随共享 chunk 执行）:
// 字体加载遮罩: 统一加载自带静态中易楷体（不使用系统字体），加载期间遮住页面
// 并提示；失败时隐藏遮罩（各田字格显示自身的失败/等待状态，不做兜底）
// （主题初始化由 vite 插件注入的内联脚本在 head 阻塞执行，避免刷新跳闪）
(function () {
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
    if (!document.fonts || !document.fonts.load) { hideOverlay(); return }
    // 页面加载期间阻塞渲染背景字/笔画；加载失败也隐藏遮罩（页面内田字格显示失败状态）
    document.fonts.load('300px "ZhongYiKaiTi"')
      .then(hideOverlay)
      .catch(hideOverlay)
  }

  if (document.body) { addOverlay(); initFontLoading() }
  else {
    document.addEventListener('DOMContentLoaded', function () {
      addOverlay()
      initFontLoading()
    })
  }
})()
