package org.crazydan.studio.app.hanzi.ui

import android.content.Context
import androidx.activity.ComponentActivity

/** 应用上下文/宿主 Activity 持有者（MainActivity 初始化时注入，供各平台能力使用） */
internal object AppContextHolder {
    var appContext: Context? = null
        set(value) {
            field = value?.applicationContext
        }

    var appActivity: ComponentActivity? = null
}
