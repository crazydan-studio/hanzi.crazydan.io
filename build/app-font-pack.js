// 打包中易楷体（不做精简，保证全部字形可用，避免页面乱码）:
//  - App 内置: 直接使用全量 TTF（build/fonts/ZhongYiKaiTi.ttf）
//  - web 端:   全量字体转换为 woff2（仅格式转换，不删除任何字形）
// 产物:
//   - app/android/src/main/assets/font/ZhongYiKaiTi.ttf
//   - public/fonts/ZhongYiKaiTi.woff2
// 用法:
//   pnpm app:font
import fontverter from 'fontverter'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC_FONT = path.join(ROOT, 'build', 'fonts', 'ZhongYiKaiTi.ttf')
const DSTS = [
  path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'font', 'ZhongYiKaiTi.ttf'),
  path.join(ROOT, 'public', 'fonts', 'ZhongYiKaiTi.woff2')
]

async function main() {
  if (!fs.existsSync(SRC_FONT)) {
    console.error(`中易楷体不存在: ${SRC_FONT}`)
    process.exit(1)
  }

  const original = fs.readFileSync(SRC_FONT)
  // web 端: 全量 TTF → woff2（仅格式转换，保留全部字形）
  const woff2 = await fontverter.convert(original, 'woff2', 'truetype')

  fs.writeFileSync(DSTS[0], original)
  fs.writeFileSync(DSTS[1], woff2)

  const size = (a) => (a / 1024 / 1024).toFixed(2)
  console.log(`已打包中易楷体（全量，未精简）→`)
  console.log(`  ${path.relative(ROOT, DSTS[0])}（${size(original.length)} MB，TTF）`)
  console.log(`  ${path.relative(ROOT, DSTS[1])}（${size(woff2.length)} MB，woff2）`)
}

main()
