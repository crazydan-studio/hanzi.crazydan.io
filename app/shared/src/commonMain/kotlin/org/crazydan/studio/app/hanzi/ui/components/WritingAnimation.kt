package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.crazydan.studio.app.hanzi.shared.CharStroke
import org.crazydan.studio.app.hanzi.shared.StrokePoint
import org.crazydan.studio.app.hanzi.ui.Gray700
import org.crazydan.studio.app.hanzi.ui.Gray900
import org.crazydan.studio.app.hanzi.ui.Gray200
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily
import org.crazydan.studio.app.hanzi.ui.charRefColor
import org.crazydan.studio.app.hanzi.ui.strokeHighlightColor
import org.crazydan.studio.app.hanzi.ui.strokeInkColor
import org.crazydan.studio.app.hanzi.ui.tianZiGeColor

/**
 * 书写动画（移植自前端 AnimationEngine.js + StrokeBackground.js + Brush.js）
 *  - 田字格: 外框 + 米字格中央十字虚线（中心空心）
 *  - 背景汉字: 半透明参考字（统一字号、固定基线、居中）
 *  - 笔画: 按轨迹时间戳插值回放，笔触宽度随压力/起笔收笔变化；
 *    已完成笔画墨色、当前笔画高亮色
 */

// 笔画间停顿（毫秒，与前端 strokeGap 一致）
private const val STROKE_GAP_MS = 300f

// 轨迹坐标归一化系数（trajectory.js v7: x/y ×1000）
private const val COORD_SCALE = 1000f

// 基准笔宽（内部单位，与前端 BASE_WIDTH/penWidthCoef 组合一致）
private const val BASE_WIDTH = 4f
private const val PEN_WIDTH_COEF = 6f

/** 播放状态机（与 AnimationEngine.js 单一状态机对应） */
class WritingPlayer(private val strokes: List<CharStroke>) {

    enum class State { IDLE, PLAYING, PAUSED, COMPLETED }

    var state by mutableStateOf(State.IDLE)
        private set
    var currentIndex by mutableIntStateOf(0)
        private set
    var progress by mutableFloatStateOf(0f)   // 当前笔画内进度 0..1
        private set
    var playbackSpeed by mutableFloatStateOf(1f)

    /** 单笔播放模式: 当前笔画结束后立即停止（笔画分解图点击） */
    var singleStroke = false

    private var elapsedMs = 0f
    private var gapRemainingMs = 0f

    fun reset() {
        state = State.IDLE
        currentIndex = 0
        progress = 0f
        elapsedMs = 0f
        gapRemainingMs = 0f
    }

    fun play() {
        if (strokes.isEmpty()) return
        if (state == State.COMPLETED || currentIndex >= strokes.size) reset()
        if (state != State.PLAYING) {
            state = State.PLAYING
            progress = 0f
        }
    }

    fun pause() {
        if (state == State.PLAYING) state = State.PAUSED
    }

    fun setSpeed(value: Float) {
        playbackSpeed = value.coerceIn(0.25f, 4f)
    }

    /** 跳转到指定笔画（从该笔起点继续） */
    fun seekTo(index: Int) {
        if (strokes.isEmpty()) return
        val target = index.coerceIn(0, strokes.size - 1)
        val wasPlaying = state == State.PLAYING
        currentIndex = target
        progress = 0f
        elapsedMs = 0f
        gapRemainingMs = 0f
        state = if (wasPlaying) State.PLAYING else State.PAUSED
    }

    /** 帧推进: dtMs 为墙钟毫秒，速度在此内部应用（与前端 tick 一致） */
    fun tick(rawDtMs: Float, onComplete: () -> Unit) {
        if (state != State.PLAYING) return

        // 笔画间停顿（墙钟时间，不乘速度）
        if (gapRemainingMs > 0f) {
            gapRemainingMs -= rawDtMs
            return
        }

        // 全部完成
        if (currentIndex >= strokes.size) {
            state = State.COMPLETED
            onComplete()
            return
        }

        val stroke = strokes[currentIndex]
        val duration = strokeDuration(stroke.points)
        elapsedMs += rawDtMs * playbackSpeed

        if (elapsedMs >= duration) {
            progress = 1f
            currentIndex++
            // 单笔播放模式: 该笔结束即停止
            if (singleStroke || currentIndex >= strokes.size) {
                state = State.COMPLETED
                onComplete()
            } else {
                elapsedMs = 0f
                gapRemainingMs = STROKE_GAP_MS
                progress = 0f
            }
        } else {
            progress = elapsedMs / duration
        }
    }
}

// 笔画时长: 首尾点时间差（毫秒）；单点/无时长笔画取 200ms（与前端一致）
private fun strokeDuration(points: List<StrokePoint>): Float {
    if (points.size <= 1) return 200f
    val d = points.last().timestamp - points.first().timestamp
    return if (d > 0f) d else 200f
}

