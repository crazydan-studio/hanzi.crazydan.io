package org.crazydan.studio.app.hanzi.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import org.crazydan.studio.app.hanzi.shared.CharEntry
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.ui.screens.CharDetailScreen
import org.crazydan.studio.app.hanzi.ui.screens.CommonsScreen
import org.crazydan.studio.app.hanzi.ui.screens.DonateScreen
import org.crazydan.studio.app.hanzi.ui.screens.HomeScreen
import org.crazydan.studio.app.hanzi.ui.screens.PinyinListScreen

/** 页面 */
sealed interface Screen {
    data object Home : Screen
    data class CharDetail(val character: String) : Screen
    data object Commons : Screen
    data class PinyinList(val pinyin: String) : Screen
    data object Donate : Screen
}

/** 页面导航（简单返回栈；列表滚动位置随导航器保持，回退时恢复） */
class AppNavigator(initial: Screen = Screen.Home) {
    var screen by mutableStateOf(initial)
        private set
    private val stack = ArrayDeque<Screen>()

    /** 常用字列表选中字（从汉字信息页回退后高亮） */
    var commonsSelected by mutableStateOf("")

    /** 拼音字列表选中字（从汉字信息页回退后高亮） */
    var pinyinSelected by mutableStateOf("")

    /** 常用字/拼音字列表滚动位置（跨页面切换保持，回退后恢复） */
    val commonsGridState = LazyGridState()
    val pinyinGridState = LazyGridState()

    /**
     * 列表数据缓存（跨页面切换保持）: 回退时列表立即以缓存数据渲染，
     * 网格内容不经历"加载中"收缩，滚动位置得以原样恢复（否则会被钳制归零）
     */
    var commonsEntries: List<CharEntry>? = null
    val pinyinEntries = mutableMapOf<String, List<CharEntry>?>()

    fun open(screen: Screen) {
        stack.addLast(this.screen)
        this.screen = screen
    }

    /** 返回上一页; 无上一页时返回 false（宿主处理退出） */
    fun back(): Boolean {
        if (stack.isEmpty()) return false
        screen = stack.removeLast()
        return true
    }

    /** 返回首页（清空返回栈） */
    fun toHome() {
        stack.clear()
        screen = Screen.Home
    }
}

/**
 * 汉字 App 根组件（原生 Compose UI，替代原 WebView 方案）
 * @param onRendered 首页完成首帧渲染后的回调（开屏据此淡出）
 */
@Composable
fun HanziApp(
    db: HanziDb,
    navigator: AppNavigator,
    onExit: () -> Unit,
    onRendered: () -> Unit = {}
) {
    // 首页首次组合后通知宿主（开屏等待此信号再淡出）
    LaunchedEffect(Unit) {
        onRendered()
    }

    val systemDark = isSystemInDarkTheme()
    // 主题持久化: 已保存的设置为准，未设置时跟随系统
    var darkTheme by remember { mutableStateOf(ThemeStore.load() ?: systemDark) }
    val toggleTheme: () -> Unit = {
        darkTheme = !darkTheme
        ThemeStore.save(darkTheme)
    }

    HanziTheme(darkTheme = darkTheme) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            when (val s = navigator.screen) {
                is Screen.Home -> HomeScreen(
                    db = db,
                    dark = darkTheme,
                    onToggleTheme = toggleTheme,
                    onOpenChar = { navigator.open(Screen.CharDetail(it)) },
                    onOpenCommons = { navigator.open(Screen.Commons) },
                    onOpenPinyin = { navigator.open(Screen.PinyinList(it)) },
                    onOpenDonate = { navigator.open(Screen.Donate) }
                )
                is Screen.CharDetail -> CharDetailScreen(
                    db = db,
                    character = s.character,
                    dark = darkTheme,
                    onToggleTheme = toggleTheme,
                    onBack = { navigator.back() },
                    onOpenDonate = { navigator.open(Screen.Donate) }
                )
                is Screen.Commons -> CommonsScreen(
                    db = db,
                    dark = darkTheme,
                    onToggleTheme = toggleTheme,
                    onBack = { navigator.back() },
                    onOpenChar = { char ->
                        // 记录选中字，返回本页时高亮
                        navigator.commonsSelected = char
                        navigator.open(Screen.CharDetail(char))
                    },
                    selected = navigator.commonsSelected,
                    gridState = navigator.commonsGridState,
                    initialEntries = navigator.commonsEntries,
                    onEntriesLoaded = { navigator.commonsEntries = it }
                )
                is Screen.PinyinList -> PinyinListScreen(
                    db = db,
                    pinyin = s.pinyin,
                    dark = darkTheme,
                    onToggleTheme = toggleTheme,
                    onBack = { navigator.back() },
                    onOpenChar = { char ->
                        // 记录选中字，返回本页时高亮
                        navigator.pinyinSelected = char
                        navigator.open(Screen.CharDetail(char))
                    },
                    selected = navigator.pinyinSelected,
                    gridState = navigator.pinyinGridState,
                    initialEntries = navigator.pinyinEntries[s.pinyin],
                    onEntriesLoaded = { navigator.pinyinEntries[s.pinyin] = it }
                )
                is Screen.Donate -> DonateScreen(
                    dark = darkTheme,
                    onToggleTheme = toggleTheme,
                    onBack = { navigator.back() }
                )
            }
        }
    }
}
