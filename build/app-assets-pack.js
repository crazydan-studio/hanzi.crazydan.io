// 打包站点素材到 App 资源目录（赞助页收款码等）
// 素材来源: 站点 https://studio.crazydan.org/donate/（与前端 src/donate/index.html 一致）
// 产物: app/android/src/main/assets/donate/{alipay.jpg, wechat.png, hanzi-site.png}
// 说明: 已存在则跳过；下载失败仅警告（运行时显示占位）
// 用法:
//   node build/app-assets-pack.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DST_DIR = path.join(ROOT, 'app', 'android', 'src', 'main', 'assets', 'donate')
const BASE_URL = 'https://studio.crazydan.org/donate'
const IMAGES = ['alipay.jpg', 'wechat.png', 'hanzi-site.png']

async function main() {
  fs.mkdirSync(DST_DIR, { recursive: true })

  for (const name of IMAGES) {
    const dest = path.join(DST_DIR, name)
    if (fs.existsSync(dest)) {
      console.log(`已存在: ${dest}`)
      continue
    }
    try {
      const res = await fetch(`${BASE_URL}/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
      console.log(`已下载: ${dest}`)
    } catch (err) {
      console.warn(`警告: 下载 ${BASE_URL}/${name} 失败（${err.message}），运行时显示占位`)
    }
  }
}

main()
