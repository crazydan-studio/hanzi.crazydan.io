package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.ZiEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.LoadingBox
import org.crazydan.studio.app.hanzi.ui.components.TopBar
import org.crazydan.studio.app.hanzi.ui.components.ZiCell
import org.crazydan.studio.app.hanzi.ui.logError

/** 每页字数的可选分页大小 */
val PAGE_SIZE_OPTIONS = listOf(50, 100, 200)
val DEFAULT_PAGE_SIZE = 100

/**
 * 汉字列表页（常用字列表 / 拼音字列表）: 分页网格
 * （顶部栏/分页控件/网格/页脚均在 LazyVerticalGrid 内，随页面整体滚动）
 * 滚动位置由外部传入的 gridState 保持; 分页状态（页码/每页大小）由外部持有，
 * 返回本页时恢复所在页并定位/高亮选中字
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
    selectedZi: String = "",
    page: Int = 1,
    pageSize: Int = DEFAULT_PAGE_SIZE,
    onPageChange: (Int) -> Unit = {},
    onPageSizeChange: (Int) -> Unit = {}
) {
    // 分页切片（页码越界时钳制并回写，保持外部状态一致）
    val total = entries.size
    val totalPages = if (total == 0) 1 else (total + pageSize - 1) / pageSize
    val safePage = page.coerceIn(1, totalPages)
    LaunchedEffect(safePage, page) {
        if (safePage != page) onPageChange(safePage)
    }
    val start = (safePage - 1) * pageSize
    val pageEntries = if (total == 0) emptyList()
    else entries.subList(start, minOf(start + pageSize, total))

    // 返回本页时定位到选中字所在格子（其在网格中的条目序号 = 顶部栏 + 分页条 + 页内序号）
    LaunchedEffect(selectedZi, safePage, pageSize) {
        if (selectedZi.isEmpty() || pageEntries.isEmpty()) return@LaunchedEffect
        val idx = pageEntries.indexOfFirst { it.zi == selectedZi }
        if (idx == -1) return@LaunchedEffect
        val target = 2 + idx   // 0 = 顶部栏, 1 = 分页条
        val visible = gridState.layoutInfo.visibleItemsInfo.any { it.index == target }
        if (!visible) gridState.scrollToItem(target)
    }

    // 手动翻页（无选中字定位时）回到页首
    LaunchedEffect(safePage) {
        if (selectedZi.isEmpty()) gridState.scrollToItem(1)
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
            else -> {
                // 分页控件（网格条目序号 1）
                item(span = { GridItemSpan(maxLineSpan) }) {
                    PagerBar(
                        page = safePage,
                        totalPages = totalPages,
                        total = total,
                        pageStart = start + 1,
                        pageEnd = start + pageEntries.size,
                        pageSize = pageSize,
                        onPageChange = onPageChange,
                        onPageSizeChange = onPageSizeChange
                    )
                }
                items(pageEntries) { e ->
                    ZiCell(
                        entry = e,
                        onClick = { onOpenZi(e.zi) },
                        selected = e.zi == selectedZi
                    )
                }
            }
        }

        // 页脚随页面滚动
        item(span = { GridItemSpan(maxLineSpan) }) {
            AppFooter()
        }
    }
}

/** 分页文本按钮（选中态高亮加粗） */
@Composable
private fun PageTextButton(
    text: String,
    enabled: Boolean,
    active: Boolean = false,
    onClick: () -> Unit
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.textButtonColors(
            contentColor = if (active) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant
        ),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall.copy(
                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal
            )
        )
    }
}

/** 分页控件: 每页大小 / 上一页下一页 / 页码 / 跳转指定页 */
@Composable
private fun PagerBar(
    page: Int,
    totalPages: Int,
    total: Int,
    pageStart: Int,
    pageEnd: Int,
    pageSize: Int,
    onPageChange: (Int) -> Unit,
    onPageSizeChange: (Int) -> Unit
) {
    var jumpInput by remember(page) { mutableStateOf("") }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = "每页",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp, end = 2.dp)
            )
            PAGE_SIZE_OPTIONS.forEach { size ->
                PageTextButton(
                    text = "$size",
                    enabled = true,
                    active = size == pageSize,
                    onClick = { onPageSizeChange(size) }
                )
            }
            PageTextButton(text = "上一页", enabled = page > 1, onClick = { onPageChange(page - 1) })
            Text(
                text = "第 $page / $totalPages 页",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            PageTextButton(text = "下一页", enabled = page < totalPages, onClick = { onPageChange(page + 1) })
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "第 $pageStart-$pageEnd 字，共 $total 字",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "跳转",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = jumpInput,
                onValueChange = { v -> jumpInput = v.filter { it.isDigit() }.take(4) },
                placeholder = { Text(page.toString()) },
                singleLine = true,
                textStyle = TextStyle(fontFamily = FontFamily.Default),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Go
                ),
                modifier = Modifier.width(72.dp)
            )
            TextButton(onClick = {
                val n = jumpInput.toIntOrNull()
                if (n != null && n in 1..totalPages) onPageChange(n)
                jumpInput = ""
            }) {
                Text("前往")
            }
        }
    }
}

/** 常用字列表页（数据缓存、分页与滚动位置由外部保持，回退时恢复所在页并高亮选中字） */
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
    onEntriesLoaded: (List<ZiEntry>?) -> Unit = {},
    page: Int = 1,
    pageSize: Int = DEFAULT_PAGE_SIZE,
    onPageChange: (Int) -> Unit = {},
    onPageSizeChange: (Int) -> Unit = {}
) {
    var entries by remember { mutableStateOf(initialEntries) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        if (entries == null) {
            entries = try {
                // 常用字全量列表（与笔画库「1500 字」规模对应的常用字集合，见 export-zi.js）
                withContext(Dispatchers.Default) { db.queryCommons(COMMONS_FULL_LIMIT) }
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
        selectedZi = selected,
        page = page,
        pageSize = pageSize,
        onPageChange = onPageChange,
        onPageSizeChange = onPageSizeChange
    )
}

/** 拼音字列表页（数据缓存、分页与滚动位置由外部保持，回退时恢复所在页并高亮选中字） */
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
    onEntriesLoaded: (List<ZiEntry>?) -> Unit = {},
    page: Int = 1,
    pageSize: Int = DEFAULT_PAGE_SIZE,
    onPageChange: (Int) -> Unit = {},
    onPageSizeChange: (Int) -> Unit = {}
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
        selectedZi = selected,
        page = page,
        pageSize = pageSize,
        onPageChange = onPageChange,
        onPageSizeChange = onPageSizeChange
    )
}

// 常用字全量列表数量（与 build/export-zi.js 的 DEFAULT_COUNT 一致）
private const val COMMONS_FULL_LIMIT = 1500
