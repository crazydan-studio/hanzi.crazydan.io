package org.crazydan.studio.app.hanzi.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * 开屏页: 以 logo 为中心，暗黑主题色为背景（品牌开屏页），
 * 下方显示等待动画与初始化提示（避免误以为 App 僵死）;
 * 展示时间由 MainActivity 控制，首页渲染完成后平滑淡出
 */
@Composable
fun SplashScreen(notice: Boolean = true) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Gray900
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxSize()
        ) {
            Image(
                painter = logoPainter(),
                contentDescription = "汉字",
                modifier = Modifier.width(140.dp)
            )
            if (notice) {
                Spacer(Modifier.height(28.dp))
                CircularProgressIndicator(
                    color = Gray100,
                    strokeWidth = 3.dp,
                    modifier = Modifier.width(28.dp)
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    text = "正在初始化数据…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Gray400,
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
            }
        }
    }
}

/**
 * 数据库初始化提示（异常兜底显示，正常流程由开屏覆盖等待期）
 * 与已保存/系统主题一致，保持居中对齐
 */
@Composable
fun InitNoticeScreen(darkTheme: Boolean, notice: Boolean, message: String = "正在初始化数据库，请稍候…") {
    HanziTheme(darkTheme = darkTheme) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            if (notice) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxSize()
                ) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 24.dp)
                    )
                }
            }
        }
    }
}
