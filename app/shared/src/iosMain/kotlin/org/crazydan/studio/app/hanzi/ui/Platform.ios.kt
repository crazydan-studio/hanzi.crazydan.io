package org.crazydan.studio.app.hanzi.ui

/**
 * iOS 预留: 暂不实现（待 iOS 版本开发时实现，见 androidMain 对应实现）。
 */
actual object Platform {
    actual fun playPinyin(pinyin: String): Boolean = error("Platform: iOS 暂未实现")
    actual fun stopPinyin() {}
    actual fun copyToClipboard(text: String) {}
    actual fun openUrl(url: String) {}
    actual fun loadAssetImage(assetPath: String): ImageBitmap? = error("Platform: iOS 暂未实现")
}
