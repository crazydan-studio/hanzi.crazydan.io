package org.crazydan.studio.app.hanzi.ui

import android.content.Context
import android.content.SharedPreferences

/**
 * 应用上下文持有者（MainActivity 初始化时注入，供各平台能力使用）;
 * 应用模块（:android）与共享模块共用
 */
object AppContextHolder {
    var appContext: Context? = null
        set(value) {
            field = value?.applicationContext
        }

    /** 当前构建是否为可联网变体（MainActivity 经 Platform.init 注入） */
    var onlineVariant: Boolean = false

    /** 应用共享偏好（主题/内置库 hash 等，单一来源 "hanzi_prefs"） */
    val appPrefs: SharedPreferences?
        get() = appContext?.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private const val PREFS_NAME = "hanzi_prefs"
}
