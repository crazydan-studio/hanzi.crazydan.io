package org.crazydan.studio.app.hanzi.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import org.crazydan.studio.app.hanzi.shared.R

/**
 * Android logo: 内置矢量资源（drawable/ic_logo，与站点 logo.svg 一致）
 */
@Composable
actual fun logoPainter(): Painter = painterResource(R.drawable.ic_logo)
