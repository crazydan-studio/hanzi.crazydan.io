package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.CharMeta
import org.crazydan.studio.app.hanzi.shared.CharStroke
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.HanziLabels
import org.crazydan.studio.app.hanzi.shared.unicodePointAt
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.components.SectionCard
import org.crazydan.studio.app.hanzi.ui.components.StrokeCellCanvas
import org.crazydan.studio.app.hanzi.ui.components.WritingAnimationCanvas
import org.crazydan.studio.app.hanzi.ui.components.WritingPlayer
import org.crazydan.studio.app.hanzi.ui.components.rememberWritingPlayer

/**
 * 汉字信息页: 书写动画（倍速/暂停/重置）/ 读音试听 / 复制 / 笔画分解图
 */
@Composable
fun CharDetailScreen(
    db: HanziDb,
    character: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onHome: () -> Unit
) {
    val unicode = unicodePointAt(character)
    var meta by remember { mutableStateOf<CharMeta?>(null) }
    var strokes by remember { mutableStateOf<List<CharStroke>?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var audioHint by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf<String?>(null) }
    // 笔画分解图点击 → 单笔播放请求（-1 表示无请求）
    var singleIndex by remember { mutableIntStateOf(-1) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(character) {
        loading = true
        error = null
        try {
            val m = withContext(Dispatchers.Default) { db.queryCharMeta(unicode) }
            val s = withContext(Dispatchers.Default) { db.queryCharStrokes(unicode) }
            meta = m
            strokes = s
        } catch (e: Exception) {
            error = "数据加载失败"
        }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        TopBar(title = "汉字信息", dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)

        when {
            loading -> Text(
                text = "加载中...",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 32.dp)
            )
            error != null -> Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(vertical = 32.dp)
            )
            meta == null -> Text(
                text = "未找到汉字「$character」的信息",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(vertical = 32.dp)
            )
            else -> {
                val m = meta!!
                val strokeList = strokes ?: emptyList()

                // 书写动画面板
                SectionCard {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("书写动画", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = {
                            Platform.openUrl("https://zdic.net/hans/${encodeUrl(m.character)}")
                        }) {
                            Text("汉典网详情 →")
                        }
                    }

                    // 汉字信息
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = m.character,
                                style = MaterialTheme.typography.displayLarge,
                                fontFamily = KaiTiFontFamily,
                                modifier = Modifier.padding(end = 12.dp)
                            )
                            CopyButton(
                                label = if (copied == "char") "已复制" else "复制",
                                onClick = {
                                    Platform.copyToClipboard(m.character)
                                    flashCopied(scope, "char") { copied = it }
                                }
                            )
                        }
                        // 读音（试听 + 复制）
                        @OptIn(ExperimentalLayoutApi::class)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            m.pinyin.forEach { p ->
                                Surface(
                                    shape = MaterialTheme.shapes.extraLarge,
                                    color = MaterialTheme.colorScheme.surface,
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = p,
                                            style = MaterialTheme.typography.bodyMedium,
                                            modifier = Modifier.padding(start = 4.dp)
                                        )
                                        TextButton(onClick = {
                                            val ok = Platform.playPinyin(p)
                                            audioHint = if (ok) null else "音频 ${p}.mp3 不存在"
                                        }) {
                                            Text("试听", color = MaterialTheme.colorScheme.primary)
                                        }
                                        TextButton(onClick = {
                                            Platform.copyToClipboard(p)
                                            flashCopied(scope, p) { copied = it }
                                        }) {
                                            Text(
                                                if (copied == p) "已复制" else "复制",
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        audioHint?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }

                        // 基础信息: 笔画总数 / 部首 / 字型结构 / Unicode
                        @OptIn(ExperimentalLayoutApi::class)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(top = 10.dp)
                        ) {
                            val unicodeLabel = "U+${unicode.toString(16).uppercase().padStart(4, '0')}"
                            InfoItem("笔画总数", "${m.totalStrokeCount} 画")
                            DividerDot()
                            InfoItem("部首", m.radical) { Platform.copyToClipboard(m.radical) }
                            DividerDot()
                            InfoItem("字型结构", HanziLabels.structureName(m.structure))
                            DividerDot()
                            InfoItem("Unicode", unicodeLabel) { Platform.copyToClipboard(unicodeLabel) }
                        }
                    }

                    // 书写动画
                    WritingPanel(
                        strokes = strokeList,
                        character = m.character,
                        dark = dark,
                        singleIndex = singleIndex,
                        onSingleRequestHandled = { singleIndex = -1 }
                    )
                }

                // 笔画分解图
                SectionCard(modifier = Modifier.padding(top = 12.dp)) {
                    Text("笔画分解图", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "点击任一笔画分解图即可播放该笔画的书写动画",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                    if (strokeList.isEmpty()) {
                        Text(
                            text = "该汉字暂无笔画数据",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                    } else {
                        StrokeDecomposition(
                            strokes = strokeList,
                            dark = dark,
                            onPlaySingle = { index ->
                                Platform.stopPinyin()
                                singleIndex = index
                            }
                        )
                    }
                }

                // 友情赞助
                SectionCard(modifier = Modifier.padding(top = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "喜欢本站？您的赞助将支持我们持续提供免费的汉字学习服务",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(12.dp))
                        Button(onClick = onHome) {
                            Text("去赞助")
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

/** 书写动画面板: 动画 + 播放控制（播放/暂停/重置/倍速） */
@Composable
private fun WritingPanel(
    strokes: List<CharStroke>,
    character: String,
    dark: Boolean,
    singleIndex: Int,
    onSingleRequestHandled: () -> Unit
) {
    val player = rememberWritingPlayer(strokes)

    // 笔画分解图点击 → 单笔播放
    LaunchedEffect(singleIndex) {
        if (singleIndex != -1) {
            player.singleStroke = true
            player.seekTo(singleIndex)
            player.play()
            onSingleRequestHandled()
        }
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        WritingAnimationCanvas(
            strokes = strokes,
            character = character,
            dark = dark,
            player = player,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 500.dp)
        )

        if (strokes.isNotEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 12.dp)
            ) {
                Button(
                    enabled = player.state != WritingPlayer.State.PLAYING,
                    onClick = {
                        Platform.stopPinyin()
                        player.singleStroke = false
                        player.play()
                    }
                ) {
                    Text(if (player.state == WritingPlayer.State.COMPLETED) "重播" else "播放")
                }
                OutlinedButton(
                    enabled = player.state == WritingPlayer.State.PLAYING,
                    onClick = { player.pause() }
                ) {
                    Text("暂停")
                }
                OutlinedButton(onClick = {
                    player.singleStroke = false
                    player.reset()
                }) {
                    Text("重置")
                }
                // 倍速
                SPEEDS.forEach { s ->
                    TextButton(
                        onClick = { player.setSpeed(s) },
                        modifier = Modifier.padding(horizontal = 2.dp)
                    ) {
                        Text(
                            text = "${s}x",
                            color = if (player.playbackSpeed == s) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    }
                }
            }
        } else {
            Text(
                text = "该汉字暂无笔画数据，不支持播放笔画书写动画",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 10.dp)
            )
        }
    }
}

/** 笔画分解图: 每笔的笔画名称、笔顺与字型内位置；点击播放该笔画动画 */
@Composable
private fun StrokeDecomposition(
    strokes: List<CharStroke>,
    dark: Boolean,
    onPlaySingle: (Int) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(top = 12.dp)
    ) {
        strokes.chunked(4).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row.forEach { stroke ->
                    val index = strokes.indexOfFirst { it.strokeOrder == stroke.strokeOrder }
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onPlaySingle(index) }
                    ) {
                        StrokeCellCanvas(
                            stroke = stroke,
                            dark = dark,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Text(
                            text = HanziLabels.strokeTypeName(stroke.strokeType),
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = KaiTiFontFamily,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                        Text(
                            text = "第 ${index + 1} 笔",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoItem(label: String, value: String, onClick: (() -> Unit)? = null) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.clickable(enabled = onClick != null) { onClick?.invoke() }
        )
    }
}

@Composable
private fun DividerDot() {
    Text(
        text = "|",
        color = MaterialTheme.colorScheme.outlineVariant
    )
}

@Composable
private fun CopyButton(label: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick) {
        Text(label)
    }
}

private fun flashCopied(scope: CoroutineScope, key: String, set: (String?) -> Unit) {
    set(key)
    scope.launch {
        delay(1500)
        set(null)
    }
}

private fun encodeUrl(text: String): String {
    return buildString {
        text.forEach { ch ->
            if (ch in 'a'..'z' || ch in 'A'..'Z' || ch in '0'..'9' || ch in "-_.~") {
                append(ch)
            } else {
                ch.toString().encodeToByteArray().forEach { b ->
                    append('%')
                    append(((b.toInt() and 0xFF) shr 4).toString(16).uppercase())
                    append(((b.toInt() and 0xFF) and 0x0F).toString(16).uppercase())
                }
            }
        }
    }
}

private val SPEEDS = listOf(0.5f, 1f, 1.5f, 2f)
