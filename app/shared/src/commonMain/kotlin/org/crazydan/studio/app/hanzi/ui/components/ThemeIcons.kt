package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * 主题切换图标（Material Design dark_mode / light_mode 路径）
 */

val DarkModeIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "DarkMode", defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(12f, 3f)
            curveTo(7.03f, 3f, 3f, 7.03f, 3f, 12f)
            reflectiveCurveToRelative(4.03f, 9f, 9f, 9f)
            reflectiveCurveToRelative(9f, -4.03f, 9f, -9f)
            curveTo(21f, 11.54f, 20.96f, 11.08f, 20.9f, 10.64f)
            curveTo(19.92f, 12.01f, 18.32f, 12.9f, 16.5f, 12.9f)
            curveToRelative(-2.98f, 0f, -5.4f, -2.42f, -5.4f, -5.4f)
            curveToRelative(0f, -1.81f, 0.89f, -3.42f, 2.26f, -4.4f)
            curveTo(12.92f, 3.04f, 12.46f, 3f, 12f, 3f)
            close()
        }
    }.build()
}

val LightModeIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "LightMode", defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(12f, 7f)
            curveToRelative(-2.76f, 0f, -5f, 2.24f, -5f, 5f)
            reflectiveCurveToRelative(2.24f, 5f, 5f, 5f)
            reflectiveCurveToRelative(5f, -2.24f, 5f, -5f)
            reflectiveCurveToRelative(-2.24f, -5f, -5f, -5f)
            close()
            moveTo(2f, 13f)
            horizontalLineToRelative(2f)
            curveToRelative(0.55f, 0f, 1f, -0.45f, 1f, -1f)
            reflectiveCurveToRelative(-0.45f, -1f, -1f, -1f)
            horizontalLineTo(2f)
            curveToRelative(-0.55f, 0f, -1f, 0.45f, -1f, 1f)
            reflectiveCurveToRelative(0.45f, 1f, 1f, 1f)
            close()
            moveTo(20f, 13f)
            horizontalLineToRelative(2f)
            curveToRelative(0.55f, 0f, 1f, -0.45f, 1f, -1f)
            reflectiveCurveToRelative(-0.45f, -1f, -1f, -1f)
            horizontalLineToRelative(-2f)
            curveToRelative(-0.55f, 0f, -1f, 0.45f, -1f, 1f)
            reflectiveCurveToRelative(0.45f, 1f, 1f, 1f)
            close()
            moveTo(11f, 2f)
            verticalLineToRelative(2f)
            curveToRelative(0f, 0.55f, 0.45f, 1f, 1f, 1f)
            reflectiveCurveToRelative(1f, -0.45f, 1f, -1f)
            verticalLineTo(2f)
            curveToRelative(0f, -0.55f, -0.45f, -1f, -1f, -1f)
            reflectiveCurveToRelative(-1f, 0.45f, -1f, 1f)
            close()
            moveTo(11f, 20f)
            verticalLineToRelative(2f)
            curveToRelative(0f, 0.55f, 0.45f, 1f, 1f, 1f)
            reflectiveCurveToRelative(1f, -0.45f, 1f, -1f)
            verticalLineToRelative(-2f)
            curveToRelative(0f, -0.55f, -0.45f, -1f, -1f, -1f)
            reflectiveCurveToRelative(-1f, 0.45f, -1f, 1f)
            close()
            moveTo(5.99f, 4.58f)
            curveToRelative(-0.39f, -0.39f, -1.03f, -0.39f, -1.41f, 0f)
            curveToRelative(-0.39f, 0.39f, -0.39f, 1.03f, 0f, 1.41f)
            lineToRelative(1.06f, 1.06f)
            curveToRelative(0.39f, 0.39f, 1.03f, 0.39f, 1.41f, 0f)
            reflectiveCurveToRelative(0.39f, -1.03f, 0f, -1.41f)
            lineTo(5.99f, 4.58f)
            close()
            moveTo(18.36f, 16.95f)
            curveToRelative(-0.39f, -0.39f, -1.03f, -0.39f, -1.41f, 0f)
            curveToRelative(-0.39f, 0.39f, -0.39f, 1.03f, 0f, 1.41f)
            lineToRelative(1.06f, 1.06f)
            curveToRelative(0.39f, 0.39f, 1.03f, 0.39f, 1.41f, 0f)
            reflectiveCurveToRelative(0.39f, -1.03f, 0f, -1.41f)
            lineToRelative(-1.06f, -1.06f)
            close()
            moveTo(19.42f, 5.99f)
            curveToRelative(0.39f, -0.39f, 0.39f, -1.03f, 0f, -1.41f)
            curveToRelative(-0.39f, -0.39f, -1.03f, -0.39f, -1.41f, 0f)
            lineToRelative(-1.06f, 1.06f)
            curveToRelative(-0.39f, 0.39f, -0.39f, 1.03f, 0f, 1.41f)
            reflectiveCurveToRelative(1.03f, 0.39f, 1.41f, 0f)
            lineTo(19.42f, 5.99f)
            close()
            moveTo(7.05f, 18.36f)
            curveToRelative(-0.39f, -0.39f, -1.03f, -0.39f, -1.41f, 0f)
            curveToRelative(-0.39f, 0.39f, -0.39f, 1.03f, 0f, 1.41f)
            lineToRelative(1.06f, 1.06f)
            curveToRelative(0.39f, 0.39f, 1.03f, 0.39f, 1.41f, 0f)
            reflectiveCurveToRelative(0.39f, -1.03f, 0f, -1.41f)
            lineToRelative(-1.06f, -1.06f)
            close()
        }
    }.build()
}
