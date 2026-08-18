package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.graphics.RectangleShape
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
import org.crazydan.studio.app.hanzi.shared.ZiStroke
import org.crazydan.studio.app.hanzi.shared.StrokeFormat
import org.crazydan.studio.app.hanzi.shared.StrokePoint
import org.crazydan.studio.app.hanzi.ui.Gray900
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.ziRefColor
import org.crazydan.studio.app.hanzi.ui.strokeHighlightColor
import org.crazydan.studio.app.hanzi.ui.strokeInkColor
import org.crazydan.studio.app.hanzi.ui.tianZiGeColor

/**
 * 书写动画（移植自前端 AnimationEngine.js + StrokeBackground.js + Brush.js）
 *  - 田字格: 外框 + 米字格中央十字虚线（中心空心）
 *  - 背景汉字: 半透明参考字（统一字号、墨迹盒中心对齐田字格中心）
 *  - 笔画: 以背景字墨迹盒为坐标系还原轨迹（x 按盒宽、y 按盒高），
 *    按时间戳插值回放，笔触宽度随压力/起笔收笔变化；已完成笔画墨色、当前笔画高亮色
 */

// 笔画间停顿（毫秒，与前端 strokeGap 一致）
private const val STROKE_GAP_MS = StrokeFormat.STROKE_GAP_MS

/** 背景字墨迹盒（画布像素坐标）: 笔画坐标还原的基准（x 按盒宽、y 按盒高） */
private class ZiBox(val x0: Float, val y0: Float, val w: Float, val h: Float)

/** 播放状态机（与 AnimationEngine.js 单一状态机对应） */
class WritingPlayer(private val strokes: List<ZiStroke>) {

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
                gapRemainingMs = StrokeFormat.STROKE_GAP_MS
                progress = 0f
            }
        } else {
            progress = elapsedMs / duration
        }
    }
}

