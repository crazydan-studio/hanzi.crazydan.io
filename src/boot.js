// 页面引导（各页面入口模块副作用导入，随共享 chunk 执行）:
// 全局加载遮罩: 页面隐藏于遮罩之下，等待自带中易楷体加载完毕后统一显示，
// 再执行数据加载与田字格渲染（避免页面闪现部分内容/字体切换抖动）；
// 加载信息仅提示「页面加载中」；字体加载失败也放行（页面内田字格不做字体兜底，
// 由各页面显示各自的失败提示）
// （主题初始化由 vite 插件注入的内联脚本在 head 阻塞执行，避免刷新跳闪）
(function () {
  function addOverlay() {
    const el = document.createElement('div')
    el.id = 'font-loading-overlay'
    el.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900'
    el.innerHTML =
      '<span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"></span>' +
      '<span class="text-sm text-gray-600 dark:text-gray-300">页面加载中</span>'
    document.body.appendChild(el)
  }

  function hideOverlay() {
    const el = document.getElementById('font-loading-overlay')
    if (el) el.remove()
  }

  function initFontLoading() {
    if (!document.fonts || !document.fonts.load) { hideOverlay(); return }
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
