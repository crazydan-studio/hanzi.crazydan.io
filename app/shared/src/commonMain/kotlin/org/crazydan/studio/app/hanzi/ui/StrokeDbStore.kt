package org.crazydan.studio.app.hanzi.ui

/**
 * 笔画数据库访问位置存储（下载后由用户指定，跨启动持久化）
 * Android: SharedPreferences 实现；iOS 预留
 */
expect object StrokeDbStore {
    fun load(): String?
    fun save(path: String?)
}
