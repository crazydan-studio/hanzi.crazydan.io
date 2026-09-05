package org.crazydan.studio.app.hanzi.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

/** 中易楷体（内置 assets/fonts/ZhongYiKaiTi.ttf）; Android 实现从 assets 加载 */
expect fun platformKaiTiFontFamily(): FontFamily

// 与前端（Tailwind）配色保持一致
// 明亮: bg gray-50、面板 white、文字 gray-900、次要 gray-500、边框 gray-200
// 暗黑: bg gray-900、面板 gray-800、文字 gray-100、次要 gray-400、边框 gray-700

val Blue500 = Color(0xFF3B82F6)
val Blue600 = Color(0xFF2563EB)
val Blue400 = Color(0xFF60A5FA)
val Red600 = Color(0xFFDC2626)
val Red400 = Color(0xFFF87171)
val Gray900 = Color(0xFF111827)
val Gray800 = Color(0xFF1F2937)
val Gray700 = Color(0xFF374151)
val Gray600 = Color(0xFF4B5563)
val Gray500 = Color(0xFF6B7280)
val Gray400 = Color(0xFF9CA3AF)
val Gray300 = Color(0xFFD1D5DB)
val Gray200 = Color(0xFFE5E7EB)
val Gray100 = Color(0xFFF3F4F6)
val Gray50 = Color(0xFFF9FAFB)

private val LightColors = lightColorScheme(
    primary = Blue500,
    onPrimary = Color.White,
    secondary = Gray500,
    background = Gray50,
    onBackground = Gray900,
    surface = Color.White,
    onSurface = Gray900,
    surfaceVariant = Gray100,
    onSurfaceVariant = Gray500,
    outline = Gray200,
    outlineVariant = Gray200,
    error = Red600
)

private val DarkColors = darkColorScheme(
    primary = Blue400,
    onPrimary = Color.White,
    secondary = Gray400,
    background = Gray900,
    onBackground = Gray100,
    surface = Gray800,
    onSurface = Gray100,
    surfaceVariant = Gray700,
    onSurfaceVariant = Gray400,
    outline = Gray700,
    outlineVariant = Gray700,
    error = Red400
)

/** 全部文字采用中易楷体（各 Typography 样式均以楷体为默认字族） */
private val KaiTiTypography: Typography by lazy {
    val base = Typography()
    fun withKaiTi(style: androidx.compose.ui.text.TextStyle) = style.copy(fontFamily = KaiTiFontFamily)
    Typography(
        displayLarge = withKaiTi(base.displayLarge),
        displayMedium = withKaiTi(base.displayMedium),
        displaySmall = withKaiTi(base.displaySmall),
        headlineLarge = withKaiTi(base.headlineLarge),
        headlineMedium = withKaiTi(base.headlineMedium),
        headlineSmall = withKaiTi(base.headlineSmall),
        titleLarge = withKaiTi(base.titleLarge),
        titleMedium = withKaiTi(base.titleMedium),
        titleSmall = withKaiTi(base.titleSmall),
        bodyLarge = withKaiTi(base.bodyLarge),
        bodyMedium = withKaiTi(base.bodyMedium),
        bodySmall = withKaiTi(base.bodySmall),
        labelLarge = withKaiTi(base.labelLarge),
        labelMedium = withKaiTi(base.labelMedium),
        labelSmall = withKaiTi(base.labelSmall)
    )
}

/** 应用主题: 浅/暗色配色跟随手动切换或系统；全部文字默认采用中易楷体 */
@Composable
fun HanziTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = KaiTiTypography,
        content = content
    )
}

// ---- 书写动画相关颜色（与前端 StrokeBackground.js / 引擎一致） ----

/** 中易楷体（内置 assets/fonts/ZhongYiKaiTi.ttf，与前端静态楷体同源） */
val KaiTiFontFamily: FontFamily
    get() = platformKaiTiFontFamily()

/** 田字格外框颜色（明亮深红 / 暗黑亮红） */
fun tianZiGeColor(dark: Boolean) = if (dark) Red400 else Red600

/** 背景汉字颜色（浅色实色，明亮浅灰 / 暗黑中浅灰） */
fun ziRefColor(dark: Boolean) = if (dark) Gray600 else Gray300

/** 已绘制笔画墨色（明亮黑 / 暗黑近白） */
fun strokeInkColor(dark: Boolean) = if (dark) Gray50 else Color.Black

/** 笔画动画高亮色（正在绘制的笔画） */
val strokeHighlightColor = Red600

/** 弹窗遮罩色（放大查看等全屏遮罩背景） */
val OverlayScrim = Color(0xB3000000)

/** 悬浮提示徽标配色（对应 web .float-badge: 深底浅字，暗色反转为浅底深字）: (文字, 背景) */
fun floatBadgeColors(dark: Boolean): Pair<Color, Color> =
    if (dark) Gray100.copy(alpha = 0.8f) to Gray900
    else Gray900.copy(alpha = 0.7f) to Color.White
