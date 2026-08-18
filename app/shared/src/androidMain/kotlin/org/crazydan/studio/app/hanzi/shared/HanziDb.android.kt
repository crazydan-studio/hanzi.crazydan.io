package org.crazydan.studio.app.hanzi.shared

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteStatement
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.zip.Inflater
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

    // 建索引需要写权限（仅首次/数据库更新时写入，日常为只读查询）
    private val db: SQLiteDatabase =
        SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READWRITE)

    // 笔画数据库（独立下载，用户指定位置）: 未配置/无效时为 null
    // 笔画数据库（独立下载，导入到固定位置）: 未导入/无效时不可查询
    private var strokeDb: SQLiteDatabase? = null
    private var strokeInfo: StrokeDbInfo? = null
    private var strokeDbState: StrokeDbState = StrokeDbState.MISSING

    // 固定位置: 与内置信息库同目录的 hanzi_stroke.db
    private fun fixedStrokeDbFile(): java.io.File =
        java.io.File(java.io.File(dbPath).parentFile, "hanzi_stroke.db")

    /** 校验库文件（表结构 + 数据量）；无效返回 null */
    override fun validateStrokeDb(path: String): StrokeDbInfo? {
        return try {
            val sdb = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)
            try {
                val hasStrokes = sdb.rawQuery(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'strokes'", null
                ).use { it.moveToFirst() }
                if (!hasStrokes) return null
                val ziCount = sdb.rawQuery(
                    "SELECT COUNT(*) FROM (SELECT DISTINCT zi_id FROM strokes)", null
                ).use {
                    it.moveToFirst()
                    it.getInt(0)
                }
                val strokeCount = sdb.rawQuery("SELECT COUNT(*) FROM strokes", null).use {
                    it.moveToFirst()
                    it.getInt(0)
                }
                if (ziCount <= 0) return null
                StrokeDbInfo(ziCount, strokeCount)
            } finally {
                sdb.close()
            }
        } catch (e: Exception) {
            null
        }
    }

    /** 导入到固定位置: 复制 + 替换，成功后立即生效；失败返回 false */
    override fun importStrokeDb(sourcePath: String): Boolean {
        return try {
            val target = fixedStrokeDbFile()
            val tmp = java.io.File(target.parentFile, "hanzi_stroke.db.tmp")
            java.io.File(sourcePath).inputStream().use { input ->
                tmp.outputStream().use { output -> input.copyTo(output) }
            }
            // 复制后再次校验，确认导入内容有效
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
            false
        }
    }

    override fun strokeDbStatus(): StrokeDbStatus {
        // 目标库缺失/损坏时重新探测状态（文件可能被外部删除）
        ensureStrokeDbOpen()
        if (strokeDbState != StrokeDbState.READY) {
            val file = fixedStrokeDbFile()
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
    private fun reopenStrokeDb(file: java.io.File): StrokeDbState {
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
        queryAll(db,
            "SELECT zi, pinyin FROM zi " +
                "ORDER BY used_weight DESC, zi ASC LIMIT ?",
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
            "SELECT c.zi, p.value AS reading " +
                "FROM pinyin_plain pp " +
                "JOIN pinyin_map pm ON pm.plain_id = pp.id " +
                "JOIN pinyin p ON p.id = pm.pinyin_id " +
                "JOIN zi_pinyin cp ON cp.pinyin_id = p.id " +
                "JOIN zi c ON c.id = cp.zi_id " +
                "WHERE pp.value = ? " +
                "ORDER BY cp.used_weight DESC, c.zi ASC",
            arrayOf(plainPinyin)
        ) { cursor ->
            out.add(ZiEntry(cursor.getString(0), cursor.getString(1)))
        }
        return out
    }

    override fun queryZiMeta(unicode: Int): ZiMeta? {
        return queryFirst(db,
            "SELECT zi, pinyin, total_stroke_count, radical, structure " +
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
                structure = cursor.getInt(4)
            )
        }
    }

    override fun queryZiStrokes(unicode: Int): List<ZiStroke> {
        ensureStrokeDbOpen()   // 未导入/无效时返回空列表
        val sdb = strokeDb ?: return emptyList()
        val out = ArrayList<ZiStroke>()
        queryAll(sdb,
            "SELECT stroke_order, stroke_type, trajectory_data FROM strokes " +
                "WHERE zi_id = ? ORDER BY stroke_order",
            arrayOf(unicode.toString())
        ) { cursor ->
            val traj = try {
                decompress(cursor.getBlob(2))
            } catch (e: Exception) {
                return@queryAll   // 数据损坏则跳过该笔画
            }
            val points = traj.getJSONArray("points")
            val list = ArrayList<StrokePoint>(points.length())
            var prev: StrokePoint? = null
            for (i in 0 until points.length()) {
                val p = points.getJSONArray(i)
                // 增量编码: 首点绝对，后续为与上一点的差值（与 server/services/trajectory.js 一致）；
                // x/y 盒相对归一化 ×1000、时间戳 ×10 存储，还原为盒相对浮点与毫秒
                val point = prev?.let {
                    StrokePoint(
                        x = it.x + p.getDouble(0).toFloat(),
                        y = it.y + p.getDouble(1).toFloat(),
                        pressure = p.getDouble(2).toFloat() / StrokeFormat.PRESSURE_SCALE,
                        timestamp = it.timestamp + p.getDouble(3).toFloat() / StrokeFormat.TIMESTAMP_SCALE
                    )
                } ?: StrokePoint(
                    x = p.getDouble(0).toFloat(),
                    y = p.getDouble(1).toFloat(),
                    pressure = p.getDouble(2).toFloat() / StrokeFormat.PRESSURE_SCALE,
                    timestamp = p.getDouble(3).toFloat() / StrokeFormat.TIMESTAMP_SCALE
                )
                list.add(point)
                prev = point
            }
            out.add(ZiStroke(cursor.getInt(0), cursor.getInt(1), traj.optInt("brush", 0), list))
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
            db.execSQL("CREATE INDEX idx_zi_weight ON zi(used_weight DESC, zi ASC)")
            db.execSQL("CREATE INDEX idx_pinyin_map_plain ON pinyin_map(plain_id, pinyin_id)")
            db.execSQL("CREATE INDEX idx_zi_pinyin_pinyin ON zi_pinyin(pinyin_id, used_weight, zi_id)")

            fillPinyinIndexes()
            db.execSQL("COMMIT")
        } catch (e: Exception) {
            db.execSQL("ROLLBACK")
            throw e
        }
    }

    // 填充关联表: 每字每无声调拼音仅保留首条读音（与 build/export-data.js 逻辑一致）
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

        queryAll(db, "SELECT id, pinyin, used_weight FROM zi", null) { cursor ->
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

    // 列表条目 [字, 第一个读音]
    private fun entry(cursor: Cursor): ZiEntry {
        val readings = JSONArray(cursor.getString(1))
        val first = if (readings.length() > 0) readings.getString(0) else ""
        return ZiEntry(cursor.getString(0), first)
    }

    // 数字声调拼音 → 无声调拼音（去掉尾部声调数字）
    private fun stripTone(pinyin: String): String = pinyin.replace(Regex("\\d+$"), "")

    // zlib 解压（node 端 zlib.deflateSync 压缩的轨迹 JSON {version, points}）
    private fun decompress(data: ByteArray): JSONObject {
        val inflater = Inflater()
        try {
            inflater.setInput(data)
            val out = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            while (!inflater.finished()) {
                val n = inflater.inflate(buf)
                if (n == 0 && inflater.needsInput()) break
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
