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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.StrokeDbInfo
import org.crazydan.studio.app.hanzi.ui.Blue500
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.StrokeDbStore
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.SectionCard

/**
 * 笔画数据管理页:
 *  - 显示当前已指定位置的笔画数据库状态（可访问汉字数量/笔画总数；缺失或无效时警示）
 *  - 按需下载不同规模（1500/3000/5000/全部）的笔画数据（跳转浏览器下载），
 *    下载完成后重新指定数据库存放位置，避免重复复制大体积文件
 */
@Composable
fun StrokeDataManageScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    var info by remember { mutableStateOf<StrokeDbInfo?>(null) }
    var statusChecked by remember { mutableStateOf(false) }
    var totalZi by remember { mutableStateOf(0) }
    var notice by remember { mutableStateOf<String?>(null) }

    // 进入页面时检查已配置的笔画数据库（存在且完整）
    LaunchedEffect(Unit) {
        info = withContext(Dispatchers.Default) { db.strokeDbInfo() }
        totalZi = withContext(Dispatchers.Default) { db.queryZiCount() }
        statusChecked = true
    }

    // 重新指定数据库后刷新状态
    fun refreshInfo() {
        info = db.strokeDbInfo()
    }

    fun pickAndConfigure() {
        Platform.pickStrokeDb { path ->
            if (path == null) {
                notice = "未选择文件，或所选文件不可用"
            } else {
                StrokeDbStore.save(path)
                db.configureStrokeDb(path)
                refreshInfo()
                notice = null
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

        // 当前数据库状态
        SectionCard {
            Text("当前笔画数据", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            if (!statusChecked) {
                Text(
                    text = "检查中...",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium
                )
            } else if (info != null) {
                val i = info!!
                Text(
                    text = "已配置笔画数据库，可访问 **${i.ziCount}** 个汉字的笔画数据（共 ${i.strokeCount} 笔）。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium
                )
            } else {
                Text(
                    text = "尚未配置有效的笔画数据库：汉字信息页将无法显示笔画书写动画与笔画分解图。",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Spacer(Modifier.height(12.dp))
            Button(
                colors = ButtonDefaults.buttonColors(
                    containerColor = Blue500,
                    contentColor = Color.White
                ),
                onClick = { pickAndConfigure() }
            ) {
                Text("选择笔画数据库文件")
            }
            Text(
                text = "下载完成后，通过系统文件选择器指定数据库的存放位置（如 Download 目录），即可直接使用，避免重复复制大文件。",
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

        // 数据规模选择（不同图标表示不同规模）
        Text(
            text = "选择数据规模",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 20.dp, bottom = 8.dp)
        )
        Text(
            text = "可按需下载不同规模的汉字笔画数据，避免占用过多存储空间；笔画数据发布于「汉字网」GitHub Releases。",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(bottom = 12.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ScaleOption(
                title = "1500",
                desc = "约 1500 个高频常用汉字（小规模）",
                onClick = { downloadScale("1500") }
            )
            ScaleOption(
                title = "3000",
                desc = "约 3000 个高频汉字（中规模）",
                onClick = { downloadScale("3000") }
            )
            ScaleOption(
                title = "5000",
                desc = "约 5000 个高频汉字（大规模）",
                onClick = { downloadScale("5000") }
            )
            ScaleOption(
                title = "全部（约 ${formatWan(totalZi)}，与汉字实际数量相匹配）",
                desc = "全部汉字的笔画数据（完整规模）",
                onClick = { downloadScale("full") }
            )
        }
        Text(
            text = "点击下载后将在浏览器中打开下载页，请等待下载完成后返回本页，再点击上方「选择笔画数据库文件」指定存放位置。",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 12.dp)
        )

        AppFooter()
        Spacer(Modifier.height(8.dp))
    }
}

/** 数据规模选项（卡片形式，无图标）: 自上而下为 主标题 → 描述 → 下载按钮 */
@Composable
private fun ScaleOption(
    title: String,
    desc: String,
    onClick: () -> Unit
) {
    SectionCard {
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium)
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
