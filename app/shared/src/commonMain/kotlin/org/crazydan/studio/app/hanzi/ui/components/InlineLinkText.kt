package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import org.crazydan.studio.app.hanzi.ui.Platform

/**
 * 含行内链接的文本（与前端 <a> 行内链接一致: 链接为蓝色）
 * 用法:
 *   InlineLinkText(
 *     text = "本站是「筷字输入法」的衍生项目",
 *     links = mapOf("筷字输入法" to "https://..."),
 *     style = MaterialTheme.typography.bodySmall
 *   )
 */
@Composable
fun InlineLinkText(
    text: String,
    links: Map<String, String>,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    modifier: Modifier = Modifier
) {
    val linkStyle = style.copy(color = MaterialTheme.colorScheme.primary)
    val annotated = buildAnnotatedString {
        var cursor = 0
        for ((label, url) in links) {
            val index = text.indexOf(label, cursor)
            if (index == -1) continue
            append(text.substring(cursor, index))
            val start = length
            append(label)
            addLink(
                LinkAnnotation.Clickable(
                    tag = url,
                    styles = TextLinkStyles(style = SpanStyle(color = linkStyle.color)),
                    linkInteractionListener = { Platform.openUrl(url) }
                ),
                start = start,
                end = length
            )
            cursor = index + label.length
        }
        if (cursor < text.length) {
            append(text.substring(cursor))
        }
    }
    Text(text = annotated, style = style, modifier = modifier)
}
