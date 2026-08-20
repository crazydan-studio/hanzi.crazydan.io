package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import org.crazydan.studio.app.hanzi.ui.Blue500

/**
 * 深蓝主按钮（与 web 一致: bg-blue-500 白字，浅/暗主题相同，不随主题变浅）
 * 用于 查询/管理/去赞助/下载 等主操作（各页面共用）
 */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        colors = ButtonDefaults.buttonColors(
            containerColor = Blue500,
            contentColor = Color.White
        ),
        onClick = onClick,
        modifier = modifier
    ) {
        Text(text)
    }
}
