package org.crazydan.studio.app.hanzi.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream

/**
 * Android 平台能力实现
 */
actual object Platform {

    private var player: MediaPlayer? = null

    /** 文件选择器（复用同一 launcher，避免重复注册） */
    private var pickLauncher: androidx.activity.result.ActivityResultLauncher<Array<String>>? = null
    private var pickCallback: ((String?) -> Unit)? = null

    actual fun playPinyin(pinyin: String): Boolean {
        stopPinyin()
        val context = AppContextHolder.appContext ?: return false
        return try {
            val fd = context.assets.openFd("audio/pinyin/$pinyin.mp3")
            val p = MediaPlayer()
            try {
                p.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
                p.prepare()
            } finally {
                fd.close()   // prepare 完成后关闭（早于 prepare 关闭在部分设备会失败）
            }
            p.setOnCompletionListener { it.release() }
            p.setOnErrorListener { _, _, _ ->
                p.release()
                true
            }
            p.start()
            player = p
            true
        } catch (e: Exception) {
            false   // 音频文件不存在或播放失败
        }
    }

    actual fun stopPinyin() {
        player?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        player = null
    }

    actual fun copyToClipboard(text: String) {
        val context = AppContextHolder.appContext ?: return
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        cm.setPrimaryClip(ClipData.newPlainText("hanzi", text))
    }

    actual fun openUrl(url: String) {
        val context = AppContextHolder.appContext ?: return
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            // 无可用应用处理该链接，忽略
        }
    }

    actual fun loadAssetImage(assetPath: String): ImageBitmap? {
        val context = AppContextHolder.appContext ?: return null
        return try {
            context.assets.open(assetPath).use { stream ->
                BitmapFactory.decodeStream(stream)?.asImageBitmap()
            }
        } catch (e: Exception) {
            null
        }
    }

    actual fun shareImage(assetPath: String, title: String) {
        val context = AppContextHolder.appContext ?: return
        try {
            // 复制到应用缓存目录后经 FileProvider 分享（可保存到相册/发送给他人）
            val dir = File(context.cacheDir, "share").apply { mkdirs() }
            val fileName = assetPath.substringAfterLast('/')
            val file = File(dir, fileName)
            context.assets.open(assetPath).use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            }
            val uri = FileProvider.getUriForFile(
                context, "${context.packageName}.fileprovider", file
            )
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "image/*"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TITLE, title)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, title))
        } catch (e: Exception) {
            // 分享失败（如无可用应用），忽略
        }
    }

    actual fun isDebug(): Boolean {
        val context = AppContextHolder.appContext ?: return false
        return (context.applicationInfo.flags and
            android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    actual fun rasterZiBox(zi: String, fontSizePx: Float): FloatArray? {
        if (zi.isEmpty()) return null
        val context = AppContextHolder.appContext ?: return null
        return try {
            val typeface = android.graphics.Typeface.createFromAsset(
                context.assets, "fonts/ZhongYiKaiTi.ttf")
            val paint = android.graphics.Paint(
                android.graphics.Paint.ANTI_ALIAS_FLAG
            ).apply {
                this.typeface = typeface
                textSize = fontSizePx
                textAlign = android.graphics.Paint.Align.CENTER
            }
            val fm = paint.fontMetrics
            val size = (fontSizePx * 1.6f).toInt().coerceAtLeast(4)
            val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bmp)
            // 字形垂直居中: 基线 = 顶部留白 + ascent 高度（fm.ascent 为负值）
            val glyphHeight = fm.descent - fm.ascent
            val baseline = (size - glyphHeight) / 2f - fm.ascent
            canvas.drawText(zi, size / 2f, baseline, paint)

            // 扫描阈值: 丢弃 AA 淡边（alpha ≤ 8 视为透明），使盒贴合可见墨迹
            val px = IntArray(size * size)
            bmp.getPixels(px, 0, size, 0, 0, size, size)
            var minX = size; var minY = size; var maxX = -1; var maxY = -1
            for (y in 0 until size) {
                val row = y * size
                for (x in 0 until size) {
                    if (px[row + x].ushr(24) > 8) {
                        if (x < minX) minX = x
                        if (x > maxX) maxX = x
                        if (y < minY) minY = y
                        if (y > maxY) maxY = y
                    }
                }
            }
            bmp.recycle()
            if (maxX < 0) return null
            // 合理性上限: 墨迹盒超出字身 1.3 倍（回退字体/异常渲染的特征）→ 视为无效
            val w = maxX - minX
            val h = maxY - minY
            if (w > fontSizePx * 1.3f || h > fontSizePx * 1.3f) return null

            // 相对文本对齐点（水平左缘 + 基线）: 布局左缘 = 中心 - 文字宽/2
            val textLeft = size / 2f - paint.measureText(zi) / 2f
            return floatArrayOf(
                minX - textLeft,
                minY - baseline,
                maxX - textLeft,
                maxY - baseline
            )
        } catch (e: Exception) {
            null
        }
    }

    actual fun pickStrokeDb(onPicked: (String?) -> Unit) {
        // 文件选择器 launcher 须在生命周期 STARTED 前注册（由 MainActivity.onCreate 注册），
        // 此处仅发起选择
        val launcher = pickLauncher ?: run {
            onPicked(null)
            return
        }
        pickCallback = onPicked
        try {
            launcher.launch(arrayOf("application/octet-stream", "application/x-sqlite3", "*/*"))
        } catch (e: Exception) {
            pickCallback = null
            onPicked(null)
        }
    }

    /** 文件选择结果回调（MainActivity 的 launcher 回调，经此解析所选文件路径） */
    fun onStrokeDbPicked(uri: Uri?) {
        val cb = pickCallback
        pickCallback = null
        cb?.invoke(uri?.let { resolvePickedDb(it) })
    }

    // 解析用户选择的笔画数据库:
    //  1) 优先解析为真实文件路径（外部存储 provider 的 primary: 前缀），避免复制大文件
    //  2) 无法解析时复制到应用私有目录（content:// 源可稳定读取）
    private fun resolvePickedDb(uri: Uri): String? {
        val context = AppContextHolder.appContext ?: return null
        // 外部存储真实路径: /document/primary:Download/hanzi-stroke-1500.db → /storage/emulated/0/...
        val docPath = DocumentFile.fromSingleUri(context, uri)?.uri?.path
            ?.substringAfter("primary:", missingDelimiterValue = "")
        if (docPath != null && docPath.isNotEmpty()) {
            val real = File("/storage/emulated/0", docPath)
            if (real.isFile && real.canRead()) {
                return real.absolutePath
            }
        }
        // 兜底: 复制到 filesDir/db/hanzi_stroke.db（保持文件名稳定，幂等覆盖）
        return try {
            val dir = File(context.filesDir, "db").apply { mkdirs() }
            val dest = File(dir, "hanzi_stroke.db")
            val tmp = File(dir, "hanzi_stroke.db.tmp")
            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(tmp).use { output -> input.copyTo(output) }
            } ?: return null
            dest.delete()
            if (!tmp.renameTo(dest)) {
                tmp.copyTo(dest, overwrite = true)
                tmp.delete()
            }
            dest.absolutePath
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 应用上下文/宿主 Activity 与笔画数据库文件选择器注入
     * （MainActivity.onCreate 调用; 选择器 launcher 须在生命周期 STARTED 前注册）
     */
    fun init(activity: ComponentActivity, strokeDbPicker: ActivityResultLauncher<Array<String>>) {
        AppContextHolder.appActivity = activity
        AppContextHolder.appContext = activity
        pickLauncher = strokeDbPicker
    }
}
