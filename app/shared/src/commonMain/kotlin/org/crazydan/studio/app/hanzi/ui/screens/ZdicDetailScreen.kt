package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import org.crazydan.studio.app.hanzi.ui.ZdicWebView
import org.crazydan.studio.app.hanzi.ui.components.TopBar

/**
 * 汉字详情页（应用内 WebView 展示 zdic.net 的汉字详情）:
 * 仅允许加载 zdic.net 及其子域名资源（见 ZdicWebView）
 */
@Composable
fun ZdicDetailScreen(
    url: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .fillMaxWidth()
    ) {
        TopBar(title = "汉字详情", dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)
        ZdicWebView(
            url = url,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        )
    }
}
