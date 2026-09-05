package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import org.crazydan.studio.app.hanzi.shared.StrokeDbState
import org.crazydan.studio.app.hanzi.shared.StrokeDbStatus
import org.crazydan.studio.app.hanzi.ui.Gray400
import org.crazydan.studio.app.hanzi.ui.Gray500
import org.crazydan.studio.app.hanzi.ui.SiteLinks
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.InlineLinkText
import org.crazydan.studio.app.hanzi.ui.components.LoadingBox
import org.crazydan.studio.app.hanzi.ui.components.MixedFontText
import org.crazydan.studio.app.hanzi.ui.components.PrimaryButton
import org.crazydan.studio.app.hanzi.ui.components.SectionCard
import org.crazydan.studio.app.hanzi.ui.components.SectionCardHeader
import org.crazydan.studio.app.hanzi.ui.components.ThemeIconButton
import org.crazydan.studio.app.hanzi.ui.components.ZiGrid
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
    var strokeStatus by remember { mutableStateOf<StrokeDbStatus?>(null) }
    var strokeChecked by remember { mutableStateOf(false) }

    // 进入首页时不自动聚焦搜索框（避免弹出键盘）；常用字速览仅首次加载（缓存复用）
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) {
        focusManager.clearFocus()
        if (initialCommons == null) {
            val list = withContext(Dispatchers.Default) { db.queryCommons(HOME_COMMONS_LIMIT) }
            commons = list
            commonsLoading = false
            commonsError = list.isEmpty()
            onCommonsLoaded(list)
        }
        // 笔画数据库状态（重新进入首页时刷新）
        strokeStatus = withContext(Dispatchers.Default) { db.strokeDbStatus() }
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
            PrimaryButton(
                text = "查询",
                onClick = {
                    onSearch(query, onOpenZi, onOpenPinyin) { error = it }
                }
            )
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
                SectionCardHeader(
                    title = "常用字速览",
                    trailing = {
                        Text(
                            text = "查看全部常用字 →",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier
                                .clickable(onClick = onOpenCommons)
                                .padding(6.dp)
                        )
                    }
                )
                when {
                    commonsLoading -> LoadingBox(height = 120.dp)
                    commonsError -> Text(
                        text = "暂无常用字数据",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 20.dp)
                    )
                    else -> ZiGrid(
                        entries = commons,
                        columns = 5,
                        onClick = { onOpenZi(it.zi) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // 笔画数据（按需下载，避免占用过多存储空间）
            SectionCard {
                SectionCardHeader(
                    title = "笔画数据",
                    subtitle = "笔画数据为独立数据库，可按需下载不同规模的数据集，下载后导入即可使用",
                    trailing = {
                        PrimaryButton(
                            text = "管理",
                            onClick = onOpenStrokeManage
                        )
                    }
                )
                // 笔画数据说明: 已配置且完整时显示可访问规模；缺失/损坏时分别警示
                when {
                    !strokeChecked -> Unit
                    strokeStatus?.state == StrokeDbState.READY -> {
                        val info = strokeStatus?.info
                        Text(
                            text = if (info != null) {
                                "当前可访问 ${info.ziCount} 个汉字的笔画数据（共 ${info.strokeCount} 笔）。"
                            } else {
                                "笔画数据状态异常，建议重新导入。"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (info != null) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.error
                            },
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    strokeStatus?.state == StrokeDbState.INVALID -> Text(
                        text = "笔画数据无效或已损坏：汉字信息页暂无法显示笔画书写动画与笔画分解图，建议尽快重新导入。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    else -> Text(
                        text = "尚未导入笔画数据：汉字信息页暂无法显示笔画书写动画与笔画分解图，建议尽快管理导入。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }

            // 友情赞助
            SectionCard {
                SectionCardHeader(
                    title = "友情赞助",
                    subtitle = "支持本项目持续发展，让更多人免费使用汉字笔画数据",
                    trailing = {
                        PrimaryButton(
                            text = "去赞助",
                            onClick = onOpenDonate
                        )
                    }
                )
            }

            // 关于本站（内容与样式与 web 页一致; 文案颜色与「友情赞助」一致）
            SectionCard {
                // 子项文案颜色（与友情赞助文案一致: 次要色）
                val aboutTextStyle = MaterialTheme.typography.bodySmall.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                InlineLinkText(
                    text = "关于本站（汉字网）",
                    links = mapOf("汉字网" to SiteLinks.SITE),
                    style = MaterialTheme.typography.titleMedium
                )
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(top = 12.dp)
                ) {
                    AboutBlock("建站初心", dark) {
                        InlineLinkText(
                            text = "本站是「筷字输入法」的衍生项目，旨在汇总汉字信息与资源，并向公共领域免费提供高质量的汉字笔画数据，方便个人学习与课堂教学使用，为汉字的广泛传播与学习、增强汉字的世界影响力贡献一份力量。",
                            links = mapOf("筷字输入法" to SiteLinks.KUAII_IME),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("许可协议", dark) {
                        InlineLinkText(
                            text = "本站点（${SiteLinks.SITE}）所提供的资源和源代码，仅限用于个人学习、师生教学等非商业用途；商业使用本站点所提供的汉字笔画数据，需获得商业授权。本站点所提供的汉字信息数据、拼音音频文件来源于「汉典网」（${SiteLinks.ZDIC}），直接使用需遵从其「使用条款」。",
                            links = mapOf(
                                "汉典网" to SiteLinks.ZDIC,
                                "使用条款" to SiteLinks.ZDIC_TERMS
                            ),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("建议与意见", dark) {
                        InlineLinkText(
                            text = "若在使用过程中遇到任何问题，或有好的改进建议，欢迎在「Issues」页面提出，我们将积极回应，并尽可能解决相关疑难。",
                            links = mapOf(
                                "Issues" to SiteLinks.ISSUES
                            ),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("联系我们", dark) {
                        InlineLinkText(
                            text = "如有合作或商务需求，可发送邮件至 ${SiteLinks.SUPPORT_EMAIL}。",
                            links = mapOf("support@studio.crazydan.org" to "mailto:${SiteLinks.SUPPORT_EMAIL}"),
                            style = aboutTextStyle
                        )
                    }
                    AboutBlock("致谢", dark) {
                        InlineLinkText(
                            text = "感谢「汉典网」收集和提供的汉字详细信息。",
                            links = mapOf("汉典网" to SiteLinks.ZDIC),
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

// 首页常用字速览数量（与 web 首页 src/config.js HOME_COMMONS_COUNT 一致）
private const val HOME_COMMONS_LIMIT = 20

// 单个汉字判定（与 server/JS 端 src/config.js HANZI_SINGLE_RE 覆盖范围一致:
// CJK 基本区 + 扩展A 区 + 〇）
private val HANZI_RANGES = listOf(
    '\u3400'..'\u4dbf', '\u4e00'..'\u9fff'
)

private fun isHanziChar(c: Char): Boolean =
    c == '\u3007' || HANZI_RANGES.any { c in it }

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
        q.length == 1 && isHanziChar(q[0]) -> onOpenZi(q)
        q.all { it.lowercaseChar() in 'a'..'z' || it == 'ü' } -> onOpenPinyin(q.lowercase())
        else -> onError("请输入单个汉字或纯拼音（不带声调）")
    }
}
