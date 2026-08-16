package org.crazydan.studio.app.hanzi.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.graphics.painter.Painter

/**
 * iOS 预留: 暂不实现（待 iOS 版本开发时从 Bundle 加载，见 androidMain 对应实现）。
 */
@Composable
actual fun logoPainter(): Painter = ColorPainter(Color.Transparent)