// 时间戳 → 位置插值（线性，与前端 interpolatePoint 一致）
private fun interpolatePoint(points: List<StrokePoint>, targetTime: Float): StrokePoint? {
    if (points.isEmpty()) return null
    if (points.size == 1) return points[0]
    if (targetTime <= points[0].timestamp) return points[0]
    val last = points.last()
    if (targetTime >= last.timestamp) return last
    for (i in 0 until points.size - 1) {
        val a = points[i]
        val b = points[i + 1]
        val span = b.timestamp - a.timestamp
        if (span <= 0f) continue
        if (targetTime >= a.timestamp && targetTime <= b.timestamp) {
            val t = (targetTime - a.timestamp) / span
            return StrokePoint(
                x = a.x + (b.x - a.x) * t,
                y = a.y + (b.y - a.y) * t,
                pressure = a.pressure + (b.pressure - a.pressure) * t,
                timestamp = targetTime
            )
        }
    }
    return last
}

// 笔触宽度: 压力因子 × 起笔顿笔/收笔出锋因子（简化版，与前端 computeBrushWidths 一致）
private fun brushWidths(points: List<StrokePoint>): List<Float> {
    val n = points.size
    if (n == 0) return emptyList()
    if (n == 1) return listOf(BASE_WIDTH * PEN_WIDTH_COEF)
    val headN = maxOf(2, (n * 0.12f).toInt())
    val tailN = maxOf(2, (n * 0.12f).toInt())
    val out = ArrayList<Float>(n)
    for (i in 0 until n) {
        val pressure = points[i].pressure.coerceIn(0f, 1f)
        val pressureFactor = 0.4f + 0.6f * pressure
        val headPos = (i.toFloat() / headN).coerceAtMost(1f)
        val headFactor = 1.35f - 0.35f * headPos
        val tailPos = ((n - 1 - i).toFloat() / tailN).coerceAtMost(1f)
        val tailFactor = 0.5f + 0.5f * tailPos
        val factor = if (i < headN && i >= n - tailN) headFactor
            else if (i < headN) headFactor
            else if (i >= n - tailN) tailFactor
            else 1f
        out.add(BASE_WIDTH * PEN_WIDTH_COEF * pressureFactor * factor)
    }
    // 5 点平滑（减少宽度抖动）
    return smooth(out)
}

private fun smooth(values: List<Float>): List<Float> {
    if (values.size < 3) return values
    val out = ArrayList<Float>(values.size)
    for (i in values.indices) {
        var sum = 0f
        var count = 0
        for (j in (i - 2).coerceAtLeast(0)..(i + 2).coerceAtMost(values.size - 1)) {
            sum += values[j]
            count++
        }
        out.add(sum / count)
    }
    return out
}

/** 播放状态持有者: 笔画列表变化时重建播放器并驱动帧循环（仅播放期间占用帧回调） */
@Composable
fun rememberWritingPlayer(strokes: List<CharStroke>): WritingPlayer {
    val player = remember(strokes) { WritingPlayer(strokes) }
    LaunchedEffect(player) {
        snapshotFlow { player.state }.collect { state ->
            if (state == WritingPlayer.State.PLAYING) {
                var lastNs = withFrameNanos { it }
                while (player.state == WritingPlayer.State.PLAYING) {
                    val now = withFrameNanos { it }
                    player.tick((now - lastNs) / 1_000_000f) {}
                    lastNs = now
                }
            }
        }
    }
    return player
}

/**
 * 书写动画画布: 田字格 + 背景汉字 + 笔画回放
 *  - player 为 null 时静态展示（全部笔画墨色绘制，无播放）
 */
@Composable
fun WritingAnimationCanvas(
    strokes: List<CharStroke>,
    character: String,
    dark: Boolean,
    modifier: Modifier = Modifier,
    player: WritingPlayer? = null,
    textMeasurer: TextMeasurer = rememberTextMeasurer()
) {
    val ink = strokeInkColor(dark)
    val highlight = strokeHighlightColor
    val border = tianZiGeColor(dark)
    val ref = charRefColor(dark)

    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Gray900 else Color.White)
            .border(1.dp, if (dark) Gray700 else Gray200, RoundedCornerShape(8.dp))
    ) {
        val unit = size.width / 500f   // 前端 500×500 内部坐标系缩放
        drawTianZiGe(border, unit)
        drawCharRef(character, ref, textMeasurer)

        val completed = if (player != null) player.currentIndex.coerceIn(0, strokes.size) else strokes.size
        for (i in 0 until completed) {
            drawFullStroke(strokes[i], ink, unit)
        }
        if (player != null && player.currentIndex < strokes.size) {
            val p = player.progress
            if (p > 0f && p < 1f) {
                drawPartialStroke(strokes[player.currentIndex], p, highlight, unit)
            }
        }
    }
}

/** 单笔静态小图（笔画分解图格子） */
@Composable
fun StrokeCellCanvas(
    stroke: CharStroke,
    dark: Boolean,
    modifier: Modifier = Modifier,
    textMeasurer: TextMeasurer = rememberTextMeasurer()
) {
    val ink = strokeInkColor(dark)
    val border = tianZiGeColor(dark)
    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(6.dp))
            .background(if (dark) Gray900 else Color.White)
            .border(1.dp, if (dark) Gray700 else Gray200, RoundedCornerShape(6.dp))
    ) {
        val unit = size.width / 500f
        drawTianZiGe(border, unit)
        drawFullStroke(stroke, ink, unit)
    }
}

