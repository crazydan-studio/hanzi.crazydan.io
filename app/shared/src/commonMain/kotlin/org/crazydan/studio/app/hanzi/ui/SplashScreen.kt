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
 * logo 下方为等待动画（与拼音字列表加载动画同款，不显示提示文字）;
 * 数据库初始化信息由首页区域在开屏淡出后显示
 */
@Composable
fun SplashScreen() {
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
            Spacer(Modifier.height(28.dp))
            // 与拼音字列表加载动画同款效果
            CircularProgressIndicator(
                strokeWidth = 3.dp,
                modifier = Modifier.width(28.dp)
            )
        }
    }
}

/**
 * 数据库初始化等待提示（开屏淡出后、首页数据就绪前，在首页区域显示）
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
