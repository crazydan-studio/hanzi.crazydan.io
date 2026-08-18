package org.crazydan.studio.app.hanzi.ui

/**
 * Android 主题持久化: SharedPreferences
 */
actual object ThemeStore {

    actual fun load(): Boolean? {
        val prefs = AppContextHolder.appPrefs ?: return null
        return if (prefs.contains(KEY)) prefs.getBoolean(KEY, false) else null
    }

    actual fun save(dark: Boolean) {
        AppContextHolder.appPrefs?.edit()?.putBoolean(KEY, dark)?.apply()
    }

    private const val KEY = "dark_theme"
}