// 笔画时长: 首尾点时间差（毫秒）；单点/无时长笔画取 200ms（与前端一致）
internal fun strokeDuration(points: List<StrokePoint>): Float {
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

// 笔触宽度（完整移植前端 Brush.js computeBrushWidths）:
// baseWidth 为该笔画基准笔宽（轨迹 brush 面积比按当前墨迹盒面积还原），
// 压力因子 × 速度因子（快细慢粗，三点平滑）× 起笔顿笔/收笔出锋因子，输出前五点平滑
private fun brushWidths(points: List<StrokePoint>, baseWidth: Float): List<Float> {
    val n = points.size
    if (n == 0) return emptyList()
    if (n == 1) return listOf(baseWidth)

    // 1) 压力因子
    val pressureFactor = FloatArray(n) { 0.4f + 0.6f * points[it].pressure.coerceIn(0f, 1f) }

    // 2) 速度因子（局部速度 vs 平均速度）: 慢（顿笔）→宽，快→细
    val avgSpeed = averageSpeed(points)
    val speedFactor = FloatArray(n) { 1f }
    for (i in 1 until n - 1) {
        val dt = points[i].timestamp - points[i - 1].timestamp
        val dist = segmentDistance(points[i - 1], points[i])
        val local = if (dt > 0f) dist / dt else avgSpeed
        speedFactor[i] = (0.7f + 0.5f * (avgSpeed / (local + 1e-6f))).coerceIn(0.6f, 1.4f)
    }
    val speedSmoothed = smooth3(speedFactor.toList())

    // 3) 起笔顿笔 + 收笔出锋（各占 12% 长度）
    val headN = maxOf(2, (n * 0.12f).toInt())
    val tailN = maxOf(2, (n * 0.12f).toInt())
    val out = ArrayList<Float>(n)
    for (i in 0 until n) {
        val headPos = (i.toFloat() / headN).coerceAtMost(1f)
        val headFactor = 1.35f - 0.35f * headPos
        val tailPos = ((n - 1 - i).toFloat() / tailN).coerceAtMost(1f)
        val tailFactor = 0.5f + 0.5f * tailPos
        val factor = if (i < headN && i >= n - tailN) headFactor
            else if (i < headN) headFactor
            else if (i >= n - tailN) tailFactor
            else 1f
        out.add(baseWidth * pressureFactor[i] * speedSmoothed[i] * factor)
    }
    // 输出前整体 5 点平滑（减少宽度抖动造成的毛刺）
    return smooth(out)
}

// 平均速度（内部坐标/毫秒；与 web 比例一致，速度因子为比值不受坐标系影响），兜底 1
private fun averageSpeed(points: List<StrokePoint>): Float {
    var dist = 0f
    for (i in 1 until points.size) dist += segmentDistance(points[i - 1], points[i])
    val dur = points.last().timestamp - points.first().timestamp
    return if (dur > 0f) dist / dur else 1f
}

private fun segmentDistance(a: StrokePoint, b: StrokePoint): Float =
    kotlin.math.hypot(b.x - a.x, b.y - a.y)

// 三点移动平均
private fun smooth3(values: List<Float>): List<Float> {
    val n = values.size
    if (n < 3) return values
    val out = ArrayList<Float>(n)
    for (i in 0 until n) {
        val a = values[maxOf(0, i - 1)]
        val b = values[i]
        val c = values[minOf(n - 1, i + 1)]
        out.add((a + b + c) / 3f)
    }
    return out
}

// 五点平滑
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
fun rememberWritingPlayer(strokes: List<ZiStroke>): WritingPlayer {
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
 *  - 笔画坐标以背景字墨迹盒为坐标系: 每次绘制测量当前墨迹盒后还原
 */
@Composable
fun WritingAnimationCanvas(
    strokes: List<ZiStroke>,
    zi: String,
    dark: Boolean,
    modifier: Modifier = Modifier,
    player: WritingPlayer? = null,
    textMeasurer: TextMeasurer = rememberTextMeasurer()
) {
    val ink = strokeInkColor(dark)
    val highlight = strokeHighlightColor
    val border = tianZiGeColor(dark)
    val ref = ziRefColor(dark)

    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RectangleShape)
            .background(if (dark) Gray900 else Color.White)
    ) {
        val unit = size.width / StrokeFormat.INTERNAL_SIZE   // 前端 500×500 内部坐标系缩放
        // 与 web 一致: 田字格在下，浅色非半透明背景字在上；背景字墨迹盒为笔画坐标基准
        drawTianZiGe(border, unit)
        val layout = drawZiRef(zi, ref, textMeasurer)
        drawZiBoxDebug(layout, unit)
        val box = layout?.box

        val completed = if (player != null) player.currentIndex.coerceIn(0, strokes.size) else strokes.size
        for (i in 0 until completed) {
            drawFullStroke(strokes[i], ink, unit, box)
        }
        if (player != null && player.currentIndex < strokes.size) {
            val p = player.progress
            if (p > 0f && p < 1f) {
                drawPartialStroke(strokes[player.currentIndex], p, highlight, unit, box)
            }
        }
    }
}

/**
 * 单笔小图（笔画分解图格子，与 web StrokeCell 一致）:
 * 田字格 + 背景汉字；此前笔画墨色已绘，当前笔画红色示位。
 *  - progress 为 null 时静态展示（当前笔画满红色）
 *  - 非 null 时按进度绘制（格子内单笔动画，红色笔触）
 */
