package org.crazydan.studio.app.hanzi.ui

import android.content.Context

/** 笔画数据库访问位置存储（SharedPreferences，与 MainActivity 共用 prefs 文件） */
actual object StrokeDbStore {

    private const val PREFS_NAME = "hanzi_prefs"
    private const val KEY = "hanzi_stroke_db_path"

    private fun prefs(): android.content.SharedPreferences? {
        val context = AppContextHolder.appContext ?: return null
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    actual fun load(): String? = prefs()?.getString(KEY, null)

    actual fun save(path: String?) {
        prefs()?.edit()?.let {
            if (path == null) it.remove(KEY) else it.putString(KEY, path)
            it.apply()
        }
    }
}
