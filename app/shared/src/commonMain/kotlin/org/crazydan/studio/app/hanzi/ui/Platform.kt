package org.crazydan.studio.app.hanzi.ui

import androidx.compose.ui.graphics.ImageBitmap

/**
 * 平台能力（Android 实现，见 androidMain/Platform.android.kt）
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

    /**
     * 光栅实测墨迹盒（汉字笔画书写坐标系的基准）: 以指定字号渲染字符后
     * 扫描实际像素（alpha>0），返回相对文本对齐点（水平左缘 + 基线）的
     * [左, 上, 右, 下] 像素坐标；度量失败/不可用时返回 null。
     * 假定字体始终包含该字，不提供回退
     */
    fun rasterZiBox(zi: String, fontSizePx: Float): FloatArray?

    /**
     * 选择笔画数据库文件（系统文件选择器）:
     * 优先解析为可直接打开的真实文件路径（避免复制大文件）；
     * 无法解析时复制到应用私有目录。回调返回可用路径或 null（取消/无效）
     */
    fun pickStrokeDb(onPicked: (path: String?) -> Unit)

    /** 当前构建是否为可联网变体（纯净版为 false; 用于检查更新/在线下载笔画数据） */
    fun isOnlineVariant(): Boolean

    /** 当前 App 版本号（构建 versionName，MainActivity 经 Platform.init 注入） */
    fun appVersion(): String

    /**
     * 下载 URL 到应用私有下载目录（流式写入）:
     * 成功返回文件绝对路径；失败返回具体原因
     */
    fun downloadToFile(url: String, destFileName: String): DownloadResult

    /** 删除下载的文件（导入/安装完成后清理临时文件） */
    fun deleteDownloadedFile(path: String)

    /** 获取 URL 文本内容（更新版本信息检查），失败返回 null */
    fun fetchText(url: String): String?

    /** 计算文件 SHA-256（十六进制小写；用于安装包完整性校验），失败返回 null */
    fun sha256Hex(path: String): String?

    /** 触发系统安装 APK（经 FileProvider；用户需在系统安装界面确认），失败返回 false */
    fun installApk(apkPath: String): Boolean
}

/** 下载结果（成功携带文件路径；失败携带具体原因） */
sealed interface DownloadResult {
    data class Success(val path: String) : DownloadResult
    data class Failure(val reason: String) : DownloadResult
}
