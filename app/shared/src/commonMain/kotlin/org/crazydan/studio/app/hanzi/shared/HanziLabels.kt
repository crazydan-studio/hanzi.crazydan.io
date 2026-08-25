package org.crazydan.studio.app.hanzi.shared

/**
 * 汉字展示标签（与前端 src/components/ZiStructures.js、StrokeTypes.js 一致）
 */
object HanziLabels {

    /** 结构编码 → 展示名（不含「结构」二字；10-16 为半包围按包围方向细分） */
    val structureNames: Map<Int, String> = mapOf(
        0 to "未指定", 1 to "独体", 2 to "左右", 3 to "左中右", 4 to "上下",
        5 to "上中下", 6 to "全包围", 7 to "半包围", 8 to "品字", 9 to "镶嵌",
        10 to "左上包围", 11 to "右上包围", 12 to "左下包围",
        13 to "上包围", 14 to "下包围", 15 to "左包围", 16 to "右包围"
    )

    /** 笔画类型编码 → 名称（35 种细化类型 + 未指定） */
    val strokeTypeNames: Map<Int, String> = mapOf(
        0 to "未指定", 1 to "点", 2 to "横", 3 to "竖", 4 to "撇", 5 to "捺", 6 to "提",
        7 to "横折", 8 to "横撇", 9 to "横钩", 10 to "横折钩", 11 to "横折提",
        12 to "横折弯", 13 to "横折折", 14 to "横斜钩", 15 to "横折弯钩",
        16 to "横撇弯钩", 17 to "横折折撇", 18 to "横折折折钩", 19 to "横折折折",
        20 to "竖提", 21 to "竖折", 22 to "竖钩", 23 to "竖弯", 24 to "竖弯钩",
        25 to "竖折撇", 26 to "竖折折", 27 to "竖折折钩", 28 to "撇点", 29 to "撇折",
        30 to "斜钩", 31 to "弯钩", 32 to "卧钩", 33 to "平捺", 34 to "点撇", 35 to "点捺"
    )

    fun structureName(code: Int): String = structureNames[code] ?: "未指定"

    fun strokeTypeName(code: Int): String = strokeTypeNames[code] ?: "未指定"
}
