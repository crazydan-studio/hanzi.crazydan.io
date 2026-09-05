package org.crazydan.studio.app.hanzi.ui

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Build
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
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

/**
 * 受限 WebView（仅 Android）: 页面跳转与资源加载均限制在 zdic.net 及其子域名，
 * 外部域名导航被拦截、外部资源请求被取消; 暗黑主题经 WebView 强制暗色算法着色跟随应用
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun ZdicWebView(url: String, dark: Boolean, modifier: Modifier) {
    key(dark) {
        AndroidView(
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    applyDarkMode(dark)
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
                    }
                    loadUrl(safeZdicUrl(url))
                }
            },
            modifier = modifier
        )
    }
}

// 强制暗色: Android 10+ 支持 WebView 算法暗色（forceDark，高版本标记弃用但可用）;
// 更低版本不支持算法暗色（页面保持原样）
private fun WebView.applyDarkMode(dark: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        @Suppress("DEPRECATION")
        settings.forceDark = if (dark) WebSettings.FORCE_DARK_ON else WebSettings.FORCE_DARK_OFF
    }
}

private fun intercept(uri: Uri): WebResourceResponse? {
    return if (isZdic(uri)) null
    else WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
}
