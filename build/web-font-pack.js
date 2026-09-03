// 打包 web 端中易楷体（不做精简，保证全部字形可用，避免页面乱码）:
//   全量 TTF → woff2（仅格式转换，不删除任何字形）
// 产物（构建产物，不入库，见 .gitignore）:
//   - public/fonts/ZhongYiKaiTi.woff2
// 用法:
//   pnpm web:font                # 目标已存在则跳过
//   pnpm web:font -- --force     # 强制重新生成
// 已注册为 pnpm dev/build/dev:all 的前置脚本（predev/prebuild/predev:all 自动执行）
import fontverter from 'fontverter'
import path from 'path'
import fs from 'fs'
import { ROOT, KAI_FONT_TTF_PATH, KAI_FONT_WOFF2_PATH } from '../paths.js'

const SRC_FONT = KAI_FONT_TTF_PATH
const DST = KAI_FONT_WOFF2_PATH

async function main() {
  const force = process.argv.includes('--force')

  if (!fs.existsSync(SRC_FONT)) {
    console.error(`中易楷体不存在: ${SRC_FONT}`)
    process.exit(1)
  }

  // 目标字体文件已存在 → 跳过转换（字体为只读资源，重复打包无意义）
  if (!force && fs.existsSync(DST)) {
    console.log('web 端中易楷体已存在，跳过转换（如需重新生成请删除该文件或加 --force）')
    return
  }

  const original = fs.readFileSync(SRC_FONT)
  const woff2 = await fontverter.convert(original, 'woff2', 'truetype')

  fs.mkdirSync(path.dirname(DST), { recursive: true })
  fs.writeFileSync(DST, woff2)

  const size = (a) => (a / 1024 / 1024).toFixed(2)
  console.log(`已生成 web 端中易楷体（全量，未精简）→ ${path.relative(ROOT, DST)}（${size(woff2.length)} MB，woff2）`)
}

main()
