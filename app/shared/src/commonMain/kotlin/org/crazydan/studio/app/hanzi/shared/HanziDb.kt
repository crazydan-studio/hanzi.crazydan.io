package org.crazydan.studio.app.hanzi.shared

/**
 * 汉字本地数据源（sqlite）
 *
 * 数据源拆分:
 *   - 汉字信息库（内置）: build/app-db-pack.js 打包的 hanzi.db（仅 zi 表），
 *     提供 常用字/拼音/汉字信息 查询
 *   - 笔画数据库（独立下载）: build/export-stroke-db.js 导出的 hanzi-stroke-{数量}.db，
 *     仅包含 strokes 表，由用户下载后经 [validateStrokeDb]/[importStrokeDb] 导入到
 *     固定位置（应用数据目录 hanzi_stroke.db）；汉字信息仍由内置 hanzi.db 提供
 */

/** 列表条目（常用字 / 拼音字列表）: [字, 读音] */
data class ZiEntry(
    val zi: String,
    val pinyin: String
)

/** 汉字信息（对应前端 meta.json） */
data class ZiMeta(
    val zi: String,
    val unicode: Int,
    val pinyin: List<String>,
    val totalStrokeCount: Int,
    val radical: String,
    val structure: Int          // 结构编码 0-9（展示名见 HanziLabels.structureNames）
)

/** 轨迹坐标点（绝对坐标，x/y 盒相对归一化 0..1000；pressure 0..1；timestamp 毫秒） */
data class StrokePoint(
    val x: Float,
    val y: Float,
    val pressure: Float,
    val timestamp: Float
)

/** 绘制时背景字光栅实测盒（内部坐标系像素，笔画坐标还原基准; v2 轨迹格式） */
data class StrokeBox(
    val w: Int,
    val h: Int
)

/** 单个笔画（对应前端 strokes.json 条目） */
data class ZiStroke(
    val strokeOrder: Int,
    val strokeType: Int,
    val brush: Int,             // 笔刷面积/背景字面积 比值 ×100000（整轨迹共享笔宽）
    val box: StrokeBox?,        // 光栅实测盒宽高（脱离字体按盒还原; 旧格式为 null）
    val points: List<StrokePoint>
)

/** 笔画数据库状态（当前可访问的笔画数据规模） */
data class StrokeDbInfo(
    val ziCount: Int,         // 可访问笔画数据的汉字数量
    val strokeCount: Int        // 笔画总数
)

/** 笔画数据库可用性状态（固定位置的库） */
enum class StrokeDbState { MISSING, INVALID, READY }

/** 笔画数据库状态（可用性 + 可访问规模） */
data class StrokeDbStatus(
    val state: StrokeDbState,
    val info: StrokeDbInfo?     // 可访问规模（READY 时非空）
)

/** 汉字数据源 */
interface HanziDb : AutoCloseable {

    /** 常用字列表 [字, 读音]，按使用权重降序，取前 limit 个 */
    fun queryCommons(limit: Int): List<ZiEntry>

    /** 拼音字列表 [字, 读音]，按使用权重降序；读音为无声调匹配到的第一个带声调读音 */
    fun queryPinyinList(plainPinyin: String): List<ZiEntry>

    /** 汉字信息；不存在时返回 null */
    fun queryZiMeta(unicode: Int): ZiMeta?

    /** 笔画数据（按笔顺排序，盒相对坐标）；该汉字无笔画时返回空列表 */
    fun queryZiStrokes(unicode: Int): List<ZiStroke>

    /** 汉字总数（内置信息库; 笔画数据「全部」规模说明用） */
    fun queryZiCount(): Int

    /** 校验所选笔画数据库文件（表结构 + 数据量）；无效/损坏时返回 null */
    fun validateStrokeDb(path: String): StrokeDbInfo?

    /**
     * 导入笔画数据库到固定位置（应用数据目录的 hanzi_stroke.db）:
     * 复制源文件并替换现有库，成功后即处于 READY 状态；失败返回 false
     */
    fun importStrokeDb(sourcePath: String): Boolean

    /** 当前笔画数据库状态（固定位置的库 + 可用性 + 可访问规模） */
    fun strokeDbStatus(): StrokeDbStatus

    /**
     * 创建拼音查询索引（端侧按需执行，幂等）:
     * 拼音索引不在打包时生成（避免增加安装包体积），由 App 启动复制数据库后创建。
     * 索引为紧凑关联表（整数 id 关联，控制体积）:
     *   - pinyin:        带声调拼音 id → 读音（如 di4）
     *   - pinyin_plain:  无声调拼音 id → 无声调拼音（如 di）
     *   - pinyin_map:    带声调拼音 id → 无声调拼音 id
     *   - zi_pinyin:   汉字 id + 带声调拼音 id + 权重（按字去重，每字每无声调拼音仅首条读音）
     * 另建 zi 权重索引（idx_zi_weight）。
     */
    fun ensurePinyinIndexes()
}

/** 数据源工厂（Android 实现基于平台 sqlite，见 androidMain/HanziDb.android.kt） */
expect object HanziDbFactory {
    fun open(dbPath: String): HanziDb
}

/** 取字符串首个字符的 Unicode 码点（兼容代理对，commonMain 下 String 无 codePointAt） */
fun unicodePointAt(s: String): Int {
    if (s.isEmpty()) return 0
    val c0 = s[0]
    if (c0.isHighSurrogate() && s.length > 1 && s[1].isLowSurrogate()) {
        val c1 = s[1]
        return 0x10000 + ((c0.code - 0xD800) shl 10) + (c1.code - 0xDC00)
    }
    return c0.code
}
