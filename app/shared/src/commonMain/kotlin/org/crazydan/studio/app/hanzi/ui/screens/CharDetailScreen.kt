package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
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
import org.crazydan.studio.app.hanzi.shared.Pinyin
import org.crazydan.studio.app.hanzi.shared.unicodePointAt
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.SectionCard
import org.crazydan.studio.app.hanzi.ui.components.StrokeCellCanvas
import org.crazydan.studio.app.hanzi.ui.components.WritingAnimationCanvas
import org.crazydan.studio.app.hanzi.ui.components.WritingPlayer
import org.crazydan.studio.app.hanzi.ui.components.rememberWritingPlayer
import org.crazydan.studio.app.hanzi.ui.components.strokeDuration

/**
 * 汉字信息页: 书写动画（倍速/暂停/重置）/ 读音试听 / 复制 / 笔画分解图
 * 布局与交互与 web 页一致: 信息行内联展示、分解图点击在格子内播放该笔动画
 */
@Composable
fun CharDetailScreen(
    db: HanziDb,
    character: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenDonate: () -> Unit
) {
    val unicode = unicodePointAt(character)
    var meta by remember { mutableStateOf<CharMeta?>(null) }
    var strokes by remember { mutableStateOf<List<CharStroke>?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var audioHint by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf<String?>(null) }
    // 笔画分解图单笔播放（与 web 一致）: 在格子自身内循环播放，点击停止或继续
    var cellPlayIndex by remember { mutableIntStateOf(-1) }
    var cellProgress by remember { mutableFloatStateOf(0f) }
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

    // 分解图格子内循环播放: 单笔动画 → 间隔 400ms → 重播（与 web onComplete 循环一致）
    LaunchedEffect(cellPlayIndex, strokes) {
        val index = cellPlayIndex
        if (index < 0) return@LaunchedEffect
        val stroke = strokes?.getOrNull(index) ?: return@LaunchedEffect
        val duration = strokeDuration(stroke.points)
        while (true) {
            val startNs = withFrameNanos { it }
            while (true) {
                val now = withFrameNanos { it }
                cellProgress = ((now - startNs) / 1_000_000f / duration).coerceIn(0f, 1f)
                if (cellProgress >= 1f) break
            }
            delay(CELL_LOOP_GAP_MS)
            if (cellPlayIndex != index) break   // 已停止或切换到其他格
        }
        cellProgress = 0f
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
                        SmallTextButton(
                            text = "汉典网详情 →",
                            onClick = {
                                Platform.openUrl("https://zdic.net/hans/${encodeUrl(m.character)}")
                            }
                        )
                    }

                    // 汉字信息（与 web 布局一致: 读音块 + 信息行内联展示）
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = m.character,
                                style = MaterialTheme.typography.displayMedium,
                                fontFamily = KaiTiFontFamily,
                                modifier = Modifier.padding(end = 10.dp)
                            )
                            SmallButton(
                                text = if (copied == "char") "已复制" else "复制",
                                onClick = {
                                    Platform.copyToClipboard(m.character)
                                    flashCopied(scope, "char") { copied = it }
                                }
                            )
                        }
                        // 读音（试听 + 复制; 拼音用系统字体避免声调字符空白）
                        @OptIn(ExperimentalLayoutApi::class)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(top = 8.dp)
                        ) {
                            m.pinyin.forEach { p ->
                                val display = Pinyin.numberToSymbolTone(p)
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.surface,
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(start = 8.dp, end = 2.dp)
                                    ) {
                                        Text(
                                            text = display,
                                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Default),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        SmallTextButton(
                                            text = "试听",
                                            onClick = {
                                                val ok = Platform.playPinyin(p)
                                                audioHint = if (ok) null else "音频 ${p}.mp3 不存在"
                                            }
                                        )
                                        SmallTextButton(
                                            text = if (copied == p) "已复制" else "复制",
                                            onClick = {
                                                Platform.copyToClipboard(display)
                                                flashCopied(scope, p) { copied = it }
                                            }
                                        )
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

                        // 基础信息（与 web 一致: 内联 + 竖线分隔; 部首/Unicode 可复制）
                        @OptIn(ExperimentalLayoutApi::class)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(top = 10.dp)
                        ) {
                            val unicodeLabel = "U+${unicode.toString(16).uppercase().padStart(4, '0')}"
                            InlineInfoItem("笔画总数", "${m.totalStrokeCount} 画")
                            DividerDot()
                            InlineInfoItem("部首", m.radical, onCopy = {
                                Platform.copyToClipboard(m.radical)
                                flashCopied(scope, "radical") { copied = it }
                            }, copied = copied == "radical")
                            DividerDot()
                            InlineInfoItem("字型结构", HanziLabels.structureName(m.structure))
                            DividerDot()
                            InlineInfoItem("Unicode", unicodeLabel, onCopy = {
                                Platform.copyToClipboard(unicodeLabel)
                                flashCopied(scope, "unicode") { copied = it }
                            }, copied = copied == "unicode")
                        }
                    }

                    // 书写动画
                    WritingPanel(
                        strokes = strokeList,
                        character = m.character,
                        dark = dark
                    )
                }

                // 笔画分解图（格子内单笔动画）
                SectionCard(modifier = Modifier.padding(top = 12.dp)) {
                    Text("笔画分解图", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "点击任一笔画分解图即可在该格内播放该笔画的书写动画",
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
                            character = m.character,
                            dark = dark,
                            playingIndex = cellPlayIndex,
                            playingProgress = cellProgress,
                            onTogglePlay = { index ->
                                Platform.stopPinyin()
                                // 点击停止或继续播放（与 web togglePlay 一致）
                                cellPlayIndex = if (cellPlayIndex == index) -1 else index
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
                        SmallButton(text = "去赞助", onClick = onOpenDonate, primary = true)
                    }
                }
                AppFooter()
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

/** 书写动画面板: 动画 + 播放控制（播放/暂停/重置/倍速，与 web 一致） */
@Composable
private fun WritingPanel(
    strokes: List<CharStroke>,
    character: String,
    dark: Boolean
) {
    val player = rememberWritingPlayer(strokes)

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
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.padding(top = 12.dp)
            ) {
                SmallButton(
                    text = when (player.state) {
                        WritingPlayer.State.COMPLETED -> "重播"
                        WritingPlayer.State.PLAYING -> "播放中"
                        else -> "播放"
                    },
                    enabled = player.state != WritingPlayer.State.PLAYING,
                    primary = true,
                    onClick = {
                        Platform.stopPinyin()
                        player.singleStroke = false
                        player.play()
                    }
                )
                SmallButton(
                    text = "暂停",
                    enabled = player.state == WritingPlayer.State.PLAYING,
                    onClick = { player.pause() }
                )
                SmallButton(text = "重置", onClick = {
                    player.singleStroke = false
                    player.reset()
                })
                // 倍速（与 web SPEEDS 一致: 0.5/1/1.5/2）
                SPEEDS.forEach { s ->
                    SmallTextButton(
                        text = "${s}x",
                        onClick = { player.setSpeed(s) },
                        highlighted = player.playbackSpeed == s
                    )
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

/**
 * 笔画分解图（与 web StrokeCell 一致）: 格子展示田字格+背景字+此前笔画墨色+当前笔画红色；
 * 点击在格子内循环播放该笔动画，再次点击停止
 */
@Composable
private fun StrokeDecomposition(
    strokes: List<CharStroke>,
    character: String,
    dark: Boolean,
    playingIndex: Int,
    playingProgress: Float,
    onTogglePlay: (Int) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
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
                            .clickable { onTogglePlay(index) }
                            .padding(2.dp)
                    ) {
                        StrokeCellCanvas(
                            strokes = strokes,
                            index = index,
                            character = character,
                            dark = dark,
                            progress = if (index == playingIndex) playingProgress else null,
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
                // 补齐空位，保证各行格子大小一致
                repeat(4 - row.size) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

// ---- 小型按钮（与 web btn-sm 相近，避免 Material 默认按钮过大） ----

@Composable
private fun SmallButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    primary: Boolean = false
) {
    val shape = RoundedCornerShape(6.dp)
    val bg = if (primary) MaterialTheme.colorScheme.primary else Color.Transparent
    val fg = if (primary) MaterialTheme.colorScheme.onPrimary
    else if (enabled) MaterialTheme.colorScheme.onSurface
    else MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        text = text,
        color = fg.copy(alpha = if (enabled) 1f else 0.5f),
        style = MaterialTheme.typography.bodyMedium,
        modifier = modifier
            .clip(shape)
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick)
            .border(
                width = 1.dp,
                color = if (primary) Color.Transparent else MaterialTheme.colorScheme.outlineVariant,
                shape = shape
            )
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

@Composable
private fun SmallTextButton(
    text: String,
    onClick: () -> Unit,
    highlighted: Boolean = false,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        color = if (highlighted) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodySmall,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 4.dp)
    )
}

// ---- 信息行（与 web 内联布局一致） ----

@Composable
private fun InlineInfoItem(
    label: String,
    value: String,
    onCopy: (() -> Unit)? = null,
    copied: Boolean = false
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        if (onCopy != null) {
            Spacer(Modifier.width(2.dp))
            SmallTextButton(text = if (copied) "已复制" else "复制", onClick = onCopy)
        }
    }
}

@Composable
private fun DividerDot() {
    Text(
        text = "|",
        color = MaterialTheme.colorScheme.outlineVariant
    )
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

// 分解图单笔循环播放间隔（与 web StrokeCell 循环等待一致）
private const val CELL_LOOP_GAP_MS = 400L
