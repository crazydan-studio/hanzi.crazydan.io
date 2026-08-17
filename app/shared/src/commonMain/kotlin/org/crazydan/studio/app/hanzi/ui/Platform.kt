package org.crazydan.studio.app.hanzi.ui

import androidx.compose.ui.graphics.ImageBitmap

/**
 * 平台能力（Android 实现; iOS 预留）
 *  - 拼音读音试听（内置 assets/audio/pinyin/{拼音}.mp3，由 app-pack.sh 拷贝）
 *  - 剪贴板、外部链接打开
 *  - 内置资源图片加载（如赞助收款码，位于 assets/donate 目录，由 app-pack.sh 拷贝/下载）
 */
expect object Platform {

    /** 播放拼音读音; 音频文件不存在时返回 false */
    fun playPinyin(pinyin: String): Boolean

    /** 停止播放 */
    fun stopPinyin()

    /** 复制文本到剪贴板 */
    fun copyToClipboard(text: String)

    /** 用系统浏览器/应用打开外部链接 */
    fun openUrl(url: String)

    /** 加载内置资源图片（assets/{path}），加载失败返回 null */
    fun loadAssetImage(assetPath: String): ImageBitmap?

    /** 分享/保存内置资源图片（assets/{path}，经系统分享面板，可保存到相册等） */
    fun shareImage(assetPath: String, title: String)

    /** 当前是否为开发/调试构建（用于绘制墨迹盒边界等调试信息） */
    fun isDebug(): Boolean
}
