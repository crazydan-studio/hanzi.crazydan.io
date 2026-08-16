package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.components.AppFooter
import org.crazydan.studio.app.hanzi.ui.components.SectionCard

/**
 * 友情赞助页（收款码图片内置，由 build/app-pack.sh 从站点拷贝/下载到 assets/donate/）
 * 点击收款码可放大查看，并支持经系统分享面板保存/发送图片
 */
@Composable
fun DonateScreen(
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    // 当前放大的收款码（assets 路径）; null 表示未放大
    var zoomed by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        TopBar(title = "友情赞助", dark = dark, onToggleTheme = onToggleTheme, onBack = onBack)

        SectionCard {
            Text("支持汉字网", style = MaterialTheme.typography.titleMedium)
            Text(
                "感谢您的热心支持！您的赞助将用于本项目的持续开发与维护，让更多人免费使用汉字笔画数据。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )

            // 付款备注醒目提示
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f),
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Text(
                    text = "付款时请在备注中注明「汉字网」或「hanzi」，以便我们记录您的支持！",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp)
                )
            }

            // 收款码（支付宝 / 微信 / PayPal）; 点击放大查看
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(top = 16.dp)
            ) {
                QrCode("支付宝", "donate/alipay.jpg", dark, Modifier.weight(1f)) { zoomed = it }
                QrCode("微信", "donate/wechat.png", dark, Modifier.weight(1f)) { zoomed = it }
                QrCode("PayPal", "donate/hanzi-site.png", dark, Modifier.weight(1f)) { zoomed = it }
            }

            Spacer(Modifier.height(12.dp))

            Text(
                "提示：点击收款码可放大查看，放大后可保存/分享图片",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(12.dp))

            Text(
                "再次感谢您的热心支持！",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth()
            )
            TextButton(onClick = {
                Platform.openUrl(
                    "https://github.com/crazydan-studio/hanzi.crazydan.io/blob/master/docs/donate/index.md"
                )
            }) {
                Text("友情赞助清单 →")
            }
        }

        AppFooter()
        Spacer(Modifier.height(8.dp))
    }

    // 收款码放大查看
    zoomed?.let { path ->
        QrZoomDialog(
            assetPath = path,
            onDismiss = { zoomed = null }
        )
    }
}

/** 单个收款码（内置资源图片，加载失败时显示占位） */
@Composable
private fun QrCode(
    name: String,
    assetPath: String,
    dark: Boolean,
    modifier: Modifier = Modifier,
    onClick: (String) -> Unit
) {
    val bitmap by produceState<ImageBitmap?>(null, assetPath) {
        value = Platform.loadAssetImage(assetPath)
    }
    val shape = RoundedCornerShape(8.dp)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.clickable { onClick(assetPath) }
    ) {
        val imageModifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(shape)
            .border(
                width = 1.dp,
                color = if (dark) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.outlineVariant,
                shape = shape
            )
        val image = bitmap
        if (image != null) {
            Image(
                bitmap = image,
                contentDescription = "${name}收款码",
                modifier = imageModifier.background(MaterialTheme.colorScheme.surface)
            )
        } else {
            Box(
                contentAlignment = Alignment.Center,
                modifier = imageModifier.background(MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Text(
                    text = "收款码\n未就绪",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }
        Text(
            text = name,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

/** 收款码放大查看（遮罩覆盖整页；点击图片或空白处关闭；提供保存/分享按钮） */
@Composable
private fun QrZoomDialog(assetPath: String, onDismiss: () -> Unit) {
    val bitmap by produceState<ImageBitmap?>(null, assetPath) {
        value = Platform.loadAssetImage(assetPath)
    }
    val title = assetPath.substringAfterLast('/')
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxSize()
                .background(androidx.compose.ui.graphics.Color(0xB3000000))
                .clickable(onClick = onDismiss)
        ) {
            val image = bitmap
            if (image != null) {
                Image(
                    bitmap = image,
                    contentDescription = "收款码",
                    modifier = Modifier
                        .fillMaxWidth(0.85f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable(enabled = false, onClick = {})
                )
                // 底部操作: 保存/分享
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 32.dp)
                ) {
                    TextButton(onClick = { Platform.shareImage(assetPath, "汉字网 ${title.removeSuffix(".png").removeSuffix(".jpg")} 收款码") }) {
                        Text("保存 / 分享")
                    }
                }
            } else {
                Text(
                    text = "收款码图片未就绪",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
