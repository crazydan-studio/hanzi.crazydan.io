package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.CharEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.components.CharListGrid

/** 页面顶部栏（返回 + 标题 + 主题切换） */
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
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        TextButton(onClick = onBack) {
            Text("← 返回")
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.weight(1f)
        )
        TextButton(onClick = onToggleTheme) {
            Text(if (dark) "浅色" else "深色")
        }
    }
}

/**
 * 汉字列表页（常用字列表 / 拼音字列表共用的滚动网格）
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
    onOpenChar: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        TopBar(title = title, dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)

        when {
            loading -> Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
            ) {
                CircularProgressIndicator()
            }
            error != null -> Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(vertical = 24.dp)
            )
            entries.isEmpty() -> Text(
                text = emptyText,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(vertical = 24.dp)
            )
            else -> CharListGrid(
                entries = entries,
                columns = 6,
                onClick = { onOpenChar(it.character) },
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

/** 常用字列表页 */
@Composable
fun CommonsScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit,
    onOpenChar: (String) -> Unit
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

    CharListScreen(
        title = "常用字列表",
        emptyText = "暂无常用字数据",
        loading = entries == null && error == null,
        error = error,
        entries = entries ?: emptyList(),
        dark = dark,
        onToggleTheme = onToggleTheme,
        onBack = onBack,
        onOpenChar = onOpenChar
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
