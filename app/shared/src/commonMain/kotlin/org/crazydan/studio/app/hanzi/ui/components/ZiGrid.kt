package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.crazydan.studio.app.hanzi.shared.ZiEntry
import org.crazydan.studio.app.hanzi.shared.Pinyin
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily

/**
 * 汉字网格（首页常用字速览 / 常用字列表 / 拼音字列表）
 * 格子内容: 上方读音（次要色小字），下方汉字（楷体风格大字）；
 * 繁体字在汉字右上角显示「繁」角标（琥珀配色）
 */

// 繁体角标配色（琥珀底 + 深色字，亮暗主题一致）
private val TradBadgeBackground = Color(0xFFFFE082)
private val TradBadgeForeground = Color(0xFF8D5A00)

/** 繁体字「繁」角标（叠加于汉字右上角） */
@Composable
fun TradBadge(modifier: Modifier = Modifier) {
    Text(
        text = "繁",
        color = TradBadgeForeground,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        lineHeight = 12.sp,
        modifier = modifier
            .background(TradBadgeBackground, RoundedCornerShape(3.dp))
            .padding(all = 1.dp)
    )
}

@Composable
fun ZiCell(
    entry: ZiEntry,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false
) {
    val shape = RoundedCornerShape(6.dp)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clip(shape)
            .background(
                if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                else Color.Transparent
            )
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp)
    ) {
        // 拼音用系统字体（楷体缺失 ā/ǚ 等声调字符，会回退字体导致字符间出现多余空白）
        Text(
            text = Pinyin.numberToSymbolTone(entry.pinyin),
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Default),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(2.dp))
        // 汉字矩形容器（汉字宽度 + 左右 padding，汉字在框内水平居中）;
        // 繁体角标浮动于容器右上角（悬出框角，不遮汉字）
        Box(
            modifier = Modifier.padding(horizontal = 8.dp)
        ) {
            Text(
                text = entry.zi,
                style = MaterialTheme.typography.headlineSmall,
                fontFamily = KaiTiFontFamily,
                color = MaterialTheme.colorScheme.onSurface
            )
            if (entry.isTraditional) {
                TradBadge(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 16.dp, y = (-2).dp)
                )
            }
        }
    }
}

/** 汉字网格（首页常用字速览 / 常用字列表 / 拼音字列表）: 固定列数、行末空位补齐 */
@Composable
fun ZiGrid(
    entries: List<ZiEntry>,
    columns: Int,
    onClick: (ZiEntry) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = modifier
    ) {
        entries.chunked(columns).forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row.forEach { e ->
                    ZiCell(
                        entry = e,
                        onClick = { onClick(e) },
                        modifier = Modifier.weight(1f)
                    )
                }
                repeat(columns - row.size) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}
