package org.crazydan.studio.app.hanzi.shared

/**
 * 拼音工具（与前端 src/services/pinyin.js 一致）:
 * 拼音以数字声调形式存储（如 di2、lü4；轻声不带数字，如 de），
 * 展示时转换为符号声调（如 dì、lǜ）。
 */
object Pinyin {

    private val TONE_MARKS: Map<Char, Map<Int, String>> = mapOf(
        'a' to mapOf(1 to "ā", 2 to "á", 3 to "ǎ", 4 to "à"),
        'e' to mapOf(1 to "ē", 2 to "é", 3 to "ě", 4 to "è"),
        'i' to mapOf(1 to "ī", 2 to "í", 3 to "ǐ", 4 to "ì"),
        'o' to mapOf(1 to "ō", 2 to "ó", 3 to "ǒ", 4 to "ò"),
        'u' to mapOf(1 to "ū", 2 to "ú", 3 to "ǔ", 4 to "ù"),
        'ü' to mapOf(1 to "ǖ", 2 to "ǘ", 3 to "ǚ", 4 to "ǜ"),
        'n' to mapOf(2 to "ń", 3 to "ň", 4 to "ǹ"),
        'm' to mapOf(1 to "m\u0304", 2 to "ḿ", 4 to "m\u0300")
    )

    private val VOWELS = listOf('a', 'o', 'e', 'i', 'u', 'ü')

    /** 数字声调拼音 → 符号声调拼音，如 "di2" → "dí"、"lü4" → "lǜ"、"de" → "de" */
    fun numberToSymbolTone(pinyin: String): String {
        var i = pinyin.length - 1
        while (i >= 0 && pinyin[i].isDigit()) i--
        if (i == pinyin.length - 1) return pinyin   // 无数字声调

        val tone = pinyin.substring(i + 1).toIntOrNull() ?: return pinyin
        val base = pinyin.substring(0, i + 1)

        if (tone == 0) return base

        val vowelIndex = indexOfMainVowel(base)
        if (vowelIndex == -1) return base

        val mark = TONE_MARKS[base[vowelIndex]]?.get(tone) ?: return base
        return base.substring(0, vowelIndex) + mark + base.substring(vowelIndex + 1)
    }

    // 在拼音中找出应该标声调的元音索引（与 kuaizi-ime spell.mjs 一致）
    private fun indexOfMainVowel(py: String): Int {
        // 特殊处理 iu 和 ui
        if (py.contains("iu")) return py.lastIndexOf('u')
        if (py.contains("ui")) return py.lastIndexOf('i')
        if (py == "ng" || py == "n" || py == "hng") return py.lastIndexOf('n')
        if (py == "hm" || py == "m") return py.lastIndexOf('m')

        // 优先级顺序: a > o > e > i > u > ü
        for (vowel in VOWELS) {
            val idx = py.indexOf(vowel)
            if (idx != -1) return idx
        }
        return -1
    }
}