@Composable
fun StrokeCellCanvas(
    strokes: List<ZiStroke>,
    index: Int,
    zi: String,
    dark: Boolean,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    textMeasurer: TextMeasurer = rememberTextMeasurer()
) {
    val stroke = strokes.getOrNull(index) ?: return
    val ink = strokeInkColor(dark)
    val highlight = strokeHighlightColor
    val border = tianZiGeColor(dark)
    val ref = ziRefColor(dark)
    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RectangleShape)
            .background(if (dark) Gray900 else Color.White)
    ) {
        val unit = size.width / StrokeFormat.INTERNAL_SIZE
        // 与 web 一致: 田字格在下，浅色非半透明背景字在上；背景字墨迹盒为笔画坐标基准
        drawTianZiGe(border, unit)
        val layout = drawZiRef(zi, ref, textMeasurer)
        drawZiBoxDebug(layout, unit)
        val box = layout?.box
        // 此前笔画墨色已绘
        for (i in 0 until index) {
            drawFullStroke(strokes[i], ink, unit, box)
        }
        // 当前笔画红色（静态满红示位 / 动画按进度绘制）
        val p = progress
        when {
            p == null || p >= 1f -> drawFullStroke(stroke, highlight, unit, box)
            p > 0f -> drawPartialStroke(stroke, p, highlight, unit, box)
        }
    }
}

// ---- 绘制实现 ----

/** 田字格: 红色外框 + 米字格中央十字半透明虚线（中心空心，向四周发散） */
private fun DrawScope.drawTianZiGe(border: Color, unit: Float) {
    val w = size.width
    val h = size.height
    // 线宽按画布基准 500px 等比缩放，且不小于最小可见宽度
    val borderW = (1.5f * unit).coerceAtLeast(1.2f)
    val dashW = (1.2f * unit).coerceAtLeast(1f)
    val dashLen = (10f * unit).coerceAtLeast(9f)   // 虚线段长
    val gapLen = (8f * unit).coerceAtLeast(8f)     // 虚线间隔
    val cx = w / 2f
    val cy = h / 2f
    val r = (10f * unit).coerceAtLeast(6f)   // 中心空心半径

    // 外框（内缩半个线宽，保证完整可见，不被画布边缘裁剪）
    drawRect(
        color = border,
        topLeft = Offset(borderW / 2f, borderW / 2f),
        size = androidx.compose.ui.geometry.Size(w - borderW, h - borderW),
        style = Stroke(width = borderW)
    )
    // 米字格中央十字: 半透明虚线（手动分段绘制，段长与间隔清晰可见）
    val dashColor = border.copy(alpha = 0.45f)
    drawDashedLine(
        start = Offset(cx, 0f), end = Offset(cx, cy - r),
        color = dashColor, width = dashW, dashLen = dashLen, gapLen = gapLen
    )
    drawDashedLine(
        start = Offset(cx, cy + r), end = Offset(cx, h),
        color = dashColor, width = dashW, dashLen = dashLen, gapLen = gapLen
    )
    drawDashedLine(
        start = Offset(0f, cy), end = Offset(cx - r, cy),
        color = dashColor, width = dashW, dashLen = dashLen, gapLen = gapLen
    )
    drawDashedLine(
        start = Offset(cx + r, cy), end = Offset(w, cy),
        color = dashColor, width = dashW, dashLen = dashLen, gapLen = gapLen
    )
}

// 手动分段绘制虚线（对线宽/段长/间隔完全可控，兼容性好）
private fun DrawScope.drawDashedLine(
    start: Offset,
    end: Offset,
    color: Color,
    width: Float,
    dashLen: Float,
    gapLen: Float
) {
    val dx = end.x - start.x
    val dy = end.y - start.y
    val len = kotlin.math.hypot(dx, dy)
    if (len <= 0f) return
    val ux = dx / len
    val uy = dy / len
    var t = 0f
    while (t < len) {
        val segEnd = minOf(t + dashLen, len)
        drawLine(
            color = color,
            start = Offset(start.x + ux * t, start.y + uy * t),
            end = Offset(start.x + ux * segEnd, start.y + uy * segEnd),
            strokeWidth = width,
            cap = StrokeCap.Round
        )
        t += dashLen + gapLen
    }
}

/** 背景字布局信息: 光栅实测墨迹盒（画布坐标，笔画坐标还原基准） */
private class ZiLayout(val box: ZiBox)

