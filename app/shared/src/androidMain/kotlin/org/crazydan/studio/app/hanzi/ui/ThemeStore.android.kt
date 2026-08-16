package org.crazydan.studio.app.hanzi.ui

import android.content.Context

/**
 * Android 主题持久化: SharedPreferences
 */
actual object ThemeStore {

    actual fun load(): Boolean? {
        val prefs = prefs() ?: return null
        return if (prefs.contains(KEY)) prefs.getBoolean(KEY, false) else null
    }

    actual fun save(dark: Boolean) {
        prefs()?.edit()?.putBoolean(KEY, dark)?.apply()
    }

    private fun prefs() =
        AppContextHolder.appContext?.getSharedPreferences("hanzi_prefs", Context.MODE_PRIVATE)

    private const val KEY = "dark_theme"
}
