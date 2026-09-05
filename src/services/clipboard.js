// ============ 剪贴板复制（含非安全上下文回退） ============
// navigator.clipboard 仅在安全上下文可用（localhost/https），
// 不可用时回退到临时 textarea + execCommand 方案
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* 降级到回退方案 */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

// 复制成功提示（「已复制」闪烁）: 各页面组件共用字段与方法——
// 用法: Alpine.data('x', () => ({ ...copyFlashMixin(), ... }))，
// 模板: x-text="copiedValue === v ? '已复制' : '复制'"，点击时调用 copy(value)
export function copyFlashMixin() {
  return {
    copiedValue: null,   // 最近复制成功的值（用于「已复制」反馈）
    _copyTimer: null,
    async copy(value) {
      const ok = await copyText(value)
      if (ok) {
        this.copiedValue = String(value)
        clearTimeout(this._copyTimer)
        this._copyTimer = setTimeout(() => { this.copiedValue = null }, 1500)
      }
    }
  }
}
