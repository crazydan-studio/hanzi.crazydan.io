// 打包开发数据库到 App 资源目录（App 内 sqlite 数据源）
// 数据源: server/data/hanzi_stroke.db（WAL 模式）
// 产物:   app/android/src/main/assets/db/hanzi.db
// 说明:
//   - WAL 模式下直接复制主库文件可能丢失 WAL 中未落盘的写入，先 checkpoint 再导出
//   - 用 VACUUM INTO 生成紧凑单文件（含 WAL 数据、无空闲页）；失败时退化为 checkpoint 后直接复制
//   - 拼音索引不在打包时生成（避免增加安装包体积），由 App 启动复制数据库后
//     在端侧按需创建（见 HanziDb.ensurePinyinIndexes）
// 用法:
//   node build/app-db-pack.js
import { DatabaseSync } from 'node:sqlite'
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
  // VACUUM INTO 要求目标文件不存在
  fs.rmSync(DST_DB, { force: true })

  const db = new DatabaseSync(SRC_DB)
  try {
    // 先将 WAL 中未落盘数据 checkpoint 回主库，保证导出数据完整
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    try {
      db.exec(`VACUUM INTO '${DST_DB.replace(/'/g, "''")}'`)
    } catch (err) {
      console.warn(`VACUUM INTO 失败（${err.message}），退化为直接复制`)
      fs.copyFileSync(SRC_DB, DST_DB)
    }
  } finally {
    db.close()
  }

  const size = fs.statSync(DST_DB).size
  console.log(`已打包数据库 → ${DST_DB}（${(size / 1024 / 1024).toFixed(2)} MB）`)
}

main()
