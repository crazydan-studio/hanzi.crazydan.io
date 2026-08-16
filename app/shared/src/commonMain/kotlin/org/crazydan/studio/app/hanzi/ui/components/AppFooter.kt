package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import org.crazydan.studio.app.hanzi.ui.Platform

/**
 * 站点页脚（各页面共用，与前端 AppFooter.js 一致）: 外部链接与版权声明
 */
@Composable
fun AppFooter(modifier: Modifier = Modifier) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 20.dp)
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(bottom = 6.dp)
        ) {
            FooterLink("筷字输入法", "https://github.com/crazydan-studio/kuaizi-ime", muted)
            FooterLink("汉典网", "https://zdic.net/", muted)
        }
        InlineLinkText(
            text = "本站点内容版权归 Crazydan Studio 所有",
            links = mapOf("Crazydan Studio" to "https://studio.crazydan.org/"),
            style = MaterialTheme.typography.bodySmall.copy(color = muted)
        )
    }
}

@Composable
private fun FooterLink(text: String, url: String, color: androidx.compose.ui.graphics.Color) {
    Text(
        text = text,
        style = TextStyle(color = color),
        modifier = Modifier
            .clickable { Platform.openUrl(url) }
            .padding(horizontal = 4.dp)
    )
}
