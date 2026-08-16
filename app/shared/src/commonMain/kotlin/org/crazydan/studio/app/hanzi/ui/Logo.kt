package org.crazydan.studio.app.hanzi.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter

/**
 * 站点 logo（与前端 public/logo.svg 一致的矢量图形，内置 drawable/ic_logo）;
 * Android 从 shared 资源加载，iOS 预留。
 */
@Composable
expect fun logoPainter(): Painter
