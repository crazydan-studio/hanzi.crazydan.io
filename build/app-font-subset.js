// 精简中易楷体: 仅保留汉字库（characters 表）内的汉字，降低字体文件大小
// 数据源:
//   - server/data/hanzi_stroke.db（characters 表，id = 汉字 unicode 数值）
//   - build/fonts/ZhongYiKaiTi.ttf（全量中易楷体，构建资源，不随 App 打包）
// 产物:
//   - app/android/src/main/assets/font/ZhongYiKaiTi.ttf（App 内置子集;
//     createFromAsset 对 TTF 支持最可靠）
//   - public/fonts/ZhongYiKaiTi.woff2（web 端静态字体，覆盖库内全部汉字，
//     消除回退字体导致的测量/渲染异常）
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
const SRC_FONT = path.join(ROOT, 'build', 'fonts', 'ZhongYiKaiTi.ttf')
const DSTS = [
  { file: path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'font', 'ZhongYiKaiTi.ttf'), format: 'truetype' },
  { file: path.join(ROOT, 'public', 'fonts', 'ZhongYiKaiTi.woff2'), format: 'woff2' }
]

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

  // 2. 字体子集（harfbuzz hb-subset，保留字形轮廓与 cmap）: App 用 TTF、web 用 woff2
  const original = fs.readFileSync(SRC_FONT)
  for (const { file, format } of DSTS) {
    const subset = await subsetFont(original, chars, { targetFormat: format })
    fs.writeFileSync(file, subset)
  }

  // 3. 报告
  const size = (a) => (a / 1024 / 1024).toFixed(2)
  for (const { file, format } of DSTS) {
    const out = fs.statSync(file).size
    console.log(`已精简中易楷体（${format}）→ ${path.relative(ROOT, file)}（${size(out)} MB）`)
  }
  console.log(`  源字体: ${size(original.length)} MB`)
}

main()
