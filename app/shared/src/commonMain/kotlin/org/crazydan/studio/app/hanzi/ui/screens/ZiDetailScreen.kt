package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.ZiMeta
import org.crazydan.studio.app.hanzi.shared.ZiStroke
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.HanziLabels
import org.crazydan.studio.app.hanzi.shared.Pinyin
import org.crazydan.studio.app.hanzi.shared.unicodePointAt
import org.crazydan.studio.app.hanzi.ui.Blue500
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.logError
import org.crazydan.studio.app.hanzi.ui.SiteLinks
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.LoadingBox
import org.crazydan.studio.app.hanzi.ui.components.BugReportIcon
import org.crazydan.studio.app.hanzi.ui.components.OpenInNewIcon
import org.crazydan.studio.app.hanzi.ui.components.SectionCard
import org.crazydan.studio.app.hanzi.ui.components.ThemeIconButton
import org.crazydan.studio.app.hanzi.ui.components.TopBar
import org.crazydan.studio.app.hanzi.ui.components.TradBadge
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
fun ZiDetailScreen(
    db: HanziDb,
    zi: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenStrokeManage: () -> Unit,
    onOpenDonate: () -> Unit
) {
    val unicode = unicodePointAt(zi)
    var meta by remember { mutableStateOf<ZiMeta?>(null) }
    var strokes by remember { mutableStateOf<List<ZiStroke>?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var audioHint by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf<String?>(null) }
    // 笔画分解图单笔播放（与 web 一致）: 在格子自身内循环播放，点击停止或继续
    var cellPlayIndex by remember { mutableIntStateOf(-1) }
    var cellProgress by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(zi) {
        loading = true
        error = null
        try {
            val m = withContext(Dispatchers.Default) { db.queryZiMeta(unicode) }
            val s = withContext(Dispatchers.Default) { db.queryZiStrokes(unicode) }
            meta = m
            strokes = s
        } catch (e: Exception) {
            logError("ZiDetailScreen", "查询汉字信息失败: $zi", e)
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
            loading -> LoadingBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 32.dp)
            )
            error != null -> Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 32.dp)
            )
            meta == null -> Text(
                text = "未找到汉字「$zi」的信息",
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 32.dp)
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
                        // 问题反馈（与 web 一致: 以当前汉字为标题/模板打开 GitHub Issues 新建页）
                        SmallTextButton(
                            text = "问题反馈",
                            icon = BugReportIcon,
                            onClick = {
                                val title = "【问题字】【${m.zi}】"
                                val body = "【${m.zi}】字存在以下问题或需做以下改进：\n\n"
                                Platform.openUrl(
                                    SiteLinks.ISSUES +
                                        "/new?title=${encodeUrl(title)}&body=${encodeUrl(body)}"
                                )
                            }
                        )
                        SmallTextButton(
                            text = "汉典网详情",
                            icon = OpenInNewIcon,
                            onClick = {
                                Platform.openUrl("${SiteLinks.ZDIC}hans/${encodeUrl(m.zi)}")
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
                            Box(
                                modifier = if (m.isTraditional) Modifier.padding(end = 20.dp) else Modifier
                            ) {
                                Text(
                                    text = m.zi,
                                    style = MaterialTheme.typography.displayMedium,
                                    fontFamily = KaiTiFontFamily,
                                    modifier = Modifier.padding(end = 10.dp)
                                )
                                if (m.isTraditional) {
                                    TradBadge(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .offset(x = 6.dp)
                                    )
                                }
                            }
                            SmallButton(
                                text = if (copied == "zi") "已复制" else "复制",
                                onClick = {
                                    Platform.copyToClipboard(m.zi)
                                    flashCopied(scope, "zi") { copied = it }
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
                                    shape = RoundedCornerShape(14.dp),
                                    color = MaterialTheme.colorScheme.surface,
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 5.dp, bottom = 5.dp)
                                    ) {
                                        Text(
                                            text = display,
                                            style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Default),
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Spacer(Modifier.width(4.dp))
                                        SmallTextButton(
                                            text = "试听",
                                            highlighted = true,
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
                        zi = m.zi,
                        dark = dark,
                        onOpenStrokeManage = onOpenStrokeManage
                    )
                }

                // 笔画分解图（格子内单笔动画）
                SectionCard(modifier = Modifier.padding(top = 12.dp)) {
                    Text("笔画分解图", style = MaterialTheme.typography.titleMedium)
                    if (strokeList.isNotEmpty()) {
                        // 仅在有笔画数据时提示动画触发方式（与 web 一致）
                        Text(
                            "点击任一笔画分解图即可在该格内播放该笔画的书写动画",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    if (strokeList.isEmpty()) {
                        Text(
                            text = "该汉字暂无笔画数据",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                        // 缺失笔画数据: 提供管理入口（下载/指定笔画数据库）
                        Text(
                            text = "前往管理笔画数据 →",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clickable(onClick = onOpenStrokeManage)
                                .padding(bottom = 4.dp)
                        )
                    } else {
                        StrokeDecomposition(
                            strokes = strokeList,
                            zi = m.zi,
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
    strokes: List<ZiStroke>,
    zi: String,
    dark: Boolean,
    onOpenStrokeManage: () -> Unit
) {
    val player = rememberWritingPlayer(strokes)

    // 播放（含暂停）期间实时显示当前笔画名（未指定类型显示「未指定」）
    val strokeName = if (player.state == WritingPlayer.State.PLAYING ||
        player.state == WritingPlayer.State.PAUSED
    ) {
        strokes.getOrNull(player.currentIndex)?.let { s ->
            HanziLabels.strokeTypeName(s.strokeType)
        }
    } else {
        null
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        // 田字格容器: 笔画名提示以悬浮层置于田字格上方（不占布局，不引起位置/尺寸抖动）
        // 尺寸上限兼顾展示与字体缓存: 背景字光栅尺寸 = 画布×0.92，超出 Skia 字体缓存
        // （约 1024px）会报 "Font size too large to fit in cache" 导致背景字不显示
        // （尤其高密度/横屏下）; 上限 1065px（980/0.92）按密度换算为 dp，
        // 尽量贴近 web 的 500dp 展示尺寸（高密度下稍小，笔画随之等比缩放）
        // 注意: widthIn 须在 fillMaxWidth 之前（fill 会强制取完整可用宽度，覆盖内部上限）
        val density = LocalDensity.current.density
        val maxCanvas = (1065f / density).coerceAtMost(500f).dp
        Box(
            modifier = Modifier
                .widthIn(max = maxCanvas)
                .fillMaxWidth()
        ) {
            WritingAnimationCanvas(
                strokes = strokes,
                zi = zi,
                dark = dark,
                player = player,
                modifier = Modifier.fillMaxWidth()
            )
            strokeName?.let { name ->
                Text(
                    text = name,
                    color = if (dark) Color(0xFF111827) else Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (dark) Color(0xCCF3F4F6) else Color(0xB3111827)
                        )
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                )
            }
        }

        if (strokes.isNotEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.padding(top = 12.dp)
            ) {
                // 播放/暂停切换（合并按钮两种状态）
                SmallButton(
                    text = when (player.state) {
                        WritingPlayer.State.PLAYING -> "暂停"
                        WritingPlayer.State.COMPLETED -> "重播"
                        else -> "播放"
                    },
                    primary = player.state != WritingPlayer.State.PLAYING,
                    onClick = {
                        Platform.stopPinyin()
                        if (player.state == WritingPlayer.State.PLAYING) player.pause()
                        else player.play()
                    }
                )
                SmallButton(text = "重置", onClick = {
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
            Column {
                Text(
                    text = "该汉字暂无笔画数据，不支持播放笔画书写动画",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 10.dp)
                )
                // 缺失笔画数据: 提供管理入口（下载/指定笔画数据库）
                Text(
                    text = "前往管理笔画数据 →",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clickable(onClick = onOpenStrokeManage)
                        .padding(top = 4.dp)
                )
            }
        }
    }
}

/**
 * 笔画分解图（与 web StrokeCell 一致）: 格子展示田字格+背景字+此前笔画墨色+当前笔画红色；
 * 点击在格子内循环播放该笔动画，再次点击停止
 */
@Composable
private fun StrokeDecomposition(
    strokes: List<ZiStroke>,
    zi: String,
    dark: Boolean,
    playingIndex: Int,
    playingProgress: Float,
    onTogglePlay: (Int) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(top = 12.dp)
    ) {
        // strokes 已按笔顺排序，逐行线性编号（第 N 笔）
        var index = 0
        strokes.chunked(4).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row.forEach { stroke ->
                    val strokeIndex = index++
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onTogglePlay(strokeIndex) }
                            .padding(2.dp)
                    ) {
                        StrokeCellCanvas(
                            strokes = strokes,
                            index = strokeIndex,
                            zi = zi,
                            dark = dark,
                            progress = if (strokeIndex == playingIndex) playingProgress else null,
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
                            text = "第 ${strokeIndex + 1} 笔",
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
    primary: Boolean = false
) {
    val shape = RoundedCornerShape(6.dp)
    // 主按钮颜色与 web 一致（bg-blue-500 白字，浅/暗主题相同，不随主题变浅）
    val bg = if (primary) Blue500 else Color.Transparent
    val fg = if (primary) Color.White else MaterialTheme.colorScheme.onSurface
    Text(
        text = text,
        color = fg,
        style = MaterialTheme.typography.bodyMedium,
        modifier = modifier
            .clip(shape)
            .background(bg)
            .clickable(onClick = onClick)
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
    icon: ImageVector? = null,
    modifier: Modifier = Modifier
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 4.dp)
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = if (highlighted) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(3.dp))
        }
        Text(
            text = text,
            color = if (highlighted) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall.copy(
                fontWeight = if (highlighted) FontWeight.Bold else FontWeight.Normal
            )
        )
    }
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

// 复制成功提示: 1.5s 后清除；连续复制时取消前一次定时（避免提前清除后一次的「已复制」）
private var copiedFlashJob: kotlinx.coroutines.Job? = null

private fun flashCopied(scope: CoroutineScope, key: String, set: (String?) -> Unit) {
    set(key)
    copiedFlashJob?.cancel()
    copiedFlashJob = scope.launch {
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
