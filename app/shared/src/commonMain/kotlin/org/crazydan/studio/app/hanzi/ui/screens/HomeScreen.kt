package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.ZiEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.Blue500
import org.crazydan.studio.app.hanzi.ui.Gray400
import org.crazydan.studio.app.hanzi.ui.Gray500
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.ZiCell
import org.crazydan.studio.app.hanzi.ui.components.DarkModeIcon
import org.crazydan.studio.app.hanzi.ui.components.InlineLinkText
import org.crazydan.studio.app.hanzi.ui.components.LightModeIcon
import org.crazydan.studio.app.hanzi.ui.components.MixedFontText
import org.crazydan.studio.app.hanzi.ui.components.SectionCard
import org.crazydan.studio.app.hanzi.ui.logoPainter

/**
 * 首页: 汉字/拼音查询 + 常用字速览 + 友情赞助/关于本站
 */
@Composable
fun HomeScreen(
    db: HanziDb,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onOpenZi: (String) -> Unit,
    onOpenCommons: () -> Unit,
    onOpenPinyin: (String) -> Unit,
    onOpenStrokeManage: () -> Unit,
    onOpenDonate: () -> Unit,
    initialCommons: List<ZiEntry>? = null,
    onCommonsLoaded: (List<ZiEntry>?) -> Unit = {}
) {
    var query by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }

    var commons by remember { mutableStateOf(initialCommons ?: emptyList()) }
    var commonsLoading by remember { mutableStateOf(initialCommons == null) }
    var commonsError by remember { mutableStateOf(false) }

    // 笔画数据状态（进入首页时检查已配置的笔画数据库）
    var strokeInfo by remember { mutableStateOf<org.crazydan.studio.app.hanzi.shared.StrokeDbInfo?>(null) }
    var strokeChecked by remember { mutableStateOf(false) }

    // 进入首页时不自动聚焦搜索框（避免弹出键盘）；常用字速览仅首次加载（缓存复用）
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) {
        focusManager.clearFocus()
        if (initialCommons == null) {
            val list = withContext(Dispatchers.Default) { db.queryCommons(20) }
            commons = list
            commonsLoading = false
            commonsError = list.isEmpty()
            onCommonsLoaded(list)
        }
        // 笔画数据库状态（重新进入首页时刷新）
        strokeInfo = withContext(Dispatchers.Default) { db.strokeDbInfo() }
        strokeChecked = true
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
                .padding(top = 8.dp)
        ) {
            Spacer(Modifier.weight(1f))
            ThemeIconButton(dark = dark, onToggleTheme = onToggleTheme)
        }
        // 主标题（logo + 副标题）
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 24.dp)
        ) {
            Image(
                painter = logoPainter(),
                contentDescription = "汉字",
                modifier = Modifier.width(120.dp)
            )
            Text(
                text = "传承千年的人类文明瑰宝",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
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
                // 查询框内容（英文/拼音）用系统字体，避免楷体拉丁字形间距过大
                textStyle = TextStyle(fontFamily = FontFamily.Default),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    onSearch(query, onOpenZi, onOpenPinyin) { error = it }
                }),
                modifier = Modifier.weight(1f)
            )
            Button(
                // 与 web 一致: 深蓝主按钮（浅/暗主题相同，不随主题变浅）
                colors = ButtonDefaults.buttonColors(
                    containerColor = Blue500,
                    contentColor = Color.White
                ),
                onClick = {
                    onSearch(query, onOpenZi, onOpenPinyin) { error = it }
                }
            ) {
                Text("查询")
            }
        }
        // 提示说明（汉字用楷体，英文/拼音用系统字体，避免字符间隔过大）
        MixedFontText(
            text = "仅可输入单个汉字或单个无声调拼音；拼音中的 ü 可用 v 代替（如 lv 等同于 lü）",
            style = MaterialTheme.typography.labelSmall.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant
            ),
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

        // 内容面板（面板之间保持足够间隔）
        Column(
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(top = 20.dp)
        ) {
            // 常用字速览
            SectionCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "常用字速览",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        text = "查看全部常用字 →",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier
                            .clickable(onClick = onOpenCommons)
                            .padding(6.dp)
                    )
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
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 20.dp)
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
                                    ZiCell(
                                        entry = e,
                                        onClick = { onOpenZi(e.zi) },
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

            // 笔画数据（按需下载，避免占用过多存储空间）
            SectionCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("笔画数据", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "笔画数据为独立数据库，可按需下载不同规模的数据集，下载后指定存放位置即可使用",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Button(
                        // 与 web 一致: 深蓝主按钮
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Blue500,
                            contentColor = Color.White
                        ),
                        onClick = onOpenStrokeManage
                    ) {
                        Text("管理")
                    }
                }
                // 附加说明: 已配置且完整时显示可访问的汉字数量；缺失/无效时警示
                when {
                    !strokeChecked -> Unit
                    strokeInfo != null -> Text(
                        text = "当前可访问 ${strokeInfo!!.ziCount} 个汉字的笔画数据（共 ${strokeInfo!!.strokeCount} 笔）。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    else -> Text(
                        text = "尚未配置笔画数据库：汉字信息页暂无法显示笔画书写动画与笔画分解图，建议尽快管理下载。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp)
                    )
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
                    Button(
                        // 与 web 一致: 深蓝主按钮
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Blue500,
                            contentColor = Color.White
                        ),
                        onClick = onOpenDonate
                    ) {
                        Text("去赞助")
                    }
                }
            }

            // 关于本站（内容与样式与 web 页一致; 文案颜色与「友情赞助」一致）
            SectionCard {
                // 子项文案颜色（与友情赞助文案一致: 次要色）
                val aboutTextStyle = MaterialTheme.typography.bodySmall.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                InlineLinkText(
                    text = "关于本站（汉字网）",
                    links = mapOf("汉字网" to "https://hanzi.crazydan.io"),
                    style = MaterialTheme.typography.titleMedium
                )
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(top = 12.dp)
                ) {
                    AboutBlock("建站初心", dark) {
                        InlineLinkText(
                            text = "本站是「筷字输入法」的衍生项目，旨在汇总汉字信息与资源，并向公共领域免费提供高质量的汉字笔画数据，方便个人学习与课堂教学使用，为汉字的广泛传播与学习、增强汉字的世界影响力贡献一份力量。",
                            links = mapOf("筷字输入法" to "https://github.com/crazydan-studio/kuaizi-ime"),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("许可协议", dark) {
                        InlineLinkText(
                            text = "本站点（https://hanzi.crazydan.io）所提供的资源和源代码，仅限用于个人学习、师生教学等非商业用途；商业使用本站点所提供的汉字笔画数据，需获得商业授权。本站点所提供的汉字信息数据、拼音音频文件来源于「汉典网」（https://zdic.net/），直接使用需遵从其「使用条款」。",
                            links = mapOf(
                                "汉典网" to "https://zdic.net/",
                                "使用条款" to "https://zdic.net/terms/"
                            ),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("建议与意见", dark) {
                        InlineLinkText(
                            text = "若在使用过程中遇到任何问题，或有好的改进建议，欢迎在「Issues」页面提出，我们将积极回应，并尽可能解决相关疑难。",
                            links = mapOf(
                                "Issues" to "https://github.com/crazydan-studio/hanzi.crazydan.io/issues"
                            ),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("联系我们", dark) {
                        InlineLinkText(
                            text = "如有合作或商务需求，可发送邮件至 support@studio.crazydan.org",
                            links = mapOf("support@studio.crazydan.org" to "mailto:support@studio.crazydan.org"),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("致谢", dark) {
                        InlineLinkText(
                            text = "感谢「汉典网」收集和提供的汉字详细信息。",
                            links = mapOf("汉典网" to "https://zdic.net/"),
                            style = aboutTextStyle
                        )
                    }
                }
            }
        }

        AppFooter()
    }
}

@Composable
private fun AboutBlock(title: String, dark: Boolean, content: @Composable () -> Unit) {
    Column {
        // 子项标题: 加粗 + 颜色与 web 一致（text-gray-500 / dark:text-gray-400）
        Text(
            title,
            style = MaterialTheme.typography.titleSmall.copy(
                fontWeight = FontWeight.Bold,
                color = if (dark) Gray400 else Gray500
            )
        )
        Column(Modifier.padding(top = 4.dp)) {
            content()
        }
    }
}

/** 主题切换图标按钮（深色主题显示日/亮色图标，浅色主题显示月/暗色图标） */
@Composable
fun ThemeIconButton(dark: Boolean, onToggleTheme: () -> Unit) {
    IconButton(onClick = onToggleTheme) {
        Icon(
            imageVector = if (dark) LightModeIcon else DarkModeIcon,
            contentDescription = if (dark) "切换浅色" else "切换深色",
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// 查询路由: 单个汉字 → 汉字信息页；纯拼音（允许 ü）→ 拼音字列表页
private fun onSearch(
    raw: String,
    onOpenZi: (String) -> Unit,
    onOpenPinyin: (String) -> Unit,
    onError: (String) -> Unit
) {
    val q = raw.trim().replace("v", "ü")
    if (q.isEmpty()) return
    when {
        q.length == 1 && q[0] in '\u4e00'..'\u9fff' -> onOpenZi(q)
        q.all { it.lowercaseChar() in 'a'..'z' || it == 'ü' } -> onOpenPinyin(q.lowercase())
        else -> onError("请输入单个汉字或纯拼音（不带声调）")
    }
}
