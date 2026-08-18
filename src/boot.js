// 页面引导（各页面入口模块副作用导入，随共享 chunk 执行）:
// 整页加载遮罩（参考 jingwei 的 loading 方案）:
//   - html 恒带 boot-loading 样式（内嵌于各页面 head），从页面渲染开始即由
//     遮罩遮挡（页面内容 opacity 0），消除字体加载延迟造成的页面抖动
//   - 遮罩仅显示加载动画（不显示文字）；等待自带中易楷体加载完毕后放行
//     （内容淡入、遮罩淡出，CSS transition 见页面内联样式），动画结束移除遮罩
//   - 字体加载失败也放行（页面内田字格显示各自的失败提示，不做字体兜底）
// （主题初始化由 vite 插件注入的内联脚本在 head 阻塞执行，避免刷新跳闪）
import { KAI_FONT_FAMILY, KAI_FONT_SIZE } from './config.js'

const FONT_LOAD_SPEC = `${KAI_FONT_SIZE}px ${KAI_FONT_FAMILY}`

(function () {
  function addOverlay() {
    const el = document.createElement('div')
    el.id = 'boot-overlay'
    el.innerHTML = '<span class="boot-spinner"></span>'
    document.body.appendChild(el)
    return el
  }

  function finishLoading(el) {
    if (!el || el.dataset.done) return
    el.dataset.done = '1'
    // 内容淡入 + 遮罩淡出（内联 CSS transition），动画结束后移除遮罩节点
    document.documentElement.classList.add('boot-done')
    setTimeout(() => el.remove(), 1000)
  }

  function initFontLoading(el) {
    if (!document.fonts || !document.fonts.load) { finishLoading(el); return }
    document.fonts.load(FONT_LOAD_SPEC)
      .then(() => finishLoading(el))
      .catch(() => finishLoading(el))
  }

  // 兜底: 页面 HTML 未带 boot-loading 类（如旧缓存）时补加，保证遮罩生效
  document.documentElement.classList.add('boot-loading')
  if (document.body) {
    initFontLoading(addOverlay())
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      initFontLoading(addOverlay())
    })
  }
})()
