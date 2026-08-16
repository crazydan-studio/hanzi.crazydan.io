package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.CharEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.CharCell

/** 页面顶部栏（返回 + 标题 + 主题切换图标） */
@Composable
fun TopBar(
    title: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 4.dp)
    ) {
        Text(
            text = "← 返回",
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .clickable(onClick = onBack)
                .padding(horizontal = 8.dp, vertical = 8.dp)
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            modifier = Modifier.weight(1f)
        )
        ThemeIconButton(dark = dark, onToggleTheme = onToggleTheme)
    }
}

/**
 * 汉字列表页（常用字列表 / 拼音字列表）: 整页滚动
 * （顶部栏/加载状态/网格/页脚均在 LazyVerticalGrid 内，随页面整体滚动）
 */
@Composable
fun CharListScreen(
    title: String,
    emptyText: String,
    loading: Boolean,
    error: String?,
    entries: List<CharEntry>,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenChar: (String) -> Unit,
    gridState: LazyGridState = rememberLazyGridState(),
    selectedCharacter: String = ""
) {
    // 回退定位: 滚动到已选中的汉字（如从汉字信息页返回），定位于顶部
    LaunchedEffect(entries, selectedCharacter) {
        val index = entries.indexOfFirst { it.character == selectedCharacter }
        if (index >= 0) {
            gridState.scrollToItem(index)
        }
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(6),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        state = gridState,
        // 顶部留白由 TopBar 自身提供（与汉字信息页等各页顶部占位一致，避免切换抖动）
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 8.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        // 顶部栏随页面滚动
        item(span = { GridItemSpan(maxLineSpan) }) {
            TopBar(title = title, dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)
        }

        when {
            loading -> item(span = { GridItemSpan(maxLineSpan) }) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                ) {
                    CircularProgressIndicator()
                }
            }
            error != null -> item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 24.dp)
                )
            }
            entries.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = emptyText,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 24.dp)
                )
            }
            else -> items(entries) { e ->
                CharCell(
                    entry = e,
                    onClick = { onOpenChar(e.character) },
                    selected = e.character == selectedCharacter
                )
            }
        }

        // 页脚随页面滚动
        item(span = { GridItemSpan(maxLineSpan) }) {
            AppFooter()
        }
    }
}

/** 常用字列表页（记录选中字，回退时自动定位） */
@Composable
fun CommonsScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenChar: (String) -> Unit,
    selected: String = ""
) {
    var entries by remember { mutableStateOf<List<CharEntry>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        entries = try {
            withContext(Dispatchers.Default) { db.queryCommons(1500) }
        } catch (e: Exception) {
            error = "常用字数据加载失败"
            null
        }
    }

    val list = entries ?: emptyList()
    CharListScreen(
        title = "常用字列表${if (list.isNotEmpty()) "（${list.size} 个）" else ""}",
        emptyText = "暂无常用字数据",
        loading = entries == null && error == null,
        error = error,
        entries = list,
        dark = dark,
        onToggleTheme = onToggleTheme,
        onBack = onBack,
        onOpenChar = onOpenChar,
        selectedCharacter = selected
    )
}

/** 拼音字列表页 */
@Composable
fun PinyinListScreen(
    db: HanziDb,
    pinyin: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenChar: (String) -> Unit
) {
    var entries by remember { mutableStateOf<List<CharEntry>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(pinyin) {
        entries = try {
            withContext(Dispatchers.Default) { db.queryPinyinList(pinyin) }
        } catch (e: Exception) {
            error = "拼音「$pinyin」数据加载失败"
            null
        }
    }

    val list = entries ?: emptyList()
    CharListScreen(
        title = "拼音「$pinyin」的汉字${if (list.isNotEmpty()) "（${list.size} 个）" else ""}",
        emptyText = "未找到拼音「$pinyin」的汉字",
        loading = entries == null && error == null,
        error = error,
        entries = list,
        dark = dark,
        onToggleTheme = onToggleTheme,
        onBack = onBack,
        onOpenChar = onOpenChar
    )
}
