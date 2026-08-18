// 导出「汉字笔画数据」独立数据库（App 端按需下载使用）
// 数据源: server/data/hanzi_stroke.db（笔画数据开发库，与 app-db-pack.js 同源）
// 产物:   {输出目录}/hanzi-stroke-{数量}.db（如 hanzi-stroke-1500.db）/ hanzi-stroke-full.db
// 结构:   仅包含 strokes 表（汉字信息由 App 内置库 hanzi.db 提供，不重复携带）
// 排序:   汉字按其所有拼音中权重最大的值（zi.used_weight）降序排列，
//         再导出指定数量的汉字的笔画数据；缺省导出全部（full）
// 用法:
//   pnpm export:stroke-db                          # 导出全部（full）到 dist/assets
//   pnpm export:stroke-db -- --count 1500          # 导出权重最高的前 1500 个汉字
//   pnpm export:stroke-db -- --out /path/to/dir    # 指定导出位置
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'path'
import fs from 'fs'
import { STROKE_DB_PATH, DIST_DIR } from '../paths.js'

const SRC_DB = STROKE_DB_PATH
const DEFAULT_OUT = path.join(DIST_DIR, 'assets')

function parseArgs() {
  const args = process.argv.slice(2)
  let count = null   // null = 全部
  let out = DEFAULT_OUT
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--count' && args[i + 1]) {
      const n = Number(args[++i])
      if (Number.isInteger(n) && n > 0) count = n
    } else if (a === '--out' && args[i + 1]) {
      out = path.resolve(args[++i])
    } else if (a === '--help' || a === '-h') {
      console.log('用法: node build/export-stroke-db.js [--count N] [--out <目录>]（缺省导出全部到 dist/assets）')
      process.exit(0)
    }
  }
  return { count, out }
}

// 重建表结构（仅笔画表; 汉字信息由 App 内置库 hanzi.db 提供）
const CREATE_STROKES = `
  CREATE TABLE strokes (
    id INTEGER PRIMARY KEY,
    zi_id INTEGER NOT NULL,
    stroke_order INTEGER NOT NULL,
    stroke_type INTEGER NOT NULL DEFAULT 0,
    trajectory_data BLOB NOT NULL
  );
  CREATE INDEX idx_strokes_zi_id ON strokes(zi_id)`

function main() {
  const { count, out: OUT_DIR } = parseArgs()
  if (!fs.existsSync(SRC_DB)) {
    console.error(`笔画库不存在: ${SRC_DB}`)
    process.exit(1)
  }

  const src = new DatabaseSync(SRC_DB, { readOnly: true })

  // 1. 读取全部有笔画数据的汉字（zi.used_weight = 所有拼音中最大权重，导出时已计算）
  const zis = src.prepare(`
    SELECT c.id, c.zi, c.pinyin, c.used_weight, c.structure, c.radical, c.total_stroke_count
    FROM zi c
    WHERE EXISTS (SELECT 1 FROM strokes s WHERE s.zi_id = c.id)
  `).all()
  // 权重降序，权重相同按汉字升序（与常用字列表一致）
  zis.sort((a, b) =>
    (b.used_weight ?? 0) - (a.used_weight ?? 0) || (a.zi < b.zi ? -1 : 1))

  const selected = count != null ? zis.slice(0, count) : zis
  if (selected.length === 0) {
    console.log('笔画库中暂无笔画数据，未生成导出文件')
    src.close()
    return
  }

  // 2. 读取所选汉字的笔画轨迹（BLOB 原样拷贝，增量编码+压缩格式不变）
  const idSet = new Set(selected.map(c => c.id))
  const strokes = src.prepare(
    'SELECT zi_id, stroke_order, stroke_type, trajectory_data FROM strokes ORDER BY zi_id, stroke_order'
  ).all().filter(s => idSet.has(s.zi_id))
  src.close()

  // 3. 生成独立库（在临时目录中生成后复制到输出目录，部分环境对工作区新建
  //    sqlite 文件的关闭存在异常）
  const tag = count != null ? String(count) : 'full'
  const fileName = `hanzi-stroke-${tag}.db`
  const outFile = path.join(OUT_DIR, fileName)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hanzi-stroke-'))
  const tmp = path.join(tmpDir, fileName)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.rmSync(outFile, { force: true })

  try {
    const out = new DatabaseSync(tmp)
    try {
      out.exec(CREATE_STROKES)
      const insStroke = out.prepare(`
        INSERT INTO strokes (zi_id, stroke_order, stroke_type, trajectory_data)
        VALUES (?, ?, ?, ?)`)
      for (const s of strokes) {
        insStroke.run(s.zi_id, s.stroke_order, s.stroke_type, s.trajectory_data)
      }
    } finally {
      out.close()
    }
    fs.copyFileSync(tmp, outFile)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  const size = fs.statSync(outFile).size
  console.log(`已导出笔画库 → ${outFile}`)
  console.log(`  汉字数量: ${selected.length}${count != null ? `（笔画库共有 ${zis.length} 个有笔画数据的汉字）` : ''}`)
  console.log(`  笔画总数: ${strokes.length}`)
  console.log(`  文件大小: ${(size / 1024 / 1024).toFixed(2)} MB`)
}

main()
