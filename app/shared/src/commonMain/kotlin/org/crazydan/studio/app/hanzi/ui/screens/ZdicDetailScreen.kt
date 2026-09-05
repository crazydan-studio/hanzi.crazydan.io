package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import org.crazydan.studio.app.hanzi.ui.ZdicWebView
import org.crazydan.studio.app.hanzi.ui.components.LoadingBox
import org.crazydan.studio.app.hanzi.ui.components.TopBar

/**
 * 汉字详情页（应用内 WebView 展示 zdic.net 的汉字详情）:
 * 仅允许加载 zdic.net 及其子域名资源（见 ZdicWebView）;
 * 页面加载渲染期间显示等待遮罩（每次页面导航均覆盖）
 */
@Composable
fun ZdicDetailScreen(
    url: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    var loading by remember { mutableStateOf(true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .fillMaxWidth()
    ) {
        TopBar(title = "汉字详情", dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            ZdicWebView(
                url = url,
                dark = dark,
                onLoading = { loading = it },
                modifier = Modifier.fillMaxSize()
            )
            if (loading) {
                LoadingBox(
                    text = "正在加载…",
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                )
            }
        }
    }
}
