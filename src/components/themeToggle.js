// ============ 暗黑/明亮主题（class 策略，存储优先，否则跟随系统） ============
import Alpine from 'alpinejs'

const THEME_KEY = 'hanzi:theme'
// 主题变化事件（canvas 背景等据此重绘以适配主题色）
export const THEME_CHANGE_EVENT = 'hanzi:theme-change'

export function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  } catch { /* 存储不可用时忽略 */ }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
}

// 初始主题（页面 head 内联脚本已先行应用，此处供 JS 侧读取）
export function currentDark() {
  return document.documentElement.classList.contains('dark')
}

// 主题切换按钮组件
Alpine.data('themeToggle', () => ({
  dark: false,

  init() {
    this.dark = currentDark()
  },

  toggle() {
    this.dark = !this.dark
    applyTheme(this.dark)
  }
}))
