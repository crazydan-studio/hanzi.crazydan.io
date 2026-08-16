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

val LightModeIcon: ImageVector by lazy {    ImageVector.Builder(
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

/** 问题反馈（Material Design bug_report 图标） */
val BugReportIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "BugReport", defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(20f, 8f)
            horizontalLineToRelative(-2.81f)
            curveTo(16.74f, 7.22f, 16.12f, 6.55f, 15.37f, 6.04f)
            lineTo(17f, 4.41f)
            lineTo(15.59f, 3f)
            lineToRelative(-2.17f, 2.17f)
            curveTo(12.96f, 5.06f, 12.49f, 5f, 12f, 5f)
            reflectiveCurveToRelative(-0.96f, 0.06f, -1.41f, 0.17f)
            lineTo(8.41f, 3f)
            lineTo(7f, 4.41f)
            lineToRelative(1.62f, 1.63f)
            curveTo(7.88f, 6.55f, 7.26f, 7.22f, 6.81f, 8f)
            horizontalLineTo(4f)
            verticalLineToRelative(2f)
            horizontalLineToRelative(2.09f)
            curveTo(6.04f, 10.33f, 6f, 10.66f, 6f, 11f)
            verticalLineToRelative(1f)
            horizontalLineTo(4f)
            verticalLineToRelative(2f)
            horizontalLineToRelative(2f)
            verticalLineToRelative(1f)
            curveToRelative(0f, 0.34f, 0.04f, 0.67f, 0.09f, 1f)
            horizontalLineTo(4f)
            verticalLineToRelative(2f)
            horizontalLineToRelative(2.81f)
            curveTo(7.85f, 19.79f, 9.78f, 21f, 12f, 21f)
            reflectiveCurveToRelative(4.15f, -1.21f, 5.19f, -3f)
            horizontalLineTo(20f)
            verticalLineToRelative(-2f)
            horizontalLineToRelative(-2.09f)
            curveTo(17.96f, 15.67f, 18f, 15.34f, 18f, 15f)
            verticalLineToRelative(-1f)
            horizontalLineToRelative(2f)
            verticalLineToRelative(-2f)
            horizontalLineToRelative(-2f)
            verticalLineToRelative(-1f)
            curveTo(18f, 10.66f, 17.96f, 10.33f, 17.91f, 10f)
            horizontalLineTo(20f)
            verticalLineTo(8f)
            close()
            moveTo(14f, 16f)
            horizontalLineToRelative(-4f)
            verticalLineToRelative(-2f)
            horizontalLineToRelative(4f)
            verticalLineToRelative(2f)
            close()
            moveTo(14f, 12f)
            horizontalLineToRelative(-4f)
            verticalLineToRelative(-2f)
            horizontalLineToRelative(4f)
            verticalLineToRelative(2f)
            close()
        }
    }.build()
}

/** 外链（Material Design open_in_new 图标） */
val OpenInNewIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "OpenInNew", defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(19f, 19f)
            horizontalLineTo(5f)
            verticalLineTo(5f)
            horizontalLineToRelative(7f)
            verticalLineTo(3f)
            horizontalLineTo(5f)
            curveTo(3.89f, 3f, 3f, 3.9f, 3f, 5f)
            verticalLineToRelative(14f)
            curveToRelative(0f, 1.1f, 0.89f, 2f, 2f, 2f)
            horizontalLineToRelative(14f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f)
            verticalLineToRelative(-7f)
            horizontalLineToRelative(-2f)
            verticalLineToRelative(7f)
            close()
            moveTo(14f, 3f)
            verticalLineToRelative(2f)
            horizontalLineToRelative(3.59f)
            lineToRelative(-9.83f, 9.83f)
            lineToRelative(1.41f, 1.41f)
            lineTo(19f, 6.41f)
            verticalLineTo(10f)
            horizontalLineToRelative(2f)
            verticalLineTo(3f)
            horizontalLineToRelative(-7f)
            close()
        }
    }.build()
}
