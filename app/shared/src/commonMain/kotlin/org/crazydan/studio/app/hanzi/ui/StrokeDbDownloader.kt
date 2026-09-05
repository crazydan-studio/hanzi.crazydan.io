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
 * 笔画数据在线下载/导入任务:
 *  - 全局单例持有任务状态，页面退出再进入时任务不中断，遮罩与结果提示持续生效
 *  - 点击数据规模卡片后自动下载对应笔画数据库并经 [HanziDb.importStrokeDb] 导入；
 *    任务期间系统返回键被禁用（见 MainActivity.BackHandler），成功/失败后由页面提示
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

    /** 当前是否有进行中的任务（页面据此禁止系统返回/显示遮罩） */
    val isWorking: Boolean
        get() = state is State.Working

    /** 开始下载并导入指定规模的笔画数据库（任务中重复调用忽略） */
    fun start(scale: String, db: HanziDb) {
        if (state is State.Working) return
        // 同步置位后再启动协程，避免同一帧内重复调用并发启动两个任务
        state = State.Working(Phase.DOWNLOADING, scale)
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                Platform.downloadToFile(
                    SiteLinks.strokeDbDownloadUrl(Platform.appVersion(), scale),
                    "hanzi-stroke-$scale.db"
                )
            }
            val file = when (result) {
                is DownloadResult.Success -> result.path
                is DownloadResult.Failure -> {
                    state = State.Failed("笔画数据下载失败：${result.reason}")
                    return@launch
                }
            }
            state = State.Working(Phase.IMPORTING, scale)
            val ok = withContext(Dispatchers.Default) { db.importStrokeDb(file) }
            if (!ok) {
                state = State.Failed("笔画数据导入失败，请重试")
                // 清理下载的临时文件（导入失败后文件不再需要）
                withContext(Dispatchers.IO) { Platform.deleteDownloadedFile(file) }
                return@launch
            }
            // 导入成功后清理下载的临时文件
            withContext(Dispatchers.IO) { Platform.deleteDownloadedFile(file) }
            val info = withContext(Dispatchers.Default) { db.strokeDbStatus().info }
            if (info == null) {
                state = State.Failed("笔画数据已导入，但状态校验异常，请检查后重试")
            } else {
                state = State.Done(info)
            }
        }
    }

    /** 确认并关闭结果提示（成功/失败） */
    fun dismiss() {
        state = State.Idle
    }
}
