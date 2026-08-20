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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.ZiEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.LoadingBox
import org.crazydan.studio.app.hanzi.ui.components.ZiCell
import org.crazydan.studio.app.hanzi.ui.logError

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
 * 滚动位置由外部传入的 gridState 保持（跳转到汉字信息页再回退后恢复原位置），
 * 选中字仅高亮不做定位
 */
@Composable
fun ZiListScreen(
    title: String,
    emptyText: String,
    loading: Boolean,
    error: String?,
    entries: List<ZiEntry>,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenZi: (String) -> Unit,
    gridState: LazyGridState,
    selectedZi: String = ""
) {

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
                LoadingBox(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                )
            }
            error != null -> item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp)
                )
            }
            entries.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = emptyText,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp)
                )
            }
            else -> items(entries) { e ->
                ZiCell(
                    entry = e,
                    onClick = { onOpenZi(e.zi) },
                    selected = e.zi == selectedZi
                )
            }
        }

        // 页脚随页面滚动
        item(span = { GridItemSpan(maxLineSpan) }) {
            AppFooter()
        }
    }
}

/** 常用字列表页（数据缓存与滚动位置由外部保持，回退时原样恢复并高亮选中字） */
@Composable
fun CommonsScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenZi: (String) -> Unit,
    selected: String = "",
    gridState: LazyGridState,
    initialEntries: List<ZiEntry>? = null,
    onEntriesLoaded: (List<ZiEntry>?) -> Unit = {}
) {
    var entries by remember { mutableStateOf(initialEntries) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        if (entries == null) {
            entries = try {
                withContext(Dispatchers.Default) { db.queryCommons(1500) }
            } catch (e: Exception) {
                logError("ListScreen", "查询常用字列表失败", e)
                error = "常用字数据加载失败"
                null
            }
            onEntriesLoaded(entries)
        }
    }

    val list = entries ?: emptyList()
    ZiListScreen(
        title = "常用字列表${if (list.isNotEmpty()) "（${list.size} 个）" else ""}",
        emptyText = "暂无常用字数据",
        loading = entries == null && error == null,
        error = error,
        entries = list,
        dark = dark,
        onToggleTheme = onToggleTheme,
        onBack = onBack,
        onOpenZi = onOpenZi,
        gridState = gridState,
        selectedZi = selected
    )
}

/** 拼音字列表页（数据缓存与滚动位置由外部保持，回退时原样恢复并高亮选中字） */
@Composable
fun PinyinListScreen(
    db: HanziDb,
    pinyin: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenZi: (String) -> Unit,
    selected: String = "",
    gridState: LazyGridState,
    initialEntries: List<ZiEntry>? = null,
    onEntriesLoaded: (List<ZiEntry>?) -> Unit = {}
) {
    var entries by remember { mutableStateOf(initialEntries) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(pinyin) {
        if (entries == null) {
            entries = try {
                withContext(Dispatchers.Default) { db.queryPinyinList(pinyin) }
            } catch (e: Exception) {
                logError("ListScreen", "查询拼音字列表失败: $pinyin", e)
                error = "拼音「$pinyin」数据加载失败"
                null
            }
            onEntriesLoaded(entries)
        }
    }

    val list = entries ?: emptyList()
    ZiListScreen(
        title = "拼音「$pinyin」的汉字${if (list.isNotEmpty()) "（${list.size} 个）" else ""}",
        emptyText = "未找到拼音「$pinyin」的汉字",
        loading = entries == null && error == null,
        error = error,
        entries = list,
        dark = dark,
        onToggleTheme = onToggleTheme,
        onBack = onBack,
        onOpenZi = onOpenZi,
        gridState = gridState,
        selectedZi = selected
    )
}
