package org.crazydan.studio.app.hanzi.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * 受限 WebView（Android 实现见 androidMain/RestrictedWebView.android.kt）:
 * 仅允许加载 zdic.net 及其子域名资源，用于在应用内展示「汉字详情」等外部页面;
 * 暗黑/明亮主题跟随应用（dark 时开启 WebView 强制暗色算法着色）
 */
@Composable
expect fun ZdicWebView(url: String, dark: Boolean, modifier: Modifier = Modifier)
