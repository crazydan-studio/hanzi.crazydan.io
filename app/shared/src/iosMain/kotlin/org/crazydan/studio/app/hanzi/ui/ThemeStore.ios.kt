package org.crazydan.studio.app.hanzi.ui

/**
 * iOS 预留: 暂不实现（待 iOS 版本开发时实现，见 androidMain 对应实现）。
 */
actual object ThemeStore {
    actual fun load(): Boolean? = null
    actual fun save(dark: Boolean) {}
}
