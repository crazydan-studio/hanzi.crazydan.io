package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.crazydan.studio.app.hanzi.shared.CharEntry
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily

/**
 * 汉字网格（首页常用字速览 / 常用字列表 / 拼音字列表）
 * 格子内容: 上方读音（次要色小字），下方汉字（楷体风格大字）
 */

@Composable
fun CharCell(
    entry: CharEntry,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp)
    ) {
        Text(
            text = entry.pinyin,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = entry.character,
            style = MaterialTheme.typography.headlineSmall,
            fontFamily = KaiTiFontFamily,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/** 首页常用字速览（少量条目，固定列数） */
@Composable
fun CharGrid(
    entries: List<CharEntry>,
    columns: Int,
    onClick: (CharEntry) -> Unit,
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
                    CharCell(
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

/** 常用字/拼音字完整列表（滚动网格） */
@Composable
fun CharListGrid(
    entries: List<CharEntry>,
    columns: Int,
    onClick: (CharEntry) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = modifier
    ) {
        items(entries) { e ->
            CharCell(entry = e, onClick = { onClick(e) })
        }
    }
}

/** 水平条目（汉字 + 读音，列表行样式） */
@Composable
fun CharRow(
    entry: CharEntry,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp)
    ) {
        Text(
            text = entry.character,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.width(48.dp)
        )
        Text(
            text = entry.pinyin,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
