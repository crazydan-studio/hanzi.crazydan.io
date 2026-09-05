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
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream

/** zdic.net 及其子域名 */
private const val ZDIC_HOST = "zdic.net"
private const val ZDIC_HOME = "https://zdic.net/"

private fun isZdic(uri: Uri?): Boolean {
    val host = uri?.host?.lowercase() ?: return false
    return host == ZDIC_HOST || host.endsWith(".$ZDIC_HOST")
}

// 仅放行 zdic.net 及其子域名; 主站链接强制 https
private fun safeZdicUrl(raw: String): String {
    val uri = Uri.parse(raw)
    val safe = if (isZdic(uri)) uri else Uri.parse(ZDIC_HOME)
    return safe.buildUpon().scheme("https").build().toString()
}

// 主题注入脚本: 经 evaluateJavascript 应用到页面（幂等，重复执行先移除旧样式）
// 暗色采用「整页反色 + 媒体元素二次反色还原」的通用方案（对任意站点有效，不依赖站点主题支持）;
// 明亮移除反色样式; color-scheme 让表单控件/滚动条等原生部件跟随主题
private fun themeScript(dark: Boolean): String {
    return "(function(){" +
        "var d=document.documentElement;" +
        "var old=document.getElementById('hanzi-theme');" +
        "if(old)old.remove();" +
        "d.style.colorScheme='" + (if (dark) "dark" else "light") + "';" +
        (if (dark)
            "var s=document.createElement('style');" +
                "s.id='hanzi-theme';" +
                "s.textContent='html{filter:invert(1) hue-rotate(180deg);background:#111 !important;}" +
                "img,video,picture,canvas{filter:invert(1) hue-rotate(180deg);}';" +
                "document.head.appendChild(s);"
        else "") +
        "})()"
}

/**
 * 受限 WebView（仅 Android）: 页面跳转与资源加载均限制在 zdic.net 及其子域名，
 * 外部域名导航被拦截、外部资源请求被取消;
 * 暗黑/明亮主题经 JS 注入页面样式跟随应用（切换即时生效，不重载页面）
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun ZdicWebView(url: String, dark: Boolean, modifier: Modifier) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    // 主题最新值（供 WebViewClient 回调读取——回调在非组合作用域，不能直接捕获组合参数）
    var darkNow by remember { mutableStateOf(dark) }
    SideEffect { darkNow = dark }
    // 主题切换即时重放注入脚本（不重载页面）
    LaunchedEffect(dark, webView) {
        webView?.evaluateJavascript(themeScript(dark), null)
    }

    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
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

                    // 页面加载完成后按当前主题注入样式
                    override fun onPageFinished(view: WebView, url: String?) {
                        view.evaluateJavascript(themeScript(darkNow), null)
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
