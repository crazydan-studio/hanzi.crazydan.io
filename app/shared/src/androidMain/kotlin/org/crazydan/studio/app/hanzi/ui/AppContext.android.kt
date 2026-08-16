package org.crazydan.studio.app.hanzi.ui

import android.content.Context

/** 应用上下文持有者（MainActivity 初始化时经 [Platform.init] 注入，供各平台能力使用） */
internal object AppContextHolder {
    var appContext: Context? = null
        set(value) {
            field = value?.applicationContext
        }
}
