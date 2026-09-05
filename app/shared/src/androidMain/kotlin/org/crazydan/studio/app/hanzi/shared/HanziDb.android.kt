package org.crazydan.studio.app.hanzi.shared

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteStatement
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.Inflater

private const val TAG = "HanziDb"

/**
 * Android 实现: 基于平台 sqlite（android.database.sqlite）只读查询，
 * 轨迹数据用 java.util.zip 解压（与 node 端 zlib.deflateSync 兼容），
 * 增量编码还原为绝对坐标后按 [StrokePoint] 返回。
 * 数据源拆分: 汉字信息库（内置 hanzi.db）+ 笔画数据库（导入到固定位置 hanzi_stroke.db）。
 * 拼音查询索引由 [ensurePinyinIndexes] 在端侧创建（见接口注释）。
 */
actual object HanziDbFactory {
    actual fun open(dbPath: String): HanziDb = AndroidHanziDb(dbPath)
}

private class AndroidHanziDb(private val dbPath: String) : HanziDb {

    // 以读写方式打开: 建拼音索引需要写权限（仅首次/数据库更新时写入，日常查询只读）
    private val db: SQLiteDatabase =
        SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READWRITE)

    // 笔画数据库（导入到固定位置）: 未导入/无效时不可查询
    private var strokeDb: SQLiteDatabase? = null
    private var strokeInfo: StrokeDbInfo? = null
    private var strokeDbState: StrokeDbState = StrokeDbState.MISSING

    // 固定位置: 与内置信息库同目录的 hanzi_stroke.db
    private fun fixedStrokeDbFile(): File =
        File(File(dbPath).parentFile, "hanzi_stroke.db")

    /** 校验库文件（表结构 + 数据量）；无效返回 null */
    override fun validateStrokeDb(path: String): StrokeDbInfo? {
        return try {
            val sdb = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)
            try {
                val hasStrokes = sdb.rawQuery(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'strokes'", null
                ).use { it.moveToFirst() }
                if (!hasStrokes) return null
                // 单字单行: 每行即一个汉字的整字笔画（zi_id 主键），行数即汉字数
                val ziCount = sdb.rawQuery("SELECT COUNT(*) FROM strokes", null).use {
                    it.moveToFirst()
                    it.getInt(0)
                }
                // 笔画总数 = 各行笔画数之和（stroke_count 列，非行数）
                val strokeCount = sdb.rawQuery(
                    "SELECT COALESCE(SUM(stroke_count), 0) FROM strokes", null
                ).use {
                    it.moveToFirst()
                    it.getInt(0)
                }
                if (ziCount <= 0) return null
                StrokeDbInfo(ziCount, strokeCount)
            } finally {
                sdb.close()
            }
        } catch (e: Exception) {
            Log.w(TAG, "校验笔画库失败: $path", e)
            null
        }
    }

    /** 扫描笔画数据库中的潜在安全风险对象（只读）; 空列表表示内容干净 */
    override fun scanStrokeDbRisks(path: String): List<String> {
        return try {
            val sdb = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)
            try {
                scanRisks(sdb)
            } finally {
                sdb.close()
            }
        } catch (e: Exception) {
            Log.w(TAG, "扫描笔画库风险失败: $path", e)
            emptyList()
        }
    }

    // 收集库内风险对象描述:
    //   - 除 strokes 外的表/视图/触发器（sqlite_ 内部对象除外）
    //   - 不属于 strokes 的独立索引
    //   - strokes 上的外键/级联配置
    private fun scanRisks(sdb: SQLiteDatabase): List<String> {
        val risks = ArrayList<String>()
        sdb.rawQuery(
            "SELECT type, name FROM sqlite_master " +
                "WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%' " +
                "ORDER BY type, name",
            null
        ).use { c ->
            while (c.moveToNext()) {
                val type = c.getString(0)
                val name = c.getString(1)
                if (type == "table" && name == "strokes") continue
                risks.add("${objectTypeName(type)}: $name")
            }
        }
        sdb.rawQuery(
            "SELECT name, tbl_name FROM sqlite_master " +
                "WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'",
            null
        ).use { c ->
            while (c.moveToNext()) {
                if (c.getString(1) == "strokes") continue   // 笔画表附属索引保留
                risks.add("索引: ${c.getString(0)}（表 ${c.getString(1)}）")
            }
        }
        foreignKeys(sdb, "strokes").forEach { fk ->
            risks.add("外键/级联: strokes.${fk[3]} → ${fk[2]}(${fk[4]})")
        }
        return risks
    }

    // sqlite_master 对象类型 → 展示名
    private fun objectTypeName(type: String): String = when (type) {
        "table" -> "表"
        "view" -> "视图"
        "trigger" -> "触发器"
        else -> type
    }

    // strokes 表上的外键引用（PRAGMA foreign_key_list: id, seq, table, from, to, on_update, on_delete, match）
    private fun foreignKeys(sdb: SQLiteDatabase, table: String): List<Array<String>> {
        val out = ArrayList<Array<String>>()
        sdb.rawQuery("PRAGMA foreign_key_list('$table')", null).use { c ->
            while (c.moveToNext()) {
                out.add(Array(8) { c.getString(it) })
            }
        }
        return out
    }

    /** 导入到固定位置: 复制 + 替换，成功后立即生效；失败返回 false */
    override fun importStrokeDb(sourcePath: String, sanitize: Boolean): Boolean {
        return try {
            val target = fixedStrokeDbFile()
            val tmp = File(target.parentFile, "hanzi_stroke.db.tmp")
            File(sourcePath).inputStream().use { input ->
                tmp.outputStream().use { output -> input.copyTo(output) }
            }
            // 复制后先消除风险对象（仅在副本上执行，源文件不受影响）
            if (sanitize) {
                val sanitized = sanitizeStrokeDb(tmp.absolutePath)
                if (!sanitized) {
                    tmp.delete()
                    return false
                }
            }
            // 消除后再次校验，确认导入内容有效
            val info = validateStrokeDb(tmp.absolutePath)
            if (info == null) {
                tmp.delete()
                return false
            }
            // 原子替换固定位置文件
            target.delete()
            if (!tmp.renameTo(target)) {
                tmp.copyTo(target, overwrite = true)
                tmp.delete()
            }
            // 打开新库并更新状态
            strokeDb?.close()
            strokeDb = null
            strokeInfo = null
            val sdb = SQLiteDatabase.openDatabase(target.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            strokeDb = sdb
            strokeInfo = info
            strokeDbState = StrokeDbState.READY
            true
        } catch (e: Exception) {
            Log.e(TAG, "导入笔画库失败: $sourcePath", e)
            false
        }
    }

    /** 消除笔画库风险对象（读写打开）: 删除 strokes 表以外的表/视图/触发器/多余索引，重建去外键的 strokes 表 */
    private fun sanitizeStrokeDb(path: String): Boolean {
        return try {
            val sdb = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE)
            try {
                sdb.beginTransaction()
                try {
                    // 0. 先删除全部视图/触发器（视图可能引用 strokes，DROP 表时会冲突）
                    sdb.rawQuery(
                        "SELECT type, name FROM sqlite_master " +
                            "WHERE type IN ('view','trigger') AND name NOT LIKE 'sqlite_%'",
                        null
                    ).use { c ->
                        while (c.moveToNext()) {
                            dropObject(sdb, c.getString(0), c.getString(1))
                        }
                    }
                    // 1. 重建去外键的 strokes 表——
                    //    避免后续 DROP 被引用表时在 foreign_keys=ON 下触发级联删除清空笔画数据
                    if (foreignKeys(sdb, "strokes").isNotEmpty()) {
                        rebuildStrokesWithoutForeignKeys(sdb)
                    }
                    // 2. 删除非核心表（sqlite_ 内部对象除外）
                    sdb.rawQuery(
                        "SELECT type, name FROM sqlite_master " +
                            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
                            "AND name != 'strokes'",
                        null
                    ).use { c ->
                        while (c.moveToNext()) {
                            dropObject(sdb, c.getString(0), c.getString(1))
                        }
                    }
                    // 3. 删除不属于 strokes 的独立索引
                    sdb.rawQuery(
                        "SELECT name, tbl_name FROM sqlite_master " +
                            "WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'",
                        null
                    ).use { c ->
                        while (c.moveToNext()) {
                            if (c.getString(1) == "strokes") continue
                            sdb.execSQL("DROP INDEX IF EXISTS \"${c.getString(0)}\"")
                        }
                    }
                    sdb.setTransactionSuccessful()
                } finally {
                    sdb.endTransaction()
                }
                true
            } finally {
                sdb.close()
            }
        } catch (e: Exception) {
            Log.w(TAG, "消除笔画库风险失败: $path", e)
            false
        }
    }

    private fun dropObject(sdb: SQLiteDatabase, type: String, name: String) {
        val verb = when (type) {
            "table" -> "TABLE"
            "view" -> "VIEW"
            "trigger" -> "TRIGGER"
            else -> return
        }
        sdb.execSQL("DROP $verb IF EXISTS \"$name\"")
    }

    /** 重建 strokes 表（去除外键/级联）: 按原列定义建新表 + 拷贝数据 + 替换 + 重建原索引 */
    private fun rebuildStrokesWithoutForeignKeys(sdb: SQLiteDatabase) {
        // 收集原列定义（PRAGMA table_info: cid, name, type, notnull, dflt_value, pk）
        val cols = ArrayList<Array<String>>()
        sdb.rawQuery("PRAGMA table_info('strokes')", null).use { c ->
            while (c.moveToNext()) {
                cols.add(Array(6) { c.getString(it) })
            }
        }
        if (cols.isEmpty()) return
        val colNames = cols.joinToString(", ") { "\"${it[1]}\"" }
        val defs = cols.joinToString(", ") { col ->
            buildString {
                append("\"${col[1]}\" ${col[2]}")
                if (col[3] == "1") append(" NOT NULL")
                if (col[5] == "1") append(" PRIMARY KEY")
            }
        }
        // 原 strokes 附属索引的建表语句（替换表后重建）
        val indexes = ArrayList<String>()
        sdb.rawQuery(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'strokes' AND sql IS NOT NULL",
            null
        ).use { c ->
            while (c.moveToNext()) indexes.add(c.getString(0))
        }
        sdb.execSQL("CREATE TABLE strokes_new ($defs)")
        sdb.execSQL("INSERT INTO strokes_new ($colNames) SELECT $colNames FROM strokes")
        sdb.execSQL("DROP TABLE strokes")
        sdb.execSQL("ALTER TABLE strokes_new RENAME TO strokes")
        indexes.forEach { sdb.execSQL(it) }
    }

    override fun strokeDbStatus(): StrokeDbStatus {
        // 目标库缺失/损坏时重新探测状态（文件可能被外部删除）;
        // READY 后文件被删除时同样回退探测（廉价的文件存在性检查）
        val file = fixedStrokeDbFile()
        if (strokeDbState == StrokeDbState.READY && !file.isFile) {
            strokeDb = null
            strokeInfo = null
            strokeDbState = StrokeDbState.MISSING
            return StrokeDbStatus(strokeDbState, strokeInfo)
        }
        ensureStrokeDbOpen()
        if (strokeDbState != StrokeDbState.READY) {
            if (!file.isFile) {
                strokeDbState = StrokeDbState.MISSING
            } else {
                strokeDbState = if (validateStrokeDb(file.absolutePath) != null) {
                    reopenStrokeDb(file)
                } else {
                    StrokeDbState.INVALID
                }
            }
        }
        return StrokeDbStatus(strokeDbState, strokeInfo)
    }

    /** 惰性打开固定位置库（首次查询/状态检查时） */
    private fun ensureStrokeDbOpen() {
        if (strokeDb != null) return
        val file = fixedStrokeDbFile()
        if (!file.isFile) {
            strokeDbState = StrokeDbState.MISSING
            return
        }
        strokeDbState = if (validateStrokeDb(file.absolutePath) != null) {
            reopenStrokeDb(file)
        } else {
            StrokeDbState.INVALID
        }
    }

    /** 重新打开固定位置库（文件在外部变化后） */
    private fun reopenStrokeDb(file: File): StrokeDbState {
        return try {
            val sdb = SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            val info = validateStrokeDb(file.absolutePath) ?: run {
                sdb.close()
                return StrokeDbState.INVALID
            }
            strokeDb?.close()
            strokeDb = sdb
            strokeInfo = info
            StrokeDbState.READY
        } catch (e: Exception) {
            Log.w(TAG, "打开笔画库失败: ${file.absolutePath}", e)
            StrokeDbState.INVALID
        }
    }

    override fun queryZiCount(): Int =
        db.rawQuery("SELECT COUNT(*) FROM zi", null).use {
            it.moveToFirst()
            it.getInt(0)
        }

    override fun queryCommons(limit: Int): List<ZiEntry> {
        val out = ArrayList<ZiEntry>(limit)
        // zi 为视图（char(id) 计算）: 权重降序、简体优先、再按 id（码点序 == 汉字序）
        queryAll(db,
            "SELECT zi, pinyin, is_traditional FROM zi " +
                "ORDER BY used_weight DESC, is_traditional ASC, id ASC LIMIT ?",
            arrayOf(limit.toString())
        ) { cursor ->
            out.add(entry(cursor))
        }
        return out
    }

    override fun queryPinyinList(plainPinyin: String): List<ZiEntry> {
        val out = ArrayList<ZiEntry>()
        // 走端侧拼音关联表（ensurePinyinIndexes 创建），避免全表扫描与读音 JSON 解析
        queryAll(db,
            "SELECT c.zi, p.value AS reading, c.is_traditional " +
                "FROM pinyin_plain pp " +
                "JOIN pinyin_map pm ON pm.plain_id = pp.id " +
                "JOIN pinyin p ON p.id = pm.pinyin_id " +
                "JOIN zi_pinyin cp ON cp.pinyin_id = p.id " +
                "JOIN zi c ON c.id = cp.zi_id " +
                "WHERE pp.value = ? " +
                "ORDER BY cp.used_weight DESC, c.is_traditional ASC, c.id ASC",
            arrayOf(plainPinyin)
        ) { cursor ->
            out.add(ZiEntry(cursor.getString(0), cursor.getString(1), cursor.getInt(2) == 1))
        }
        return out
    }

    override fun queryZiMeta(unicode: Int): ZiMeta? {
        return queryFirst(db,
            "SELECT zi, pinyin, total_stroke_count, radical, structure, is_traditional " +
                "FROM zi WHERE id = ?",
            arrayOf(unicode.toString())
        ) { cursor ->
            val pinyin = JSONArray(cursor.getString(1))
            ZiMeta(
                zi = cursor.getString(0),
                unicode = unicode,
                pinyin = List(pinyin.length()) { pinyin.getString(it) },
                totalStrokeCount = cursor.getInt(2),
                radical = cursor.getString(3),
                structure = cursor.getInt(4),
                isTraditional = cursor.getInt(5) == 1
            )
        }
    }

    override fun queryZiStrokes(unicode: Int): List<ZiStroke> {
        ensureStrokeDbOpen()   // 未导入/无效时返回空列表
        val sdb = strokeDb ?: return emptyList()
        // 单字单行: 整字笔画聚合为单 BLOB（{v, r, s: [[t, [b, 扁平点阵]], ...]}），
        // 笔画序号由数组下标推出; 扁平点阵为增量编码（每 4 个一组: x/y/pr/t）
        return queryFirst(sdb,
            "SELECT trajectory_data FROM strokes WHERE zi_id = ?",
            arrayOf(unicode.toString())
        ) { cursor ->
            val traj = try {
                decompress(cursor.getBlob(0))
            } catch (e: Exception) {
                Log.w(TAG, "解压笔画轨迹失败（数据损坏，返回空）: unicode=$unicode", e)
                return@queryFirst emptyList()
            }
            // 版本防御: 解压结构按当前版本解析；版本不符仅告警（旧数据仍按同构结构容错读取）
            val version = traj.optInt("v", 0)
            if (version != StrokeFormat.TRAJECTORY_VERSION) {
                Log.w(TAG, "笔画轨迹版本异常（v$version，期望 v${StrokeFormat.TRAJECTORY_VERSION}）: unicode=$unicode")
            }
            val strokes = traj.optJSONArray("s") ?: return@queryFirst emptyList()
            val out = ArrayList<ZiStroke>(strokes.length())
            for (i in 0 until strokes.length()) {
                val st = strokes.getJSONArray(i)
                val d = st.getJSONArray(1)
                out.add(ZiStroke(i + 1, st.getInt(0), d.getInt(0), decodeFlatPoints(d.getJSONArray(1))))
            }
            out
        } ?: emptyList()
    }

    // 扁平点阵增量编码 → 绝对坐标点（首点绝对，后续点四元组 x/y/pressure/timestamp
    // 均为与上一点的差值，与 server shared/stroke-format.js deltaEncode 一致）;
    // x/y 盒相对归一化 ×1000、pressure ×100、时间戳 ×10 存储，还原为盒相对浮点与毫秒
    private fun decodeFlatPoints(flat: JSONArray): List<StrokePoint> {
        val out = ArrayList<StrokePoint>(flat.length() / 4)
        var prev: StrokePoint? = null
        var i = 0
        while (i + 3 < flat.length()) {
            val point = prev?.let {
                StrokePoint(
                    x = it.x + flat.getDouble(i).toFloat(),
                    y = it.y + flat.getDouble(i + 1).toFloat(),
                    pressure = it.pressure + flat.getDouble(i + 2).toFloat() / StrokeFormat.PRESSURE_SCALE,
                    timestamp = it.timestamp + flat.getDouble(i + 3).toFloat() / StrokeFormat.TIMESTAMP_SCALE
                )
            } ?: StrokePoint(
                x = flat.getDouble(i).toFloat(),
                y = flat.getDouble(i + 1).toFloat(),
                pressure = flat.getDouble(i + 2).toFloat() / StrokeFormat.PRESSURE_SCALE,
                timestamp = flat.getDouble(i + 3).toFloat() / StrokeFormat.TIMESTAMP_SCALE
            )
            out.add(point)
            prev = point
            i += 4
        }
        return out
    }

    override fun ensurePinyinIndexes() {
        // 幂等: 关联表已存在则跳过（同源库只建一次）
        val exists = db.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pinyin'", null
        ).use { it.moveToFirst() }
        if (exists) return

        // 建表 + 填充在单个事务内完成，失败整体回滚（下次启动重建）
        db.execSQL("BEGIN IMMEDIATE")
        try {
            db.execSQL(
                "CREATE TABLE pinyin (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                    "value TEXT NOT NULL UNIQUE)"
            )
            db.execSQL(
                "CREATE TABLE pinyin_plain (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                    "value TEXT NOT NULL UNIQUE)"
            )
            db.execSQL(
                "CREATE TABLE pinyin_map (" +
                    "pinyin_id INTEGER PRIMARY KEY, " +   // 每个带声调拼音仅对应一个无声调拼音
                    "plain_id INTEGER NOT NULL)"
            )
            db.execSQL(
                "CREATE TABLE zi_pinyin (" +
                    "zi_id INTEGER NOT NULL, " +
                    "pinyin_id INTEGER NOT NULL, " +
                    "used_weight INTEGER NOT NULL DEFAULT 0)"
            )
            db.execSQL("CREATE INDEX idx_zi_weight ON meta_zi(used_weight DESC, id ASC)")
            db.execSQL("CREATE INDEX idx_pinyin_map_plain ON pinyin_map(plain_id, pinyin_id)")
            db.execSQL("CREATE INDEX idx_zi_pinyin_pinyin ON zi_pinyin(pinyin_id, used_weight, zi_id)")

            fillPinyinIndexes()
            db.execSQL("COMMIT")
        } catch (e: Exception) {
            db.execSQL("ROLLBACK")
            throw e
        }
    }

    // 填充关联表: 每字每无声调拼音仅保留首条读音（与 build/export-zi.js 逻辑一致）
    private fun fillPinyinIndexes() {
        val selPinyin = db.compileStatement("SELECT id FROM pinyin WHERE value = ?")
        val insPinyin = db.compileStatement("INSERT OR IGNORE INTO pinyin(value) VALUES (?)")
        val selPlain = db.compileStatement("SELECT id FROM pinyin_plain WHERE value = ?")
        val insPlain = db.compileStatement("INSERT OR IGNORE INTO pinyin_plain(value) VALUES (?)")
        val insMap = db.compileStatement(
            "INSERT OR IGNORE INTO pinyin_map(pinyin_id, plain_id) VALUES (?, ?)"
        )
        val insZiPinyin = db.compileStatement(
            "INSERT INTO zi_pinyin(zi_id, pinyin_id, used_weight) VALUES (?, ?, ?)"
        )

        // 内存缓存读音 id（读音重复率高，避免反复查库）
        val pinyinIds = HashMap<String, Long>()
        val plainIds = HashMap<String, Long>()

        // 缓存未命中 → 先 INSERT OR IGNORE 再查 id（插入后必存在，simpleQueryForLong 不会抛异常）
        fun idOf(cache: HashMap<String, Long>, insert: SQLiteStatement, select: SQLiteStatement, value: String): Long {
            cache[value]?.let { return it }
            insert.bindString(1, value)
            insert.executeInsert()
            select.bindString(1, value)
            val id = select.simpleQueryForLong()
            cache[value] = id
            return id
        }

        queryAll(db, "SELECT id, pinyin, used_weight FROM meta_zi", null) { cursor ->
            val ziId = cursor.getLong(0)
            val weight = cursor.getInt(2)
            val readings = JSONArray(cursor.getString(1))
            val seenPlain = HashSet<String>()
            for (i in 0 until readings.length()) {
                val reading = readings.getString(i)
                val plain = stripTone(reading)
                if (plain.isEmpty() || !seenPlain.add(plain)) continue
                val pinyinId = idOf(pinyinIds, insPinyin, selPinyin, reading)
                val plainId = idOf(plainIds, insPlain, selPlain, plain)
                insMap.bindLong(1, pinyinId)
                insMap.bindLong(2, plainId)
                insMap.executeInsert()
                insZiPinyin.bindLong(1, ziId)
                insZiPinyin.bindLong(2, pinyinId)
                insZiPinyin.bindLong(3, weight.toLong())
                insZiPinyin.executeInsert()
            }
        }
    }

    override fun close() {
        strokeDb?.close()
        strokeDb = null
        db.close()
    }

    // 列表条目 [字, 第一个读音, 繁体标记]
    private fun entry(cursor: Cursor): ZiEntry {
        val readings = JSONArray(cursor.getString(1))
        val first = if (readings.length() > 0) readings.getString(0) else ""
        return ZiEntry(cursor.getString(0), first, cursor.getInt(2) == 1)
    }

    // 数字声调拼音 → 无声调拼音（去掉尾部声调数字）
    private val STRIP_TONE_REGEX = Regex("\\d+$")

    private fun stripTone(pinyin: String): String = pinyin.replace(STRIP_TONE_REGEX, "")

    // zlib 解压（node 端 compressCharTrajectory 压缩的整字轨迹 JSON:
    // { v, r: [w,h], s: [[t, [b, 扁平增量点阵]], ...] }，见 shared/stroke-format.js）
    private fun decompress(data: ByteArray): JSONObject {
        val inflater = Inflater()
        try {
            inflater.setInput(data)
            val out = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            while (!inflater.finished()) {
                val n = inflater.inflate(buf)
                if (n == 0) break   // 数据异常（截断/需字典等）不再推进时退出，避免死循环
                out.write(buf, 0, n)
            }
            return JSONObject(String(out.toByteArray(), Charsets.UTF_8))
        } finally {
            inflater.end()
        }
    }

    // 查询所有行并逐行执行 block（Cursor 自动关闭）; db 为目标数据库
    private fun queryAll(db: SQLiteDatabase, sql: String, args: Array<String>?, block: (Cursor) -> Unit) {
        db.rawQuery(sql, args).use { cursor ->
            while (cursor.moveToNext()) {
                block(cursor)
            }
        }
    }

    // 仅取首行执行 block；无结果返回 null; db 为目标数据库
    private fun <T> queryFirst(db: SQLiteDatabase, sql: String, args: Array<String>?, block: (Cursor) -> T): T? {
        val cursor = db.rawQuery(sql, args)
        cursor.use {
            if (cursor.moveToFirst()) return block(cursor)
        }
        return null
    }
}
