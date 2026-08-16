package org.crazydan.studio.app.hanzi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.HanziDbFactory
import org.crazydan.studio.app.hanzi.ui.AppNavigator
import org.crazydan.studio.app.hanzi.ui.HanziApp
import org.crazydan.studio.app.hanzi.ui.Platform
import java.io.File
import java.io.FileOutputStream

/**
 * 汉字 App 主界面（Compose Multiplatform 原生 UI）
 *  - 数据库 assets/db/hanzi.db 首次启动复制到应用私有目录（assets 为压缩存储，
 *    无法直接以 sqlite 打开），之后复用
 *  - 拼音读音等资源由 build/app-pack.sh 从 public/assets 拷贝内置
 */
class MainActivity : ComponentActivity() {

    private var db: HanziDb? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Platform.init(this)
        db = HanziDbFactory.open(copyDbIfNeeded().absolutePath)

        setContent {
            val navigator = remember { AppNavigator() }
            // 返回键: 页面内返回；无上一页时退出
            BackHandler {
                if (!navigator.back()) {
                    finish()
                }
            }
            HanziApp(
                db = db!!,
                navigator = navigator,
                onExit = { finish() }
            )
        }
    }

    // 数据库首次使用时从 assets 复制到 filesDir/db/（校验完整性，避免半写文件）
    private fun copyDbIfNeeded(): File {
        val dir = File(filesDir, "db")
        dir.mkdirs()
        val dest = File(dir, DB_NAME)
        if (dest.exists()) return dest

        val tmp = File(dir, "$DB_NAME.tmp")
        assets.open("$DB_ASSET_DIR/$DB_NAME").use { input ->
            FileOutputStream(tmp).use { output -> input.copyTo(output) }
        }
        tmp.renameTo(dest)
        return dest
    }

    override fun onDestroy() {
        db?.close()
        db = null
        super.onDestroy()
    }

    companion object {
        private const val DB_NAME = "hanzi.db"
        private const val DB_ASSET_DIR = "db"
    }
}
