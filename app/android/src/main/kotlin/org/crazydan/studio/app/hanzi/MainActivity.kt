package org.crazydan.studio.app.hanzi

import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.HanziDbFactory
import org.crazydan.studio.app.hanzi.ui.AppNavigator
import org.crazydan.studio.app.hanzi.ui.HanziApp
import org.crazydan.studio.app.hanzi.ui.InitLoadingScreen
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.ThemeStore
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * 汉字 App 主界面（Compose Multiplatform 原生 UI）
 *  - 数据库 assets/db/hanzi.db 首次启动复制到应用私有目录（assets 为压缩存储，
 *    无法直接以 sqlite 打开），之后复用
 *  - 通过内置库的 SHA-256 检测端侧已有库与内置库是否同源:
 *      同源 → 直接使用（索引已建）
 *      不同（首次安装 / App 更新携带新库）→ 覆盖复制，并创建拼音查询索引
 *    （索引在端侧创建而非打包时生成，避免增加安装包体积）
 *  - 数据库准备与索引创建在后台线程执行，期间显示初始化加载遮罩（避免白屏）
 */
class MainActivity : ComponentActivity() {

    private var activeDb: HanziDb? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Platform.init(this)
        // 窗口背景/状态栏与主题一致，消除启动与初始化期间的白屏闪烁
        val savedDark = ThemeStore.load() ?: isSystemDark()
        applyStartupTheme(savedDark)

        setContent {
            var ready by remember { mutableStateOf(false) }
            var db by remember { mutableStateOf<HanziDb?>(null) }

            // 后台准备数据库（复制/校验 + 索引创建），完成前显示加载遮罩
            LaunchedEffect(Unit) {
                val prepared = withContext(Dispatchers.IO) {
                    val file = prepareDb()
                    val hanziDb = HanziDbFactory.open(file.absolutePath)
                    // 幂等: 仅首次或库更新时创建拼音查询索引（见 HanziDb.ensurePinyinIndexes）
                    hanziDb.ensurePinyinIndexes()
                    hanziDb
                }
                activeDb = prepared
                db = prepared
                ready = true
            }

            val currentDb = db
            if (ready && currentDb != null) {
                val navigator = remember { AppNavigator() }
                // 返回键: 页面内返回；无上一页时退出
                BackHandler {
                    if (!navigator.back()) {
                        finish()
                    }
                }
                HanziApp(
                    db = currentDb,
                    navigator = navigator,
                    onExit = { finish() }
                )
            } else {
                InitLoadingScreen(darkTheme = savedDark)
            }
        }
    }

    // 启动窗口主题: 背景与状态栏颜色跟随已保存/系统主题（含加载遮罩期间）
    private fun applyStartupTheme(dark: Boolean) {
        val bg = if (dark) Color.parseColor("#111827") else Color.parseColor("#F9FAFB")   // gray-900 / gray-50
        window.setBackgroundDrawable(ColorDrawable(bg))
        window.statusBarColor = bg
        window.navigationBarColor = bg
        if (dark) {
            window.decorView.systemUiVisibility = 0
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
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
    }
}
