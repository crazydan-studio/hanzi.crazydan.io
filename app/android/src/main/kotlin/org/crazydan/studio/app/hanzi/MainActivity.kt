package org.crazydan.studio.app.hanzi

import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
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
import org.crazydan.studio.app.hanzi.ui.DownloadResult
import org.crazydan.studio.app.hanzi.ui.HanziApp
import org.crazydan.studio.app.hanzi.ui.HanziTheme
import org.crazydan.studio.app.hanzi.ui.InitNoticeScreen
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.Screen
import org.crazydan.studio.app.hanzi.ui.SiteLinks
import org.crazydan.studio.app.hanzi.ui.SplashScreen
import org.crazydan.studio.app.hanzi.ui.StrokeDbDownloader
import org.crazydan.studio.app.hanzi.ui.ThemeStore
import org.crazydan.studio.app.hanzi.ui.components.FullscreenWait
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * 汉字 App 主界面（Compose Multiplatform 原生 UI）
 * 启动流程:
 *   1. 立即显示开屏页（logo + 暗色背景，固定展示时间），同时后台检查/准备数据库
 *   2. 等待首页渲染完成（首帧绘制）后，开屏平滑淡出（首页不做淡入）
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
        Platform.init(this, strokeDbPicker, BuildConfig.VERSION_NAME)
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
            // 导航器提升到宿主层: 更新检查需感知当前页面（仅在首页时弹窗）
            val navigator = remember { AppNavigator() }
            // 当前主题（单一状态源为 HanziApp; 此处同步窗口/系统栏与更新弹窗主题）
            var appDark by remember { mutableStateOf(savedDark) }
            val onThemeChanged: (Boolean) -> Unit = { dark ->
                appDark = dark
                applyStartupTheme(dark)
            }

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
                    Log.e(TAG, "数据库初始化失败", e)
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
                    AppContent(
                        db = currentDb,
                        navigator = navigator,
                        onThemeChanged = onThemeChanged,
                        onRendered = { homeRendered = true }
                    )
                } else if (initFailed) {
                    InitNoticeScreen(
                        darkTheme = appDark,
                        message = "数据库初始化失败，请重启应用"
                    )
                } else if (!showSplash) {
                    // 开屏已提前淡出且数据库仍在初始化 → 在首页区域显示等待提示
                    InitNoticeScreen(darkTheme = appDark)
                }
                // 开屏页（仅 logo 与等待动画；首页渲染完成或初始化中提前淡出）
                AnimatedVisibility(
                    visible = showSplash,
                    exit = fadeOut(animationSpec = tween(SPLASH_FADE_MS.toInt()))
                ) {
                    SplashScreen()
                }
            }
            // 后台检查更新，仅在首页时弹窗提示（含下载遮罩与结果提示）
            HanziTheme(darkTheme = appDark) {
                AppUpdateOverlay(scope = scope, navigator = navigator)
            }
        }
    }

    @Composable
    private fun AppContent(
        db: HanziDb,
        navigator: AppNavigator,
        onThemeChanged: (Boolean) -> Unit,
        onRendered: () -> Unit
    ) {
        // 返回键: 页面内返回；无上一页时退出
        // 笔画数据下载/导入任务进行中禁止返回（任务跨页面保持，防止退出中断）
        BackHandler(enabled = !StrokeDbDownloader.isWorking) {
            if (!navigator.back()) {
                finish()
            }
        }
        HanziApp(
            db = db,
            navigator = navigator,
            onThemeChanged = onThemeChanged,
            onRendered = onRendered
        )
    }

    /** 站点发布的最新版本信息（version 文件为单行 JSON，见 build/app-version-pack.js） */
    private data class UpdateInfo(
        val version: String,
        val changelog: String,
        val sha256: String?   // 安装包 sha256（十六进制，用于完整性校验）
    )

    /**
     * 更新检查与升级覆盖层:
     * 后台检查站点最新版本（https://hanzi.crazydan.io/assets/app/version），检查失败静默忽略；
     * 仅当存在可更新版本且当前处于首页时弹窗，提供 升级/忽略/延迟到下次 三个选择
     */
    @Composable
    private fun AppUpdateOverlay(scope: kotlinx.coroutines.CoroutineScope, navigator: AppNavigator) {
        var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
        var downloading by remember { mutableStateOf(false) }
        var failedUpgrade by remember { mutableStateOf<UpdateInfo?>(null) }
        var failedReason by remember { mutableStateOf<String?>(null) }

        // 后台检查更新（成功且版本较旧且未被忽略时才提示；失败静默忽略）
        LaunchedEffect(Unit) {
            val json = withContext(Dispatchers.IO) {
                Platform.fetchText(SiteLinks.APP_VERSION_CHECK)
            } ?: return@LaunchedEffect
            val info = parseUpdateInfo(json) ?: return@LaunchedEffect
            if (compareVersions(info.version, BuildConfig.VERSION_NAME) > 0 &&
                info.version != ignoredUpdateVersion()
            ) {
                updateInfo = info
            }
        }

        // 升级: 全屏遮罩等待下载 → 完整性校验 → 触发系统安装；失败给出具体原因
        fun upgrade(info: UpdateInfo) {
            val url = SiteLinks.apkDownloadUrl(info.version)
            scope.launch {
                downloading = true
                updateInfo = null
                val result = withContext(Dispatchers.IO) {
                    Platform.downloadToFile(url, url.substringAfterLast('/'))
                }
                val apk = when (result) {
                    is DownloadResult.Success -> result.path
                    is DownloadResult.Failure -> {
                        downloading = false
                        failedUpgrade = info
                        failedReason = "安装包下载失败：${result.reason}"
                        return@launch
                    }
                }
                // 完整性校验（version 文件提供安装包 sha256）
                val expected = info.sha256
                val actual = withContext(Dispatchers.IO) { Platform.sha256Hex(apk) }
                if (expected != null && (actual == null || !actual.equals(expected, ignoreCase = true))) {
                    // 校验失败: 清理损坏的安装包后提示
                    withContext(Dispatchers.IO) { Platform.deleteDownloadedFile(apk) }
                    downloading = false
                    failedUpgrade = info
                    failedReason = "安装包完整性校验失败（SHA-256 不匹配），请重试或改在浏览器中下载"
                    return@launch
                }
                downloading = false
                if (!Platform.installApk(apk)) {
                    failedUpgrade = info
                    failedReason = "无法启动系统安装，请在浏览器中下载后手动安装"
                }
                // 安装成功后不删除安装包（系统安装流程可能仍在读取文件），留待覆盖/后续清理
            }
        }

        // 仅在首页时提示（后台检查结果等待用户回到首页）
        val onHome = navigator.screen is Screen.Home
        updateInfo?.let { info ->
            if (onHome) {
                AlertDialog(
                    onDismissRequest = { /* 必须选择升级/忽略/延迟 */ },
                    title = { Text("发现新版本 v${info.version}") },
                    text = {
                        Text(
                            buildString {
                                append("当前版本 v${BuildConfig.VERSION_NAME}，可升级到 v${info.version}。")
                                if (info.changelog.isNotEmpty()) {
                                    append("\n\n更新内容：\n${info.changelog}")
                                }
                                append("\n\n升级将自动下载安装包并触发系统安装。")
                            }
                        )
                    },
                    confirmButton = {
                        TextButton(onClick = { upgrade(info) }) { Text("升级") }
                    },
                    dismissButton = {
                        Row {
                            // 延迟到下次: 本次不提示（不记录，下次启动仍会检查）
                            TextButton(onClick = { updateInfo = null }) { Text("延迟到下次") }
                            TextButton(onClick = {
                                ignoreUpdateVersion(info.version)
                                updateInfo = null
                            }) { Text("忽略该版本") }
                        }
                    }
                )
            }
        }
        if (downloading) {
            FullscreenWait("正在下载新版本…")
        }
        failedUpgrade?.let { info ->
            AlertDialog(
                onDismissRequest = { failedUpgrade = null },
                title = { Text("升级失败") },
                text = { Text(failedReason ?: "未知错误") },
                confirmButton = {
                    TextButton(onClick = {
                        failedUpgrade = null
                        failedReason = null
                        upgrade(info)
                    }) { Text("重试") }
                },
                dismissButton = {
                    TextButton(onClick = {
                        failedUpgrade = null
                        failedReason = null
                        Platform.openUrl(SiteLinks.apkDownloadUrl(info.version))
                    }) { Text("浏览器下载") }
                }
            )
        }
    }

    // 解析 version 单行 JSON: {"name":"1.0.0","changelog":"...","checksum":{"android":"sha256:..."}}
    private fun parseUpdateInfo(json: String): UpdateInfo? {
        return try {
            val root = JSONObject(json)
            val version = root.getString("name")
            val changelog = root.optString("changelog", "")
            // 取出的 hash 带 "sha256:" 前缀，比较前剥离
            val sha256 = root.optJSONObject("checksum")
                ?.optString("android", null)
                ?.removePrefix("sha256:")
            UpdateInfo(version, changelog, sha256)
        } catch (e: Exception) {
            Log.w(TAG, "解析版本信息失败: $json", e)
            null
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
            Log.w(TAG, "读取内置库 hash 文件失败", e)
            null
        }
    }

    // 内置库 SHA-256（hash 文件缺失时的兜底; 计算逻辑共用 Platform.sha256HexOf）
    private fun sha256Asset(assetPath: String): String? {
        return try {
            Platform.sha256HexOf(assets.open(assetPath))
        } catch (e: Exception) {
            Log.w(TAG, "计算内置库 SHA-256 失败: $assetPath", e)
            null   // 计算失败时不记录 hash，下次启动重新检测
        }
    }

    override fun onDestroy() {
        activeDb?.close()
        activeDb = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "HanziApp"

        private const val DB_NAME = "hanzi.db"
        private const val DB_ASSET_DIR = "db"
        private const val PREF_DB_HASH = "hanzi_db_hash"

        /** 用户忽略升级的版本号（存 SharedPreferences，忽略后不再提示该版本） */
        private const val PREF_IGNORED_UPDATE = "ignored_update_version"

        /** 开屏页固定展示时间（毫秒） */
        private const val SPLASH_MIN_MS = 900L

        /** 开屏淡出时长（毫秒） */
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
