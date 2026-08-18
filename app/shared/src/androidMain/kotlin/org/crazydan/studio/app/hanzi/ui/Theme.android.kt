package org.crazydan.studio.app.hanzi.ui

import android.graphics.Typeface
import androidx.compose.ui.text.font.FontFamily

/**
 * Android 中易楷体: 从内置 assets/font/ZhongYiKaiTi.ttf 加载（结果缓存复用）
 */
actual fun platformKaiTiFontFamily(): FontFamily {
    cachedFontFamily?.let { return it }
    val context = AppContextHolder.appContext
    val family = if (context != null) {
        try {
            FontFamily(Typeface.createFromAsset(context.assets, "font/ZhongYiKaiTi.ttf"))
        } catch (e: Exception) {
            FontFamily.Default
        }
    } else {
        FontFamily.Default
    }
    cachedFontFamily = family
    return family
}

private var cachedFontFamily: FontFamily? = null
