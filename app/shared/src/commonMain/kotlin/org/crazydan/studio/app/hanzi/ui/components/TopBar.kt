package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** 主题切换图标按钮（深色主题显示日/亮色图标，浅色主题显示月/暗色图标） */
@Composable
fun ThemeIconButton(dark: Boolean, onToggleTheme: () -> Unit) {
    IconButton(onClick = onToggleTheme) {
        Icon(
            imageVector = if (dark) LightModeIcon else DarkModeIcon,
            contentDescription = if (dark) "切换浅色" else "切换深色",
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/** 页面顶部栏（返回 + 标题 + 主题切换图标），各页面共用 */
@Composable
fun TopBar(
    title: String,
    dark: Boolean,
    onToggleTheme: () -> Unit,
    onBack: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 4.dp)
    ) {
        Text(
            text = "← 返回",
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .clickable(onClick = onBack)
                .padding(horizontal = 8.dp, vertical = 8.dp)
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            modifier = Modifier.weight(1f)
        )
        ThemeIconButton(dark = dark, onToggleTheme = onToggleTheme)
    }
}
