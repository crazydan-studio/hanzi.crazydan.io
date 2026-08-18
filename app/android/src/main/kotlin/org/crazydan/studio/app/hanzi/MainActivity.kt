package org.crazydan.studio.app.hanzi

import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.HanziDbFactory
import org.crazydan.studio.app.hanzi.ui.AppNavigator
import org.crazydan.studio.app.hanzi.ui.HanziApp
import org.crazydan.studio.app.hanzi.ui.InitNoticeScreen
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.SplashScreen
import org.crazydan.studio.app.hanzi.ui.ThemeStore
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * 汉字 App 主界面（Compose Multiplatform 原生 UI）
 * 启动流程:
 *   1. 立即显示开屏页（logo + 暗色背景，固定展示时间），同时后台检查/准备数据库
 *   2. 等待首页渲染完成（首帧绘制）后，开屏平滑淡出，首页不做淡入
 *   3. 数据库异常时显示初始化失败提示（正常流程由开屏覆盖等待期）
 *  - 数据库同源检测基于构建时记录的 SHA-256（见 build/app-db-pack.js）
 */
class MainActivity : ComponentActivity() {

    private var activeDb: HanziDb? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 笔画数据库文件选择器: 必须在生命周期 STARTED 前注册（onCreate 中注册，
        // 避免运行时注册抛 IllegalStateException），经 Platform 回调解析所选文件
        val strokeDbPicker = registerForActivityResult(
            androidx.activity.result.contract.ActivityResultContracts.OpenDocument()
        ) { uri ->
            Platform.onStrokeDbPicked(uri)
        }
        Platform.init(this, strokeDbPicker)
        // 主题（开屏淡出前加载完毕，首页直接应用）
        val savedDark = ThemeStore.load() ?: isSystemDark()
        // 开屏为暗色品牌页: 窗口背景先置为暗色
        applyStartupTheme(dark = true)

