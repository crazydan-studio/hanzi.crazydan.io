package org.crazydan.studio.app.hanzi.ui

import android.graphics.Typeface
import android.util.Log
import androidx.compose.ui.text.font.FontFamily

/**
 * Android 中易楷体: 从内置 assets/fonts/ZhongYiKaiTi.ttf 加载（结果缓存复用）
 */
actual fun platformKaiTiFontFamily(): FontFamily {
    cachedFontFamily?.let { return it }
    val context = AppContextHolder.appContext
    val family = if (context != null) {
        try {
            FontFamily(Typeface.createFromAsset(context.assets, "fonts/ZhongYiKaiTi.ttf"))
        } catch (e: Exception) {
            Log.w(TAG, "加载中易楷体失败，回退系统字体", e)
            FontFamily.Default
        }
    } else {
        FontFamily.Default
    }
    cachedFontFamily = family
    return family
}

private const val TAG = "HanziTheme"
private var cachedFontFamily: FontFamily? = null
