package org.crazydan.studio.app.hanzi.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import org.crazydan.studio.app.hanzi.ui.KaiTiFontFamily

/**
 * 中英文混排文本: 汉字（CJK）采用中易楷体，英文/拼音等拉丁字符采用系统字体
 * （楷体缺失 ü 等字符且拉丁字形间距偏大，混合排版避免字符间隔过大）
 */
@Composable
fun MixedFontText(
    text: String,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    modifier: Modifier = Modifier
) {
    val annotated = buildAnnotatedString {
        var i = 0
        while (i < text.length) {
            val start = i
            // 拉丁字符（含 ü 等 Latin-1 补充区）用系统字体，其余（CJK/全角标点）用楷体
            val latin = text[i].code < 0x300
            while (i < text.length && (text[i].code < 0x300) == latin) i++
            withStyle(
                SpanStyle(fontFamily = if (latin) FontFamily.Default else KaiTiFontFamily)
            ) {
                append(text.substring(start, i))
            }
        }
    }
    Text(text = annotated, style = style, modifier = modifier)
}
