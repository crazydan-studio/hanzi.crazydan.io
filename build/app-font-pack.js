// 打包中易楷体（不做精简，保证全部字形可用，避免页面乱码）:
//  - App 内置: 直接使用全量 TTF（build/fonts/ZhongYiKaiTi.ttf）
//  - web 端:   全量字体转换为 woff2（仅格式转换，不删除任何字形）
// 产物:
//   - app/android/src/main/assets/fonts/ZhongYiKaiTi.ttf
//   - public/fonts/ZhongYiKaiTi.woff2
// 用法:
//   pnpm app:font
import fontverter from 'fontverter'
import path from 'path'
import fs from 'fs'
import { ROOT, KAI_FONT_TTF_PATH, KAI_FONT_WOFF2_PATH } from '../paths.js'

const SRC_FONT = KAI_FONT_TTF_PATH
const DSTS = [
  path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'fonts', 'ZhongYiKaiTi.ttf'),
  KAI_FONT_WOFF2_PATH
]

async function main() {
  if (!fs.existsSync(SRC_FONT)) {
    console.error(`中易楷体不存在: ${SRC_FONT}`)
    process.exit(1)
  }

  // 目标字体文件已存在 → 跳过转换与复制（字体为只读资源，重复打包无意义）
  const alreadyPacked = DSTS.every(dst => fs.existsSync(dst))
  if (alreadyPacked) {
    console.log('目标字体文件已存在，跳过中易楷体打包（如需重新生成请删除对应文件）')
    return
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
