package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.StrokeDbInfo
import org.crazydan.studio.app.hanzi.shared.StrokeDbState
import org.crazydan.studio.app.hanzi.shared.StrokeDbStatus
import org.crazydan.studio.app.hanzi.ui.Blue500
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.SectionCard

/**
 * 笔画数据管理页:
 *  - 显示已导入笔画数据的状态（可访问汉字数量/笔画总数；未导入或数据损坏时提示）
 *  - 按需下载不同规模（1500/3000/5000/全部）的笔画数据（跳转浏览器下载），
 *    选择文件后校验数据有效性、二次确认后导入到应用数据目录
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

    fun refreshStatus() {
        status = db.strokeDbStatus()
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
                    dialog = ImportDialog.Confirm(path, info)
                }
            }
        }
    }

    fun doImport(d: ImportDialog.Confirm) {
        dialog = ImportDialog.Importing
        scope.launch {
            val ok = withContext(Dispatchers.Default) { db.importStrokeDb(d.sourcePath) }
            if (ok) {
                refreshStatus()
                dialog = ImportDialog.Done(d.info)
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
            Button(
                colors = ButtonDefaults.buttonColors(
                    containerColor = Blue500,
                    contentColor = Color.White
                ),
                onClick = { pickAndImport() }
            ) {
                Text(if (status?.state == StrokeDbState.READY) "重新导入" else "导入笔画数据文件")
            }
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

        // 数据规模选择（两列卡片）
        Text(
            text = "选择数据规模",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 20.dp, bottom = 8.dp)
        )
        Text(
            text = "可按需下载不同规模的汉字笔画数据；笔画数据发布于「汉字网」GitHub Releases。",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(bottom = 12.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val scales = listOf(
                Triple("1500 字", "约 1500 个高频常用汉字（小规模）", "1500"),
                Triple("3000 字", "约 3000 个高频汉字（中规模）", "3000"),
                Triple("5000 字", "约 5000 个高频汉字（大规模）", "5000"),
                Triple("全部（约 ${formatWan(totalZi)}）", "全部汉字的笔画数据（完整规模）", "full")
            )
            scales.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { (title, desc, scale) ->
                        ScaleOption(
                            title = title,
                            desc = desc,
                            onClick = { downloadScale(scale) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    if (row.size == 1) {
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
                    TextButton(onClick = { doImport(d) }) { Text("确认导入") }
                },
                dismissButton = {
                    TextButton(onClick = { dialog = null }) { Text("取消") }
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
}

/** 导入流程弹窗状态 */
private sealed interface ImportDialog {
    data object Checking : ImportDialog
    data class Confirm(val sourcePath: String, val info: StrokeDbInfo) : ImportDialog
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
            Button(
                colors = ButtonDefaults.buttonColors(
                    containerColor = Blue500,
                    contentColor = Color.White
                ),
                onClick = onClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
            ) {
                Text("点击下载")
            }
        }
    }
}

private fun downloadScale(scale: String) {
    Platform.openUrl(
        "https://github.com/crazydan-studio/hanzi.crazydan.io/releases/latest/download/" +
            "hanzi-stroke-$scale.db"
    )
}

/** 数字格式化为「万」表述（如 26223 → 2.6 万+） */
private fun formatWan(total: Int): String {
    if (total < 10000) return "$total 字"
    val wan = total / 10000.0
    val text = String.format("%.1f", wan)
    return "${text.trimEnd('0').trimEnd('.')} 万+ 字"
}
