package org.crazydan.studio.app.hanzi.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.crazydan.studio.app.hanzi.ui.Platform
import org.crazydan.studio.app.hanzi.ui.components.SectionCard

/**
 * 友情赞助页（收款码图片内置，由 build/app-pack.sh 从站点拷贝/下载到 assets/donate/）
 */
@Composable
fun DonateScreen(
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
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

            // 收款码（支付宝 / 微信 / PayPal）
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(top = 16.dp)
            ) {
                QrCode("支付宝", "donate/alipay.jpg", dark, Modifier.weight(1f))
                QrCode("微信", "donate/wechat.png", dark, Modifier.weight(1f))
                QrCode("PayPal", "donate/hanzi-site.png", dark, Modifier.weight(1f))
            }

            Spacer(Modifier.height(16.dp))

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
    }
}

/** 单个收款码（内置资源图片，加载失败时显示占位） */
@Composable
private fun QrCode(name: String, assetPath: String, dark: Boolean, modifier: Modifier = Modifier) {
    val bitmap by produceState<ImageBitmap?>(null, assetPath) {
        value = Platform.loadAssetImage(assetPath)
    }
    val shape = RoundedCornerShape(8.dp)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
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
