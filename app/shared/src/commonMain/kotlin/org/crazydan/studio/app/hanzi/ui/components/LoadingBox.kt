package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** 统一加载动画与提示（列表页 / 汉字信息页共用）: 转圈 + 提示文字居中 */
@Composable
fun LoadingBox(
    text: String = "加载中...",
    modifier: Modifier = Modifier,
    height: Dp? = null
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.then(if (height != null) Modifier.height(height) else Modifier)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 12.dp)
            )
        }
    }
}