// ---- 绘制实现 ----

private fun DrawScope.drawTianZiGe(border: Color, unit: Float) {
    val w = size.width
    val h = size.height
    val borderW = (1.5f * unit).coerceAtLeast(0.7f)
    val dashW = (1.2f * unit).coerceAtLeast(0.7f)
    val cx = w / 2f
    val cy = h / 2f
    val r = 10f * unit   // 中心空心半径

    // 外框
    drawRect(
        color = border,
        topLeft = Offset(0.5f, 0.5f),
        size = androidx.compose.ui.geometry.Size(w - 1f, h - 1f),
        style = Stroke(width = borderW)
    )
    // 米字格中央十字虚线（中心向四周发散的 4 条射线）
    val dash = PathEffect.dashPathEffect(floatArrayOf(9f * unit, 7f * unit))
    drawLine(
        color = border.copy(alpha = 0.5f),
        start = Offset(cx, cy - r), end = Offset(cx, 0f),
        strokeWidth = dashW, pathEffect = dash
    )
    drawLine(
        color = border.copy(alpha = 0.5f),
        start = Offset(cx, cy + r), end = Offset(cx, h),
        strokeWidth = dashW, pathEffect = dash
    )
    drawLine(
        color = border.copy(alpha = 0.5f),
        start = Offset(cx - r, cy), end = Offset(0f, cy),
        strokeWidth = dashW, pathEffect = dash
    )
    drawLine(
        color = border.copy(alpha = 0.5f),
        start = Offset(cx + r, cy), end = Offset(w, cy),
        strokeWidth = dashW, pathEffect = dash
    )
}

private fun DrawScope.drawCharRef(character: String, color: Color, textMeasurer: TextMeasurer) {
    if (character.isEmpty()) return
    // 以固定字号测量后按目标尺寸缩放绘制，确保与密度/字体缩放无关（精确像素尺寸）
    val layout = textMeasurer.measure(
        text = character,
        style = TextStyle(fontSize = 92.sp, fontFamily = KaiTiFontFamily, color = color, textAlign = TextAlign.Center)
    )
    val target = size.width * 0.92f
    val scale = target / layout.size.width
    scale(scale, scale, pivot = Offset(size.width / 2f, size.height / 2f)) {
        drawText(
            textLayoutResult = layout,
            topLeft = Offset(
                (size.width - layout.size.width) / 2f,
                (size.height - layout.size.height) / 2f
            )
        )
    }
}

/** 绝对坐标 → 画布坐标 */
private fun DrawScope.toCanvas(p: StrokePoint): Offset {
    val s = size.width / COORD_SCALE
    return Offset(p.x * s, p.y * s)
}

/** 完整笔画（墨色） */
private fun DrawScope.drawFullStroke(stroke: CharStroke, color: Color, unit: Float) {
    val pts = stroke.points
    if (pts.isEmpty()) return
    val widths = brushWidths(pts)
    drawStrokePath(pts, widths, 1f, color, unit)
}

/** 部分笔画（进度 0..1，按时间戳插值到当前点） */
private fun DrawScope.drawPartialStroke(stroke: CharStroke, progress: Float, color: Color, unit: Float) {
    val pts = stroke.points
    if (pts.isEmpty()) return
    // 当前目标时间
    val targetTime = pts.first().timestamp +
        (pts.last().timestamp - pts.first().timestamp) * progress.coerceIn(0f, 1f)
    val head = pts.takeWhile { it.timestamp <= targetTime }
    if (head.isEmpty()) return
    val widths = brushWidths(pts)
    if (head.size < pts.size) {
        val interp = interpolatePoint(pts, targetTime) ?: return
        drawStrokePath(head + interp, widths.take(head.size) + listOf(widths[head.size.coerceAtMost(widths.size - 1)]), 1f, color, unit)
    } else {
        drawStrokePath(pts, widths, 1f, color, unit)
    }
}

/** 逐段绘制（线段宽度随笔触变化，圆头圆角） */
private fun DrawScope.drawStrokePath(
    points: List<StrokePoint>,
    widths: List<Float>,
    progress: Float,
    color: Color,
    unit: Float
) {
    if (points.size < 2) {
        if (points.size == 1) {
            val p = toCanvas(points[0])
            val r = (widths[0] * unit / 2f).coerceAtLeast(0.5f) * progress.coerceAtLeast(0.1f)
            drawCircle(color, radius = r, center = p)
        }
        return
    }
    val count = maxOf(2, (points.size * progress).toInt().coerceAtLeast(1))
    for (i in 1 until count) {
        val a = toCanvas(points[i - 1])
        val b = toCanvas(points[i])
        val wa = widths[i - 1] * unit
        val wb = widths[i] * unit
        drawLine(
            color = color,
            start = a,
            end = b,
            strokeWidth = (wa + wb) / 2f,
            cap = StrokeCap.Round
        )
    }
}
