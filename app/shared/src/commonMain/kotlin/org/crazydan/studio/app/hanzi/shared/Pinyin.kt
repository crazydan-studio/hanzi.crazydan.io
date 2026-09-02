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

/**
 * 拼音分量编码（与前端 src/services/pinyinId.js 一致，跨端数值恒等）:
 * 数字声调拼音 → 唯一整数。不要求可逆，只保证唯一性——
 * 利用拼音结构: 声母(24, 含零声母) × 韵母(40) × 声调(5: 0-3 = 1~4 声, 4 = 轻声)
 *   id = ((声母下标 × 韵母数 + 韵母下标) × 5 + 声调槽) < 4800（13 位）
 * 解析规则: 整字命中韵母表 → 零声母; 否则取最长匹配声母剥离，余部须在韵母表
 *   （jue/xue/que/yue 的 ü 按拼写规则写 u → 韵母 ue; 叹词 n/m/ng/hm/hng 为整字韵母）
 * 注意: 声母/韵母表一经发布不可变，新增只追加到末尾（否则既有 id 变化）;
 *       入参须为规范数字声调拼音（ü 原样，v 需先归一化为 ü），含 v 将抛 IllegalArgumentException。
 */
object PinyinId {

    // 与前端 INITIALS/FINALS 逐项一致（顺序不可变）
    private val INITIALS = listOf(
        "", "zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
        "j", "q", "x", "r", "z", "c", "s", "y", "w"
    )
    private val FINALS = listOf(
        "a", "o", "e", "i", "u", "ü",
        "ai", "ei", "ao", "ou", "an", "en", "ang", "eng", "er",
        "ia", "ie", "iao", "ian", "iang", "iong", "in", "ing",
        "ua", "uo", "uai", "uan", "uang", "ui", "un", "ong",
        "ue", "üe", "ün", "iu", "n", "m", "ng", "hm", "hng"
    )

    /** 拼音 → 整数（如 "a" → 4、"de" → 1614、"di4" → 1618、"lü4" → 2228; 上限 4799）; 非法拼音抛异常 */
    fun toId(reading: String): Int {
        val tone = if (reading.last().isDigit()) reading.last().digitToInt() - 1 else 4
        val plain = if (reading.last().isDigit()) reading.dropLast(1) else reading

        var i = 0
        var f = FINALS.indexOf(plain)   // 整字韵母（零声母，含叹词）
        if (f == -1) {
            i = INITIALS.indexOfFirst { it.isNotEmpty() && plain.startsWith(it) }
            if (i != -1) f = FINALS.indexOf(plain.removePrefix(INITIALS[i]))
        }
        require(i != -1 && f != -1) { "非法拼音: $reading" }
        return (i * FINALS.size + f) * 5 + tone
    }
}
