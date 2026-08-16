package org.crazydan.studio.app.hanzi.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.content.FileProvider
import java.io.File

/**
 * Android 平台能力实现
 */
actual object Platform {

    private var player: MediaPlayer? = null

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

    /** 应用上下文注入（MainActivity 初始化时调用） */
    fun init(context: android.content.Context) {
        AppContextHolder.appContext = context
    }
}
