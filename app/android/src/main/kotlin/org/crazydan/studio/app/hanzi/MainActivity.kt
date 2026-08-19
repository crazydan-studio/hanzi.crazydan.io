package org.crazydan.studio.app.hanzi

import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.HanziDbFactory
import org.crazydan.studio.app.hanzi.ui.AppContextHolder
import org.crazydan.studio.app.hanzi.ui.AppNavigator
import org.crazydan.studio.app.hanzi.ui.HanziApp
import org.crazydan.studio.app.hanzi.ui.HanziTheme
import org.crazydan.studio.app.hanzi.ui.InitNoticeScreen
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.SiteLinks
import org.crazydan.studio.app.hanzi.ui.SplashScreen
import org.crazydan.studio.app.hanzi.ui.ThemeStore
import org.crazydan.studio.app.hanzi.ui.components.FullscreenWait
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
        Platform.init(this, strokeDbPicker, BuildConfig.ONLINE_VARIANT)
        // 主题（开屏淡出前加载完毕，首页直接应用）
        val savedDark = ThemeStore.load() ?: isSystemDark()
        // 开屏为暗色品牌页: 窗口背景先置为暗色
        applyStartupTheme(dark = true)

        setContent {
            var showSplash by remember { mutableStateOf(true) }
            var homeRendered by remember { mutableStateOf(false) }
            var db by remember { mutableStateOf<HanziDb?>(null) }
            var initFailed by remember { mutableStateOf(false) }
            val scope = rememberCoroutineScope()

            LaunchedEffect(Unit) {
                // 后台准备数据库（同源检测/覆盖复制 + 索引创建，幂等）;
                // 笔画数据库为独立库（用户导入到固定位置），启动时按状态检查
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
                // 随后开屏平滑淡出（首页不做淡入）；初始化失败时直接放行
                // （失败提示经 InitNoticeScreen 显示，避免等待永不到来的首帧）
                while (!homeRendered && !initFailed) {
                    withFrameNanos { }
                }
                if (!initFailed) {
                    withFrameNanos { }   // 再等一帧，确保首页首帧已绘制
                }
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
                        message = "数据库初始化失败，请重启应用"
                    )
                } else if (!showSplash) {
                    // 开屏已提前淡出且数据库仍在初始化 → 在首页区域显示等待提示
                    InitNoticeScreen(darkTheme = savedDark)
                }
                // 开屏页（仅 logo 与等待动画；首页渲染完成或初始化中提前淡出）
                AnimatedVisibility(
                    visible = showSplash,
                    exit = fadeOut(animationSpec = tween(SPLASH_FADE_MS.toInt()))
                ) {
                    SplashScreen()
                }
            }
            // 联网变体: 启动检查更新（覆盖全页面，含下载遮罩与结果提示）
            if (BuildConfig.ONLINE_VARIANT) {
                HanziTheme(darkTheme = savedDark) {
                    AppUpdateOverlay(scope = scope)
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
            onRendered = onRendered
        )
    }

    /**
     * 更新检查与升级覆盖层（仅联网变体）:
     * 启动时对比站点最新版本（https://hanzi.crazydan.io/assets/app/version），
     * 当前版本较旧且未被用户忽略时弹窗提示；选择升级则自动下载安装包并触发系统安装
     */
    @Composable
    private fun AppUpdateOverlay(scope: kotlinx.coroutines.CoroutineScope) {
        var updateVersion by remember { mutableStateOf<String?>(null) }
        var downloading by remember { mutableStateOf(false) }
        var updateError by remember { mutableStateOf<String?>(null) }

        LaunchedEffect(Unit) {
            val remote = withContext(Dispatchers.IO) {
                Platform.fetchText(SiteLinks.APP_VERSION_CHECK)
            } ?: return@LaunchedEffect
            if (remote.isBlank()) return@LaunchedEffect
            if (compareVersions(remote, BuildConfig.VERSION_NAME) > 0 &&
                remote != ignoredUpdateVersion()
            ) {
                updateVersion = remote
            }
        }

        updateVersion?.let { v ->
            AlertDialog(
                onDismissRequest = { /* 必须选择升级或忽略 */ },
                title = { Text("发现新版本") },
                text = {
                    Text(
                        "当前版本 v${BuildConfig.VERSION_NAME}，可升级到 v$v。\n\n" +
                            "升级将自动下载安装包并触发系统安装。"
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        updateVersion = null
                        scope.launch {
                            downloading = true
                            val apk = withContext(Dispatchers.IO) {
                                Platform.downloadToFile(
                                    SiteLinks.apkDownloadUrl(v, VARIANT_NAME),
                                    "hanzi-$VARIANT_NAME-android-$v.apk"
                                )
                            }
                            downloading = false
                            if (apk != null) {
                                Platform.installApk(apk)
                            } else {
                                updateError = "新版本下载失败，请检查网络后重试"
                            }
                        }
                    }) { Text("升级") }
                },
                dismissButton = {
                    TextButton(onClick = {
                        ignoreUpdateVersion(v)
                        updateVersion = null
                    }) { Text("忽略") }
                }
            )
        }
        if (downloading) {
            FullscreenWait("正在下载新版本…")
        }
        updateError?.let { msg ->
            AlertDialog(
                onDismissRequest = { updateError = null },
                title = { Text("升级失败") },
                text = { Text(msg) },
                confirmButton = {
                    TextButton(onClick = { updateError = null }) { Text("好的") }
                }
            )
        }
    }

    // 窗口主题: 背景与状态栏颜色跟随已保存/系统主题（与 themes.xml 背景色一致）
    private fun applyStartupTheme(dark: Boolean) {
        val bg = if (dark) getColor(R.color.window_background_dark)
        else getColor(R.color.window_background)
        window.setBackgroundDrawable(ColorDrawable(bg))
        window.statusBarColor = bg
        window.navigationBarColor = bg
        // 状态栏图标明暗（浅色背景用深色图标，暗色背景用浅色图标）
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
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
        val prefs = AppContextHolder.appPrefs
        if (prefs != null && assetHash != null && assetHash == prefs.getString(PREF_DB_HASH, null)) {
            return dest   // 同源: 直接复用（索引已建）
        }

        // 不同源: 覆盖复制（临时文件 + 原子替换，避免半写文件）
        val tmp = File(dir, "$DB_NAME.tmp")
        assets.open("$DB_ASSET_DIR/$DB_NAME").use { input ->
            FileOutputStream(tmp).use { output -> input.copyTo(output) }
        }
        dest.delete()
        tmp.renameTo(dest)

        if (prefs != null && assetHash != null) {
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
        private const val PREF_DB_HASH = "hanzi_db_hash"

        /** 用户忽略升级的版本号（存 SharedPreferences，忽略后不再提示该版本） */
        private const val PREF_IGNORED_UPDATE = "ignored_update_version"

        /** 当前变体名（与 app-pack.sh 安装包命名约定一致） */
        private val VARIANT_NAME = if (BuildConfig.ONLINE_VARIANT) "online" else "pure"

        /** 开屏页固定展示时间（毫秒） */
        private const val SPLASH_MIN_MS = 900L

        /** 开屏淡出/首页淡入时长（毫秒） */
        private const val SPLASH_FADE_MS = 300L
    }

    private fun ignoredUpdateVersion(): String? =
        AppContextHolder.appPrefs?.getString(PREF_IGNORED_UPDATE, null)

    private fun ignoreUpdateVersion(v: String) {
        AppContextHolder.appPrefs?.edit()?.putString(PREF_IGNORED_UPDATE, v)?.apply()
    }

    // 版本号数字分段比较（如 1.0.0 < 1.0.1）；a > b 返回正数
    private fun compareVersions(a: String, b: String): Int {
        val pa = a.split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val diff = pa.getOrElse(i) { 0 } - pb.getOrElse(i) { 0 }
            if (diff != 0) return diff
        }
        return 0
    }
}
