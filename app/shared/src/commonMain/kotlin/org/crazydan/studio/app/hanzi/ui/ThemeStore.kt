package org.crazydan.studio.app.hanzi.ui

/**
 * 主题设置持久化（Android: SharedPreferences; iOS 预留）
 *  - load() 返回 null 表示未设置，跟随系统主题
 */
expect object ThemeStore {

    fun load(): Boolean?

    fun save(dark: Boolean)
}
