package org.crazydan.studio.app.hanzi.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.crazydan.studio.app.hanzi.shared.HanziDb
import org.crazydan.studio.app.hanzi.shared.StrokeDbInfo

/**
 * 笔画数据在线下载/导入任务（仅联网变体使用）:
 *  - 全局单例持有任务状态，页面退出再进入时任务不中断，遮罩与结果提示持续生效
 *  - 点击数据规模卡片后自动下载对应笔画数据库并经 [HanziDb.importStrokeDb] 导入；
 *    任务期间禁止其他操作，成功/失败后由页面提示
 */
object StrokeDbDownloader {

    enum class Phase { DOWNLOADING, IMPORTING }

    sealed interface State {
        /** 空闲（或结果已确认） */
        data object Idle : State

        /** 下载/导入进行中（页面据此显示全屏等待遮罩） */
        data class Working(val phase: Phase, val scale: String) : State

        /** 下载并导入成功（携带导入规模信息） */
        data class Done(val info: StrokeDbInfo) : State

        /** 下载或导入失败 */
        data class Failed(val message: String) : State
    }

    var state by mutableStateOf<State>(State.Idle)
        private set

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** 当前是否有进行中的任务（退出页面再进入时据此恢复遮罩） */
    val isWorking: Boolean
        get() = state is State.Working

    /** 开始下载并导入指定规模的笔画数据库（任务中重复调用忽略） */
    fun start(scale: String, db: HanziDb) {
        if (state is State.Working) return
        scope.launch {
            state = State.Working(Phase.DOWNLOADING, scale)
            val file = withContext(Dispatchers.IO) {
                Platform.downloadToFile(
                    "${SiteLinks.STROKE_DB_DOWNLOAD}$scale.db",
                    "hanzi-stroke-$scale.db"
                )
            }
            if (file == null) {
                state = State.Failed("笔画数据下载失败，请检查网络后重试")
                return@launch
            }
            state = State.Working(Phase.IMPORTING, scale)
            val ok = withContext(Dispatchers.Default) { db.importStrokeDb(file) }
            state = if (ok) {
                // 导入成功后清理下载的临时文件
                withContext(Dispatchers.IO) { Platform.deleteDownloadedFile(file) }
                val info = withContext(Dispatchers.Default) { db.strokeDbStatus().info }
                State.Done(info ?: StrokeDbInfo(0, 0))
            } else {
                State.Failed("笔画数据导入失败，请重试")
            }
        }
    }

    /** 确认并关闭结果提示（成功/失败） */
    fun dismiss() {
        state = State.Idle
    }
}
