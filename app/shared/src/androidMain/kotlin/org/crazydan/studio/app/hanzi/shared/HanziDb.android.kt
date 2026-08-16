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
 * 拼音查询索引由 [ensurePinyinIndexes] 在端侧创建（见接口注释）。
 */
actual object HanziDbFactory {
    actual fun open(dbPath: String): HanziDb = AndroidHanziDb(dbPath)
}

private class AndroidHanziDb(dbPath: String) : HanziDb {

    // 建索引需要写权限（仅首次/数据库更新时写入，日常为只读查询）
    private val db: SQLiteDatabase =
        SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READWRITE)

    override fun queryCommons(limit: Int): List<CharEntry> {
        val out = ArrayList<CharEntry>(limit)
        queryAll(
            "SELECT character, pinyin FROM characters " +
                "ORDER BY used_weight DESC, character ASC LIMIT ?",
            arrayOf(limit.toString())
        ) { cursor ->
            out.add(entry(cursor))
        }
        return out
    }

    override fun queryPinyinList(plainPinyin: String): List<CharEntry> {
        val out = ArrayList<CharEntry>()
        // 走端侧拼音关联表（ensurePinyinIndexes 创建），避免全表扫描与读音 JSON 解析
        queryAll(
            "SELECT c.character, p.value AS reading " +
                "FROM pinyin_plain pp " +
                "JOIN pinyin_map pm ON pm.plain_id = pp.id " +
                "JOIN pinyin p ON p.id = pm.pinyin_id " +
                "JOIN char_pinyin cp ON cp.pinyin_id = p.id " +
                "JOIN characters c ON c.id = cp.character_id " +
                "WHERE pp.value = ? " +
                "ORDER BY cp.used_weight DESC, c.character ASC",
            arrayOf(plainPinyin)
        ) { cursor ->
            out.add(CharEntry(cursor.getString(0), cursor.getString(1)))
        }
        return out
    }

    override fun queryCharMeta(unicode: Int): CharMeta? {
        return queryFirst(
            "SELECT character, pinyin, total_stroke_count, radical, structure " +
                "FROM characters WHERE id = ?",
            arrayOf(unicode.toString())
        ) { cursor ->
            val pinyin = JSONArray(cursor.getString(1))
            CharMeta(
                character = cursor.getString(0),
                unicode = unicode,
                pinyin = List(pinyin.length()) { pinyin.getString(it) },
                totalStrokeCount = cursor.getInt(2),
                radical = cursor.getString(3),
                structure = cursor.getInt(4)
            )
        }
    }

    override fun queryCharStrokes(unicode: Int): List<CharStroke> {
        val out = ArrayList<CharStroke>()
        queryAll(
            "SELECT stroke_order, stroke_type, trajectory_data FROM strokes " +
                "WHERE character_id = ? ORDER BY stroke_order",
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
                // 时间戳 ×10 存储，还原为毫秒
                val point = prev?.let {
                    StrokePoint(
                        x = it.x + p.getDouble(0).toFloat(),
                        y = it.y + p.getDouble(1).toFloat(),
                        pressure = p.getDouble(2).toFloat() / PRESSURE_SCALE,
                        timestamp = it.timestamp + p.getDouble(3).toFloat() / TIMESTAMP_SCALE
                    )
                } ?: StrokePoint(
                    x = p.getDouble(0).toFloat(),
                    y = p.getDouble(1).toFloat(),
                    pressure = p.getDouble(2).toFloat() / PRESSURE_SCALE,
                    timestamp = p.getDouble(3).toFloat() / TIMESTAMP_SCALE
                )
                list.add(point)
                prev = point
            }
            out.add(CharStroke(cursor.getInt(0), cursor.getInt(1), list))
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
                "CREATE TABLE char_pinyin (" +
                    "character_id INTEGER NOT NULL, " +
                    "pinyin_id INTEGER NOT NULL, " +
                    "used_weight INTEGER NOT NULL DEFAULT 0)"
            )
            db.execSQL("CREATE INDEX idx_characters_weight ON characters(used_weight DESC, character ASC)")
            db.execSQL("CREATE INDEX idx_pinyin_map_plain ON pinyin_map(plain_id, pinyin_id)")
            db.execSQL("CREATE INDEX idx_char_pinyin_pinyin ON char_pinyin(pinyin_id, used_weight, character_id)")

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
        val insCharPinyin = db.compileStatement(
            "INSERT INTO char_pinyin(character_id, pinyin_id, used_weight) VALUES (?, ?, ?)"
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

        queryAll("SELECT id, pinyin, used_weight FROM characters", null) { cursor ->
            val characterId = cursor.getLong(0)
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
                insCharPinyin.bindLong(1, characterId)
                insCharPinyin.bindLong(2, pinyinId)
                insCharPinyin.bindLong(3, weight.toLong())
                insCharPinyin.executeInsert()
            }
        }
    }

    override fun close() {
        db.close()
    }

    // 列表条目 [字, 第一个读音]
    private fun entry(cursor: Cursor): CharEntry {
        val readings = JSONArray(cursor.getString(1))
        val first = if (readings.length() > 0) readings.getString(0) else ""
        return CharEntry(cursor.getString(0), first)
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

    // 查询所有行并逐行执行 block（Cursor 自动关闭）
    private fun queryAll(sql: String, args: Array<String>?, block: (Cursor) -> Unit) {
        db.rawQuery(sql, args).use { cursor ->
            while (cursor.moveToNext()) {
                block(cursor)
            }
        }
    }

    // 仅取首行执行 block；无结果返回 null
    private fun <T> queryFirst(sql: String, args: Array<String>?, block: (Cursor) -> T): T? {
        val cursor = db.rawQuery(sql, args)
        cursor.use {
            if (cursor.moveToFirst()) return block(cursor)
        }
        return null
    }

    companion object {
        private const val PRESSURE_SCALE = 100f   // 压力 ×100 存储（trajectory.js v7）
        private const val TIMESTAMP_SCALE = 10f   // 时间戳 ×10 存储（trajectory.js v7）
    }
}
