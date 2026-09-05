package org.crazydan.studio.app.hanzi.ui

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream

/** zdic 域名（单一来源为 SiteLinks.ZDIC，此处仅取 host 部分用于白名单比对） */
private val ZDIC_HOST: String = Uri.parse(SiteLinks.ZDIC).host.orEmpty()

private fun isZdic(uri: Uri?): Boolean {
    val host = uri?.host?.lowercase() ?: return false
    return host == ZDIC_HOST || host.endsWith(".$ZDIC_HOST")
}

// 仅放行 zdic.net 及其子域名; 主站链接强制 https
private fun safeZdicUrl(raw: String): String {
    val uri = Uri.parse(raw)
    val safe = if (isZdic(uri)) uri else Uri.parse(SiteLinks.ZDIC)
    return safe.buildUpon().scheme("https").build().toString()
}

// 主题注入脚本: 经 evaluateJavascript 应用到页面（幂等）
// 按常见约定在 <html> 上设置 data-theme 属性，由页面自身配色实现主题
// （暗色: data-theme="dark"; 明亮: 移除该属性，页面默认即明亮）;
// color-scheme 让表单控件/滚动条等原生部件跟随主题
private fun themeScript(dark: Boolean): String {
    return "(function(){" +
        "var d=document.documentElement;" +
        "if(" + dark + "){d.setAttribute('data-theme','dark');}" +
        "else{d.removeAttribute('data-theme');}" +
        "d.style.colorScheme='" + (if (dark) "dark" else "light") + "';" +
        "document.querySelectorAll('.adsbygoogle').forEach(n => n.remove());" +
        "})()"
}

// WebView 默认背景为白色——暗色主题下首帧/未填充区域会闪白，
// 按应用主题设置背景色（暗色取背景色 Gray900，与 App 背景一致）; 明亮保持白色
private fun themeBackgroundColor(dark: Boolean): Int =
    if (dark) Gray900.toArgb() else 0xFFFFFFFF.toInt()

/**
 * 受限 WebView（仅 Android）: 页面跳转与资源加载均限制在 zdic.net 及其子域名，
 * 外部域名导航被拦截、外部资源请求被取消;
 * 暗黑/明亮主题经 JS 在 <html> 上设置 data-theme 属性跟随应用（由页面自身配色实现）
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun ZdicWebView(
    url: String,
    dark: Boolean,
    modifier: Modifier,
    onLoading: (Boolean) -> Unit
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    // 主题最新值（供 WebViewClient 回调读取——回调在非组合作用域，不能直接捕获组合参数）
    var darkNow by remember { mutableStateOf(dark) }
    SideEffect { darkNow = dark }
    // 主题切换: 同步 WebView 背景色并即时重放注入脚本（不重载页面）
    LaunchedEffect(dark, webView) {
        webView?.let { view ->
            view.setBackgroundColor(themeBackgroundColor(dark))
            view.evaluateJavascript(themeScript(dark), null)
        }
    }

    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                // 首帧即用应用主题背景色，避免暗色下 WebView 默认白色闪屏
                setBackgroundColor(themeBackgroundColor(dark))
                // 页面导航序号: 每次导航递增，使上一页的延迟“隐藏遮罩”回调失效
                var pageToken = 0
                webViewClient = object : WebViewClient() {
                    // 页面导航: 仅 zdic 域名在应用内加载，其余拦截（不再跳转系统浏览器）
                    override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: WebResourceRequest
                    ): Boolean = !isZdic(request.url)

                    @Deprecated("Deprecated in Java")
                    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                        !isZdic(Uri.parse(url))

                    // 子资源（脚本/样式/图片等）: 仅放行 zdic 域名，其余返回空响应取消
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest
                    ): WebResourceResponse? = intercept(request.url)

                    @Deprecated("Deprecated in Java")
                    override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                        intercept(Uri.parse(url))

                    // 页面开始加载/完成渲染时上报（宿主据此显示/隐藏等待遮罩）
                    override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                        pageToken++   // 作废上一页延迟的“隐藏遮罩”回调
                        onLoading(true)
                        super.onPageStarted(view, url, favicon)
                    }

                    // 页面加载完成后注入当前主题; 注入为异步执行，须等页面按主题
                    // 重排重绘完成后再隐藏遮罩，否则默认（明亮）主题会闪现一瞬;
                    // 若期间已开始新的页面导航（token 变化），则不隐藏（新页仍加载中）
                    override fun onPageFinished(view: WebView, url: String?) {
                        val token = pageToken
                        view.evaluateJavascript(themeScript(darkNow)) {
                            view.postDelayed({ if (pageToken == token) onLoading(false) }, 500L)
                        }
                    }
                }
                loadUrl(safeZdicUrl(url))
            }
        },
        update = { webView = it },
        modifier = modifier
    )
}

private fun intercept(uri: Uri): WebResourceResponse? {
    return if (isZdic(uri)) null
    else WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
}
