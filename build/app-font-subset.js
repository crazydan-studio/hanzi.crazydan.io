// 精简 App 携带的中易楷体: 仅保留汉字库（characters 表）内的汉字并转为 woff2，
// 降低字体文件大小
// 数据源: server/data/hanzi_stroke.db（characters 表，id = 汉字 unicode 数值）
// 产物:   app/android/src/main/assets/font/ZhongYiKaiTi.woff2
//         （Android 8.0+ createFromAsset 支持 woff2；App 加载见 Theme.android.kt）
// 用法:
//   pnpm app:font
// 说明: 字体本身不含的汉字（极少数生僻字）与库外汉字由系统字体回退渲染
import { DatabaseSync } from 'node:sqlite'
import subsetFontPkg from 'subset-font'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const subsetFont = subsetFontPkg   // CJS 默认导出（模块本身即为子集函数）

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC_DB = path.join(ROOT, 'server', 'data', 'hanzi_stroke.db')
const SRC_FONT = path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'font', 'ZhongYiKaiTi.ttf')
const DST_FONT = path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'font', 'ZhongYiKaiTi.woff2')

async function main() {
  if (!fs.existsSync(SRC_DB)) {
    console.error(`汉字库不存在: ${SRC_DB}`)
    process.exit(1)
  }
  if (!fs.existsSync(SRC_FONT)) {
    console.error(`中易楷体不存在: ${SRC_FONT}`)
    process.exit(1)
  }

  // 1. 汉字库内全部汉字
  const db = new DatabaseSync(SRC_DB, { readOnly: true })
  const rows = db.prepare('SELECT character FROM characters').all()
  db.close()
  const chars = rows.map(r => r.character).join('')
  console.log(`汉字库汉字数量: ${chars.length}`)

  // 2. 字体子集 + 压缩（harfbuzz hb-subset，保留字形轮廓与 cmap）→ woff2
  const original = fs.readFileSync(SRC_FONT)
  const subset = await subsetFont(original, chars, { targetFormat: 'woff2' })

  // 3. 写入产物（幂等: 内容一致时不影响 git 差异）
  fs.writeFileSync(DST_FONT, subset)
  const size = (a) => (a / 1024 / 1024).toFixed(2)
  console.log(`已精简中易楷体 → ${DST_FONT}`)
  console.log(`  文件大小: ${size(original.length)} MB → ${size(subset.length)} MB（-${Math.round(100 * (1 - subset.length / original.length))}%）`)
}

main()
