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
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
 *   2. 开屏淡出后淡入首页:
 *      - 内置库与端侧一致（已复制）→ 无任何初始化提示
 *      - 不一致（首次安装/App 更新）→ 提示等待数据库初始化，就绪后消失
 *  - 数据库同源检测基于构建时记录的 SHA-256（见 build/app-db-pack.js）
 */
class MainActivity : ComponentActivity() {

    private var activeDb: HanziDb? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Platform.init(this)
        // 主题（开屏淡出前加载完毕，首页直接应用）
        val savedDark = ThemeStore.load() ?: isSystemDark()
        // 开屏为暗色品牌页: 窗口背景先置为暗色
        applyStartupTheme(dark = true)

        setContent {
            var showSplash by remember { mutableStateOf(true) }
            var showApp by remember { mutableStateOf(false) }
            var initNotice by remember { mutableStateOf(false) }
            var db by remember { mutableStateOf<HanziDb?>(null) }

            LaunchedEffect(Unit) {
                // 后台准备数据库（同源检测/覆盖复制 + 索引创建，幂等）
                val prep = async(Dispatchers.IO) {
                    val file = prepareDb()
                    val hanziDb = HanziDbFactory.open(file.absolutePath)
                    hanziDb.ensurePinyinIndexes()
                    hanziDb
                }

                // 开屏固定展示时间（短暂但稳定，保证主题已加载）
                delay(SPLASH_MIN_MS)
                // 数据库未就绪（原始库不一致，正在初始化）→ 提示等待
                initNotice = !prep.isCompleted
                // 开屏淡出与首页淡入同时进行（交叠透明渐变），
                // 窗口背景在过渡期间保持开屏暗色，避免切换过程透出白屏
                showSplash = false
                showApp = true
                delay(SPLASH_FADE_MS)
                // 过渡完成后应用当前主题的窗口背景/状态栏颜色
                applyStartupTheme(savedDark)
                // 等待数据库就绪（一致时立即返回）
                val prepared = prep.await()
                activeDb = prepared
                db = prepared
                initNotice = false
            }

            Box(modifier = Modifier.fillMaxSize()) {
                // 首页（淡入）
                AnimatedVisibility(
                    visible = showApp,
                    enter = fadeIn(animationSpec = tween(SPLASH_FADE_MS.toInt()))
                ) {
                    val currentDb = db
                    if (currentDb != null) {
                        AppContent(db = currentDb)
                    } else {
                        InitNoticeScreen(darkTheme = savedDark, notice = initNotice)
                    }
                }
                // 开屏页（淡出）
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
    private fun AppContent(db: HanziDb) {
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
            onExit = { finish() }
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
