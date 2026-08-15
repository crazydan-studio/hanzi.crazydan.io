// ============ 会话存储工具 ============

export const BACK_URL_KEY = 'hanzi:backUrl'

// 记录当前页面地址（供书写页「返回」按钮回到进入前的页面）
export function setBackUrl() {
  sessionStorage.setItem(BACK_URL_KEY, window.location.href)
}

// 取出并清除返回地址（书写页返回时使用）
export function takeBackUrl() {
  const url = sessionStorage.getItem(BACK_URL_KEY)
  sessionStorage.removeItem(BACK_URL_KEY)
  return url
}
