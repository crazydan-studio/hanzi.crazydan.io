package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.CharEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.components.CharCell
import org.crazydan.studio.app.hanzi.ui.components.SectionCard

/**
 * 首页: 汉字/拼音查询 + 常用字速览 + 友情赞助/关于本站
 */
@Composable
fun HomeScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onOpenChar: (String) -> Unit,
    onOpenCommons: () -> Unit,
    onOpenPinyin: (String) -> Unit,
    onOpenDonate: () -> Unit
) {
    var query by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }

    var commons by remember { mutableStateOf<List<CharEntry>>(emptyList()) }
    var commonsLoading by remember { mutableStateOf(true) }
    var commonsError by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val list = withContext(Dispatchers.Default) { db.queryCommons(20) }
        commons = list
        commonsLoading = false
        commonsError = list.isEmpty()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        // 标题栏
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp)
        ) {
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onToggleTheme) {
                Text(if (dark) "浅色" else "深色")
            }
        }
        // 主标题
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 24.dp)
        ) {
            Text(
                text = "汉字",
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "传承千年的人类文明瑰宝",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp)
            )
        }

        // 查询区
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    error = ""
                },
                placeholder = { Text("示例：的 / de / lv") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    onSearch(query, onOpenChar, onOpenPinyin) { error = it }
                }),
                modifier = Modifier.weight(1f)
            )
            Button(onClick = {
                onSearch(query, onOpenChar, onOpenPinyin) { error = it }
            }) {
                Text("查询")
            }
        }
        Text(
            text = "仅可输入单个汉字或单个无声调拼音；拼音中的 ü 可用 v 代替（如 lv 等同于 lü）",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp)
        )
        if (error.isNotEmpty()) {
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        Spacer(Modifier.height(20.dp))

        // 常用字速览
        SectionCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
            ) {
                Text(
                    text = "常用字速览",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(Modifier.weight(1f))
                TextButton(onClick = onOpenCommons) {
                    Text("查看全部常用字 →")
                }
            }
            when {
                commonsLoading -> Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                ) {
                    CircularProgressIndicator()
                }
                commonsError -> Text(
                    text = "暂无常用字数据",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 20.dp)
                )
                else -> Column(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    commons.chunked(5).forEach { row ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            row.forEach { e ->
                                CharCell(
                                    entry = e,
                                    onClick = { onOpenChar(e.character) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            repeat(5 - row.size) {
                                Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }

        // 友情赞助
        SectionCard {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.weight(1f)) {
                    Text("友情赞助", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "支持本项目持续发展，让更多人免费使用汉字笔画数据",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                Spacer(Modifier.width(12.dp))
                Button(onClick = onOpenDonate) {
                    Text("去赞助")
                }
            }
        }

        // 关于本站
        SectionCard {
            Text("关于本站", style = MaterialTheme.typography.titleMedium)
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(top = 12.dp)
            ) {
                AboutBlock("建站初心") {
                    Text(
                        "本站是「筷字输入法」的衍生项目，旨在汇总汉字信息与资源，并向公共领域免费提供高质量的汉字笔画数据。",
                        style = MaterialTheme.typography.bodySmall
                    )
                    LinkText("筷字输入法", "https://github.com/crazydan-studio/kuaizi-ime")
                }
                AboutBlock("许可协议") {
                    Text(
                        "本站点所提供的资源和源代码，仅限用于个人学习、师生教学等非商业用途；商业使用本站点所提供的汉字笔画数据，需获得商业授权。",
                        style = MaterialTheme.typography.bodySmall
                    )
                    LinkText("汉典网", "https://zdic.net/")
                }
                AboutBlock("联系我们") {
                    LinkText("support@studio.crazydan.org", "mailto:support@studio.crazydan.org")
                }
                AboutBlock("致谢") {
                    LinkText("汉典网", "https://zdic.net/")
                }
            }
        }
    }
}

@Composable
private fun AboutBlock(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Column(Modifier.padding(top = 4.dp)) {
            content()
        }
    }
}

@Composable
private fun LinkText(text: String, url: String) {
    TextButton(onClick = { Platform.openUrl(url) }) {
        Text(text)
    }
}

// 查询路由: 单个汉字 → 汉字信息页；纯拼音（允许 ü）→ 拼音字列表页
private fun onSearch(
    raw: String,
    onOpenChar: (String) -> Unit,
    onOpenPinyin: (String) -> Unit,
    onError: (String) -> Unit
) {
    val q = raw.trim().replace("v", "ü")
    if (q.isEmpty()) return
    when {
        q.length == 1 && q[0] in '\u4e00'..'\u9fff' -> onOpenChar(q)
        q.all { it.lowercaseChar() in 'a'..'z' || it == 'ü' } -> onOpenPinyin(q.lowercase())
        else -> onError("请输入单个汉字或纯拼音（不带声调）")
    }
}