/**
 * 背景汉字绘制（与 web drawZiRef 一致，光栅实测坐标系）:
 *  - 字号为画布短边（正方形）的 92%（所有字相同）;
 *    实测墨迹盒超出田字格时按比例缩小字号，保证盒不超出且四周留有空白
 *  - 盒: 直接实际渲染该字并扫描像素，得到真实墨迹盒（假定字体始终包含该字，
 *    不提供回退; 仅笔画轨迹坐标允许超出盒边界）
 *  - 布局: 以实测墨迹盒为基准做 x/y 双向平移，使墨迹中心对齐田字格中心
 *    （留出四周边距、收紧中宫中心、顺应结构重心）
 *  - 田字格边框仅作装饰绘制于画布边缘，不参与汉字/笔画的坐标定位
 * 返回布局信息（墨迹盒为笔画坐标还原基准）; 度量失败时返回 null
 */
private fun DrawScope.drawZiRef(
    zi: String,
    color: Color,
    textMeasurer: TextMeasurer
): ZiLayout? {
    if (zi.isEmpty()) return null
    // 画布尺寸无效（未布局/异常）时不做绘制
    if (size.width <= 0f || size.height <= 0f) return null
    val emPx = 92.sp.toPx()
    val baseScale = (size.width * 0.92f) / emPx

    // 光栅实测墨迹盒（相对文本对齐点: 水平左缘 + 基线）: 无回退
    val raster = Platform.rasterZiBox(zi, emPx) ?: return null

    // 墨迹盒不得超出田字格且四周留白（各侧 4% 画布）: 必要时按比例缩小字号
    // （盒尺寸异常/为零时不缩放，避免 fit 出现 NaN/Infinity）
    val margin = size.width * 0.04f
    val inkW = (raster[2] - raster[0]) * baseScale
    val inkH = (raster[3] - raster[1]) * baseScale
    val maxW = size.width - margin * 2f
    val maxH = size.height - margin * 2f
    val fitW = if (inkW > 0f) maxW / inkW else 1f
    val fitH = if (inkH > 0f) maxH / inkH else 1f
    val fit = minOf(1f, if (fitW.isFinite()) fitW else 1f, if (fitH.isFinite()) fitH else 1f)
    val effPx = emPx * fit
    val effRaster = if (fit < 1f) (Platform.rasterZiBox(zi, effPx) ?: raster) else raster
    val style = TextStyle(
        fontSize = (92f * fit).sp,
        fontFamily = KaiTiFontFamily,
        color = color,
        textAlign = TextAlign.Center
    )

    val layout = textMeasurer.measure(text = zi, style = style)
    val lineBaseline = layout.getLineBaseline(0)

    // 布局: 实测墨迹中心对齐画布中心（x/y 双向平移，未缩放坐标）;
    // 墨迹盒以文本对齐点（左缘 + 基线）度量
    val boxCX = (effRaster[0] + effRaster[2]) / 2f
    val boxCY = (effRaster[1] + effRaster[3]) / 2f
    val textLeft = size.width / 2f - boxCX
    val textTop = size.height / 2f - lineBaseline - boxCY

    scale(baseScale, baseScale, pivot = Offset(size.width / 2f, size.height / 2f)) {
        drawText(
            textLayoutResult = layout,
            topLeft = Offset(textLeft, textTop)
        )
    }

    // 墨迹盒（画布坐标）: 光栅盒经与绘制完全相同的 缩放+平移 变换
    val cx = size.width / 2f
    val cy = size.height / 2f
    val x0 = cx + (textLeft + effRaster[0] - cx) * baseScale
    val y0 = cy + (textTop + lineBaseline + effRaster[1] - cy) * baseScale
    val x1 = cx + (textLeft + effRaster[2] - cx) * baseScale
    val y1 = cy + (textTop + lineBaseline + effRaster[3] - cy) * baseScale
    val w = x1 - x0
    val h = y1 - y0
    return if (w > 0f && h > 0f) ZiLayout(ZiBox(x0, y0, w, h)) else null
}

