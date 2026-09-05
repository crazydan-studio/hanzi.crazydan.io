package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.StrokeDbInfo
import org.crazydan.studio.app.hanzi.shared.StrokeDbState
import org.crazydan.studio.app.hanzi.shared.StrokeDbStatus
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.SiteLinks
import org.crazydan.studio.app.hanzi.ui.StrokeDbDownloader
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.FullscreenWait
import org.crazydan.studio.app.hanzi.ui.components.InlineLinkText
import org.crazydan.studio.app.hanzi.ui.components.PrimaryButton
import org.crazydan.studio.app.hanzi.ui.components.SectionCard
import org.crazydan.studio.app.hanzi.ui.components.ThemeIconButton
import org.crazydan.studio.app.hanzi.ui.components.TopBar

/**
 * 笔画数据管理页:
 *  - 显示已导入笔画数据的状态（可访问汉字数量/笔画总数；未导入或数据损坏时提示）
 *  - 数据规模卡片: 点击后后台自动下载并导入（全屏等待遮罩，跨页面保持）；
 *    亦支持手动选择本地文件导入: 校验数据有效性、二次确认后导入
 */
@Composable
fun StrokeDataManageScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    var status by remember { mutableStateOf<StrokeDbStatus?>(null) }
    var statusChecked by remember { mutableStateOf(false) }
    var totalZi by remember { mutableStateOf(0) }
    var notice by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    // 导入流程弹窗: 校验中 → 确认 → 导入中 → 成功
    var dialog by remember { mutableStateOf<ImportDialog?>(null) }

    // 进入页面时检查已导入的笔画数据
    LaunchedEffect(Unit) {
        status = withContext(Dispatchers.Default) { db.strokeDbStatus() }
        totalZi = withContext(Dispatchers.Default) { db.queryZiCount() }
        statusChecked = true
    }

    // 刷新笔画数据状态（SQLite 查询，避免阻塞主线程）
    suspend fun refreshStatus() {
        status = withContext(Dispatchers.Default) { db.strokeDbStatus() }
    }

    fun pickAndImport() {
        Platform.pickStrokeDb { path ->
            if (path == null) {
                notice = "未选择文件，或所选文件不可用"
                return@pickStrokeDb
            }
            // 校验数据有效性（期间显示等待）
            dialog = ImportDialog.Checking
            scope.launch {
                val info = withContext(Dispatchers.Default) { db.validateStrokeDb(path) }
                if (info == null) {
                    dialog = null
                    notice = "所选文件无效或数据损坏，无法导入"
                } else {
                    // 扫描库内潜在安全风险（除笔画数据外的表/触发器/外键等）
                    val risks = withContext(Dispatchers.Default) { db.scanStrokeDbRisks(path) }
                    dialog = if (risks.isEmpty()) {
                        ImportDialog.Confirm(path, info)
                    } else {
                        ImportDialog.Risk(path, info, risks)
                    }
                }
            }
        }
    }

    fun doImport(sourcePath: String, info: StrokeDbInfo, sanitize: Boolean) {
        dialog = ImportDialog.Importing
        scope.launch {
            val ok = withContext(Dispatchers.Default) { db.importStrokeDb(sourcePath, sanitize) }
            if (ok) {
                refreshStatus()
                dialog = ImportDialog.Done(info)
                notice = null
            } else {
                dialog = null
                notice = "导入失败，请重试"
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        TopBar(title = "笔画数据管理", dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)

        // 已导入数据状态
        SectionCard {
            Text("当前笔画数据", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            if (!statusChecked) {
                Text(
                    text = "检查中...",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium
                )
            } else {
                val s = status
                val info = s?.info
                when (s?.state) {
                    StrokeDbState.READY -> Text(
                        text = "已导入笔画数据，可访问 ${info!!.ziCount} 个汉字的笔画数据（共 ${info.strokeCount} 笔）。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    StrokeDbState.MISSING -> Text(
                        text = "尚未导入笔画数据：汉字信息页将无法显示笔画书写动画与笔画分解图。",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    else -> Text(
                        text = "笔画数据无效或已损坏，请重新导入：汉字信息页将无法显示笔画书写动画与笔画分解图。",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            PrimaryButton(
                text = if (status?.state == StrokeDbState.READY) "重新导入" else "导入笔画数据文件",
                onClick = { pickAndImport() }
            )
            Text(
                text = "下载完成后，通过系统文件选择器选择已下载的笔画数据库文件；选择后先校验数据有效性，经确认后导入到应用数据目录。",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 6.dp)
            )
            if (notice != null) {
                Text(
                    text = notice ?: "",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
        }

        // 数据规模选择（按屏幕宽度流式布局: 窄屏 1 列 / 常规 2 列 / 宽屏 4 列）
        Text(
            text = "选择数据规模",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 20.dp, bottom = 8.dp)
        )
        InlineLinkText(
            text = "可按需下载不同规模的汉字笔画数据；笔画数据发布于「汉字网」GitHub Releases（可选择其他规模数据库）。",
            links = mapOf(
                "GitHub Releases" to SiteLinks.RELEASES
            ),
            style = MaterialTheme.typography.bodySmall.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant
            ),
            modifier = Modifier.padding(bottom = 8.dp)
        )
        val columns = when {
            LocalConfiguration.current.screenWidthDp >= 700 -> 4
            LocalConfiguration.current.screenWidthDp >= 400 -> 2
            else -> 1
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val scales = scaleOptions(totalZi)
            scales.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { (title, desc, scale) ->
                        ScaleOption(
                            title = title,
                            desc = desc,
                            buttonText = "下载并导入",
                            onClick = {
                                // 后台自动下载并导入（全屏任务遮罩，跨页面保持）
                                StrokeDbDownloader.start(scale, db)
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    repeat(columns - row.size) {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        AppFooter()
        Spacer(Modifier.height(8.dp))
    }

    // 导入流程弹窗
    dialog?.let { d ->
        when (d) {
            is ImportDialog.Checking -> ImportProgressDialog("正在检查数据有效性...")
            is ImportDialog.Importing -> ImportProgressDialog("正在导入...")
            is ImportDialog.Confirm -> AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("确认导入") },
                text = {
                    Text(
                        "所选文件包含 ${d.info.ziCount} 个汉字的笔画数据（共 ${d.info.strokeCount} 笔），" +
                            "确认导入？\n\n导入完成后，原文件可安全删除。"
                    )
                },
                confirmButton = {
                    TextButton(onClick = { doImport(d.sourcePath, d.info, sanitize = false) }) { Text("确认导入") }
                },
                dismissButton = {
                    TextButton(onClick = { dialog = null }) { Text("取消") }
                }
            )
            is ImportDialog.Risk -> AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("检测到安全风险") },
                text = {
                    Text(
                        "所选文件除笔画数据（strokes 表）外还包含以下内容，可能存在安全风险：\n\n" +
                            d.risks.joinToString("\n") { "· $it" } +
                            "\n\n建议消除后再导入（仅修改导入副本，不影响原文件），" +
                            "或放弃导入并清理临时文件。"
                    )
                },
                confirmButton = {
                    TextButton(onClick = { doImport(d.sourcePath, d.info, sanitize = true) }) { Text("消除风险并继续") }
                },
                dismissButton = {
                    TextButton(onClick = {
                        dialog = null
                        Platform.cleanStrokeImportCache()
                        notice = "已放弃导入，并清理所选临时文件"
                    }) { Text("放弃导入") }
                }
            )
            is ImportDialog.Done -> AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("导入成功") },
                text = {
                    Text(
                        "已导入 ${d.info.ziCount} 个汉字的笔画数据（共 ${d.info.strokeCount} 笔）。\n\n" +
                            "原文件已复制到应用数据目录，可安全删除。"
                    )
                },
                confirmButton = {
                    TextButton(onClick = { dialog = null }) { Text("好的") }
                }
            )
        }
    }

    // 在线下载/导入任务（全局状态，退出页面再进入仍持续显示）
    when (val s = StrokeDbDownloader.state) {
        is StrokeDbDownloader.State.Working -> FullscreenWait(
            text = when (s.phase) {
                StrokeDbDownloader.Phase.DOWNLOADING ->
                    "正在下载笔画数据（${scaleTitle(s.scale)}）…"
                StrokeDbDownloader.Phase.IMPORTING -> "正在导入笔画数据…"
            }
        )
        is StrokeDbDownloader.State.Done -> AlertDialog(
            onDismissRequest = {},
            title = { Text("导入成功") },
            text = {
                Text(
                    "已下载并导入 ${s.info.ziCount} 个汉字的笔画数据（共 ${s.info.strokeCount} 笔）。"
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    StrokeDbDownloader.dismiss()
                    scope.launch { refreshStatus() }
                }) { Text("好的") }
            }
        )
        is StrokeDbDownloader.State.Failed -> AlertDialog(
            onDismissRequest = {},
            title = { Text("导入失败") },
            text = { Text(s.message) },
            confirmButton = {
                TextButton(onClick = {
                    StrokeDbDownloader.dismiss()
                    scope.launch { refreshStatus() }
                }) { Text("好的") }
            }
        )
        StrokeDbDownloader.State.Idle -> Unit
    }
}

/** 导入流程弹窗状态 */
private sealed interface ImportDialog {
    data object Checking : ImportDialog
    data class Confirm(val sourcePath: String, val info: StrokeDbInfo) : ImportDialog
    data class Risk(val sourcePath: String, val info: StrokeDbInfo, val risks: List<String>) : ImportDialog
    data object Importing : ImportDialog
    data class Done(val info: StrokeDbInfo) : ImportDialog
}

/** 等待弹窗（校验/导入中，不可取消） */
@Composable
private fun ImportProgressDialog(text: String) {
    AlertDialog(
        onDismissRequest = { /* 等待中不允许取消 */ },
        title = { Text("导入笔画数据") },
        text = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.width(24.dp).height(24.dp))
                Spacer(Modifier.width(12.dp))
                Text(text)
            }
        },
        confirmButton = {}
    )
}

