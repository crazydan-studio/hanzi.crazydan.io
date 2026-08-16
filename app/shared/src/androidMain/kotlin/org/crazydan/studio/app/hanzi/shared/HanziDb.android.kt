package org.crazydan.studio.app.hanzi.shared

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.zip.Inflater

/**
 * Android 实现: 基于平台 sqlite（android.database.sqlite）只读查询，
 * 轨迹数据用 java.util.zip 解压（与 node 端 zlib.deflateSync 兼容），
 * 增量编码还原为绝对坐标后按 [StrokePoint] 返回。
 */
actual object HanziDbFactory {
    actual fun open(dbPath: String): HanziDb = AndroidHanziDb(dbPath)
}

private class AndroidHanziDb(dbPath: String) : HanziDb {

    private val db: SQLiteDatabase =
        SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY)

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
        queryAll(
            "SELECT character, pinyin FROM characters ORDER BY used_weight DESC, character ASC",
            null
        ) { cursor ->
            val reading = readingForPlain(JSONArray(cursor.getString(1)), plainPinyin) ?: return@queryAll
            out.add(CharEntry(cursor.getString(0), reading))
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

    override fun close() {
        db.close()
    }

    // 列表条目 [字, 第一个读音]
    private fun entry(cursor: Cursor): CharEntry {
        val readings = JSONArray(cursor.getString(1))
        val first = if (readings.length() > 0) readings.getString(0) else ""
        return CharEntry(cursor.getString(0), first)
    }

    // 无声调匹配: 首个 stripTone(读音) == 无声调拼音 的读音（与 build/export-data.js 一致）
    private fun readingForPlain(readings: JSONArray, plain: String): String? {
        for (i in 0 until readings.length()) {
            val reading = readings.getString(i)
            if (stripTone(reading) == plain) return reading
        }
        return null
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
