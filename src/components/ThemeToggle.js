// ============ 暗黑/明亮主题（class 策略，存储优先，否则跟随系统） ============
import Alpine from 'alpinejs'
import { THEME_KEY } from '../config.js'

export const THEME_CHANGE_EVENT = 'hanzi:theme-change'

// 主题图标（图标形式切换按钮，避免各页面重复内联 SVG）
// 明亮下显示月亮（点击切暗黑），暗黑下显示太阳（点击切明亮）
const MOON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
const SUN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'

export function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  } catch { /* 存储不可用时忽略 */ }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
}

export function currentDark() {
  return document.documentElement.classList.contains('dark')
}

// 主题切换按钮组件（图标形式）: 页面仅需一行 <button x-data="themeToggle()" ...>
Alpine.data('themeToggle', () => ({
  dark: false,

  init() {
    this.dark = currentDark()
  },

  get icon() {
    return this.dark ? SUN_ICON : MOON_ICON
  },

  get tip() {
    return this.dark ? '切换到明亮' : '切换到暗黑'
  },

  toggle() {
    this.dark = !this.dark
    applyTheme(this.dark)
  }
}))