/** 数据规模选项（卡片形式，无图标）: 自上而下为 主标题 → 描述 → 下载按钮 */
@Composable
private fun ScaleOption(
    title: String,
    desc: String,
    buttonText: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    SectionCard(modifier = modifier) {
        Column {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                text = desc,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
            PrimaryButton(
                text = buttonText,
                onClick = onClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
            )
        }
    }
}

// 数据规模选项（与 build/export-stroke-db.js 的 --count 导出规模一致）;
// 前三档标题为静态，仅「全部」随汉字总数动态生成
private data class ScaleSpec(val title: String, val desc: String, val scale: String)

private val SCALE_OPTIONS = listOf(
    ScaleSpec("1500 字", "约 1500 个高频常用汉字（小规模）", "1500"),
    ScaleSpec("3000 字", "约 3000 个高频汉字（中规模）", "3000"),
    ScaleSpec("5000 字", "约 5000 个高频汉字（大规模）", "5000")
)

private fun scaleOptions(totalZi: Int): List<ScaleSpec> =
    SCALE_OPTIONS + ScaleSpec(
        "全部（约 ${formatWan(totalZi)}）", "全部汉字的笔画数据（完整规模）", "full"
    )

/** 规模标识 → 展示名（下载遮罩文案用） */
private fun scaleTitle(scale: String): String =
    SCALE_OPTIONS.firstOrNull { it.scale == scale }?.title ?: "全部"

/** 数字格式化为「万」表述（如 26223 → 2.6 万+ 字）; 整数运算，不依赖平台 Locale */
private fun formatWan(total: Int): String {
    if (total < 10000) return "$total 字"
    val tenths = (total + 500) / 1000   // 一位小数（四舍五入）
    val whole = tenths / 10
    val frac = tenths % 10
    return if (frac == 0) "$whole 万+ 字" else "$whole.$frac 万+ 字"
}