        setContent {
            var showSplash by remember { mutableStateOf(true) }
            var homeRendered by remember { mutableStateOf(false) }
            var db by remember { mutableStateOf<HanziDb?>(null) }
            var initFailed by remember { mutableStateOf(false) }

            LaunchedEffect(Unit) {
                // 后台准备数据库（同源检测/覆盖复制 + 索引创建，幂等）;
                // 笔画数据库为独立库（用户下载后指定位置），启动时按保存的路径配置
                val prep = async(Dispatchers.IO) {
                    val file = prepareDb()
                    val hanziDb = HanziDbFactory.open(file.absolutePath)
                    hanziDb.ensurePinyinIndexes()

                    hanziDb
                }

                // 开屏固定展示时间（短暂但稳定，保证主题已加载）
                delay(SPLASH_MIN_MS)
                // 数据库未就绪（原始库不一致，正在初始化）→ 先淡出开屏，
                // 初始化信息在开屏淡出后于首页区域显示（不在开屏中等待初始化结束）
                if (!prep.isCompleted) {
                    showSplash = false
                    delay(SPLASH_FADE_MS)
                    applyStartupTheme(savedDark)
                }

                val prepared = try {
                    prep.await()
                } catch (e: Exception) {
                    initFailed = true
                    null
                }
                activeDb = prepared
                db = prepared

                // 等待首页渲染完成（首页首帧绘制后 homeRendered 置位），
                // 随后开屏平滑淡出（首页不做淡入）；若开屏已提前淡出则跳过
                while (!homeRendered) {
                    withFrameNanos { }
                }
                withFrameNanos { }   // 再等一帧，确保首页首帧已绘制
                if (showSplash) {
                    showSplash = false
                    delay(SPLASH_FADE_MS)
                }
                // 过渡完成后应用当前主题的窗口背景/状态栏颜色
                applyStartupTheme(savedDark)
            }

            Box(modifier = Modifier.fillMaxSize()) {
                // 首页区域（在开屏之下直接渲染，不做淡入）
                val currentDb = db
                if (currentDb != null) {
                    AppContent(db = currentDb, onRendered = { homeRendered = true })
                } else if (initFailed) {
                    InitNoticeScreen(
                        darkTheme = savedDark,
                        notice = true,
                        message = "数据库初始化失败，请重启应用"
                    )
                } else if (!showSplash) {
                    // 开屏已提前淡出且数据库仍在初始化 → 在首页区域显示等待提示
                    InitNoticeScreen(darkTheme = savedDark, notice = true)
                }
                // 开屏页（仅 logo 与等待动画；首页渲染完成或初始化中提前淡出）
                AnimatedVisibility(
                    visible = showSplash,
                    exit = fadeOut(animationSpec = tween(SPLASH_FADE_MS.toInt()))
                ) {
                    SplashScreen()
                }
            }
        }
    }

    @Composable
    private fun AppContent(db: HanziDb, onRendered: () -> Unit) {
        val navigator = remember { AppNavigator() }
        // 返回键: 页面内返回；无上一页时退出
        BackHandler {
            if (!navigator.back()) {
                finish()
            }
        }
        HanziApp(
            db = db,
            navigator = navigator,
            onExit = { finish() },
            onRendered = onRendered
        )
    }

    // 窗口主题: 背景与状态栏颜色跟随已保存/系统主题
    private fun applyStartupTheme(dark: Boolean) {
        val bg = if (dark) Color.parseColor("#111827") else Color.parseColor("#F9FAFB")   // gray-900 / gray-50
        window.setBackgroundDrawable(ColorDrawable(bg))
        window.statusBarColor = bg
        window.navigationBarColor = bg
        window.decorView.systemUiVisibility =
            if (dark) 0 else View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }

    private fun isSystemDark(): Boolean =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    // 确保端侧数据库就绪: 与内置库不同源时覆盖复制（并记录内置库 hash）
    private fun prepareDb(): File {
        val dir = File(filesDir, "db")
        dir.mkdirs()
        val dest = File(dir, DB_NAME)

        // 读取构建时记录的库 hash（见 build/app-db-pack.js），避免每次启动计算 SHA-256
        val assetHash = readAssetDbHash() ?: sha256Asset("$DB_ASSET_DIR/$DB_NAME")
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        if (assetHash != null && assetHash == prefs.getString(PREF_DB_HASH, null)) {
            return dest   // 同源: 直接复用（索引已建）
        }

        // 不同源: 覆盖复制（临时文件 + 原子替换，避免半写文件）
        val tmp = File(dir, "$DB_NAME.tmp")
        assets.open("$DB_ASSET_DIR/$DB_NAME").use { input ->
            FileOutputStream(tmp).use { output -> input.copyTo(output) }
        }
        dest.delete()
        tmp.renameTo(dest)

        if (assetHash != null) {
            prefs.edit().putString(PREF_DB_HASH, assetHash).apply()
        }
        return dest
    }

    // 读取构建时记录的库 hash（assets/db/hanzi.db.sha256）
    private fun readAssetDbHash(): String? {
        return try {
            assets.open("$DB_ASSET_DIR/$DB_NAME.sha256").bufferedReader().use { it.readLine()?.trim() }
        } catch (e: Exception) {
            null
        }
    }

    // 内置库 SHA-256（流式计算，不加载全量到内存；hash 文件缺失时的兜底）
    private fun sha256Asset(assetPath: String): String? {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            assets.open(assetPath).use { input ->
                val buf = ByteArray(8192)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    digest.update(buf, 0, n)
                }
            }
            digest.digest().joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            null   // 计算失败时不记录 hash，下次启动重新检测
        }
    }

    override fun onDestroy() {
        activeDb?.close()
        activeDb = null
        super.onDestroy()
    }

    companion object {
        private const val DB_NAME = "hanzi.db"
        private const val DB_ASSET_DIR = "db"
        private const val PREFS_NAME = "hanzi_prefs"
        private const val PREF_DB_HASH = "hanzi_db_hash"

        /** 开屏页固定展示时间（毫秒） */
        private const val SPLASH_MIN_MS = 900L

        /** 开屏淡出/首页淡入时长（毫秒） */
        private const val SPLASH_FADE_MS = 300L
    }
}
