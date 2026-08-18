// 打包「汉字信息」数据库到 App 资源目录（App 内置库; 笔画数据为独立库，另行导出/下载）
// 数据源: server/data/hanzi_stroke.db（WAL 模式）
// 产物:   app/android/src/main/assets/db/hanzi.db（仅 zi 表）+ hanzi.db.sha256
// 说明:
//   - 汉字信息（zi 表）在打包时单独导出，笔画数据（strokes 表）不打包
//     （见 build/export-stroke-db.js，经 pnpm export:stroke-db 生成后单独发布/下载）
//   - 汉字数据未变化时不重新生成（产物与上一次完全一致则跳过，避免重复构建差异）
//   - WAL 模式下直接复制主库文件可能丢失 WAL 中未落盘的写入，先 checkpoint 再导出
//   - 拼音索引不在打包时生成（避免增加安装包体积），由 App 启动复制数据库后
//     在端侧按需创建（见 HanziDb.ensurePinyinIndexes）
// 用法:
//   node build/app-db-pack.js
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC_DB = path.join(ROOT, 'server', 'data', 'hanzi_stroke.db')
const DST_DIR = path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'db')
const DST_DB = path.join(DST_DIR, 'hanzi.db')

function main() {
  if (!fs.existsSync(SRC_DB)) {
    console.error(`开发数据库不存在: ${SRC_DB}`)
    process.exit(1)
  }

  fs.mkdirSync(DST_DIR, { recursive: true })
  // 在临时目录中生成（部分环境对工作区新建 sqlite 文件的关闭存在异常），
  // 完成后复制到目标位置；同目录下先 checkpoint（WAL 中未落盘数据回主库）
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hanzi-db-'))
  const tmp = path.join(tmpDir, 'hanzi.db')
  try {
    const db = new DatabaseSync(SRC_DB)
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      const out = new DatabaseSync(tmp)
      try {
        out.exec(`
          CREATE TABLE zi (
            id INTEGER PRIMARY KEY,
            zi TEXT NOT NULL UNIQUE,
            pinyin TEXT NOT NULL DEFAULT '[]',
            used_weight INTEGER NOT NULL DEFAULT 0,
            structure INTEGER DEFAULT 0,
            radical TEXT NOT NULL DEFAULT '',
            total_stroke_count INTEGER NOT NULL DEFAULT 0
          )
        `)
        out.exec(`CREATE UNIQUE INDEX idx_zi_zi_unique ON zi(zi)`)
        const ins = out.prepare(`
          INSERT INTO zi (id, zi, pinyin, used_weight, structure, radical, total_stroke_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        const rows = db.prepare('SELECT id, zi, pinyin, used_weight, structure, radical, total_stroke_count FROM zi').all()
        for (const r of rows) {
          ins.run(r.id, r.zi, r.pinyin, r.used_weight ?? 0,
            r.structure ?? 0, r.radical ?? '', r.total_stroke_count ?? 0)
        }
      } finally {
        out.close()
      }
    } finally {
      db.close()
    }

    // 汉字数据未变化（产物与上一次逐字节一致）→ 跳过，避免重复生成
    const content = fs.readFileSync(tmp)
    if (fs.existsSync(DST_DB) && fs.readFileSync(DST_DB).equals(content)) {
      console.log(`汉字数据未变化，跳过生成 → ${DST_DB}`)
      return
    }
    fs.copyFileSync(tmp, DST_DB)
    fs.rmSync(DST_DB + '.sha256', { force: true })

    // 构建时计算库的 SHA-256 并写入旁路文件（App 启动直接读取，
    // 避免每次启动重复计算 hash 浪费 CPU）
    const hash = createHash('sha256').update(content).digest('hex')
    fs.writeFileSync(`${DST_DB}.sha256`, `${hash}\n`)

    const size = content.length
    console.log(`已打包数据库 → ${DST_DB}（${(size / 1024 / 1024).toFixed(2)} MB，hash ${hash.slice(0, 12)}…）`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

main()
