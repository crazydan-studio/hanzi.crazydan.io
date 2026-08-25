// server/scripts/seed.js — 从JSON导入示例汉字（可扩展为通用导入器）
// 用法: node server/scripts/seed.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, closeDatabase } from '../services/database.js'
import { strokeService } from '../services/StrokeService.js'
import { ziService } from '../services/ZiService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
initDatabase()

const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'))

for (const item of seedData.zi) {
  const { strokes, ...ziData } = item
  try {
    const zi = ziService.create(ziData)
    if (strokes?.length) {
      strokeService.createBatch(zi.id, strokes)   // 事务批量插入
    }
    console.log(`Seeded: ${ziData.zi}`)
  } catch (e) {
    console.error(`Skipped ${ziData.zi}: ${e.message}`)
  }
}
console.log('Seed complete')
closeDatabase()