/** 盒相对归一化坐标 → 画布坐标（x 按盒宽、y 按盒高分别缩放） */
private fun DrawScope.toCanvas(p: StrokePoint, box: ZiBox): Offset {
    return Offset(
        x = box.x0 + p.x / StrokeFormat.COORD_SCALE * box.w,
        y = box.y0 + p.y / StrokeFormat.COORD_SCALE * box.h
    )
}

/** 笔刷面积比 → 当前盒上的基准笔宽（内部坐标系像素，面积比不变则与背景字相对大小一致） */
private fun brushBaseWidth(brush: Int, box: ZiBox): Float {
    val area = box.w * box.h
    if (area <= 0f) return StrokeFormat.BASE_WIDTH
    val ratio = brush.toFloat() / StrokeFormat.BRUSH_SCALE
    return if (ratio > 0f) kotlin.math.sqrt(ratio * area) else StrokeFormat.BASE_WIDTH
}

/** 调试用（仅 debug 构建）: 绘制背景字墨迹盒边界（光栅实测盒，即笔画坐标系的基准） */
private fun DrawScope.drawZiBoxDebug(layout: ZiLayout?, unit: Float) {
    if (layout == null || !Platform.isDebug()) return
    val b = layout.box
    drawRect(
        color = Color(0.23f, 0.51f, 0.96f, 0.6f),   // blue-500 半透明
        topLeft = Offset(b.x0 * unit, b.y0 * unit),
        size = androidx.compose.ui.geometry.Size(b.w * unit, b.h * unit),
        style = Stroke(width = 1.5f)
    )
}

/** 完整笔画（墨色） */
private fun DrawScope.drawFullStroke(stroke: ZiStroke, color: Color, unit: Float, box: ZiBox?) {
    val pts = stroke.points
    if (pts.isEmpty() || box == null) return
    val widths = brushWidths(pts, brushBaseWidth(stroke.brush, box))
    drawStrokePath(pts, widths, 1f, color, unit, box)
}

/** 部分笔画（进度 0..1，按时间戳插值到当前点） */
private fun DrawScope.drawPartialStroke(
    stroke: ZiStroke,
    progress: Float,
    color: Color,
    unit: Float,
    box: ZiBox?
) {
    val pts = stroke.points
    if (pts.isEmpty() || box == null) return
    // 当前目标时间
    val targetTime = pts.first().timestamp +
        (pts.last().timestamp - pts.first().timestamp) * progress.coerceIn(0f, 1f)
    val head = pts.takeWhile { it.timestamp <= targetTime }
    if (head.isEmpty()) return
    val widths = brushWidths(pts, brushBaseWidth(stroke.brush, box))
    if (head.size < pts.size) {
        val interp = interpolatePoint(pts, targetTime) ?: return
        drawStrokePath(
            head + interp,
            widths.take(head.size) + listOf(widths[head.size.coerceAtMost(widths.size - 1)]),
            1f, color, unit, box
        )
    } else {
        drawStrokePath(pts, widths, 1f, color, unit, box)
    }
}

/** 逐段绘制（线段宽度随笔触变化，圆头圆角） */
private fun DrawScope.drawStrokePath(
    points: List<StrokePoint>,
    widths: List<Float>,
    progress: Float,
    color: Color,
    unit: Float,
    box: ZiBox
) {
    if (points.size < 2) {
        if (points.size == 1) {
            val p = toCanvas(points[0], box)
            val r = (widths[0] * unit / 2f).coerceAtLeast(0.5f) * progress.coerceAtLeast(0.1f)
            drawCircle(color, radius = r, center = p)
        }
        return
    }
    val count = maxOf(2, (points.size * progress).toInt().coerceAtLeast(1))
    for (i in 1 until count) {
        val a = toCanvas(points[i - 1], box)
        val b = toCanvas(points[i], box)
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
