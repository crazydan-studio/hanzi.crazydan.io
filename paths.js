// ============ 仓库级路径与固定文件（build/ server/ vite 构建共用，单一来源） ============
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// 仓库根目录: 自本模块所在目录向上查找 package.json。
// 源码形态（paths.js 位于仓库根）与单文件构建产物（server/dist/index.js 内联本模块）
// 均能正确推导; 也可经环境变量 HANZI_ROOT 显式指定
function findRoot(from) {
  if (process.env.HANZI_ROOT) return path.resolve(process.env.HANZI_ROOT)
  let dir = from
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('未找到仓库根目录（缺少 package.json）')
    dir = parent
  }
}

// 本模块所在目录: 源码为 ESM（import.meta.url）; 单文件 CJS 产物无 import.meta，回退 __dirname
const moduleDir = import.meta.url
  ? path.dirname(fileURLToPath(import.meta.url))
  : __dirname

export const ROOT = findRoot(moduleDir)
export const DIST_DIR = path.join(ROOT, 'dist')
export const PUBLIC_DIR = path.join(ROOT, 'public')

// 汉字数据库（开发库，存放于 data/ 目录; 导入/导出/打包共用）
// 注意: 该文件为现有数据资产，未经明确要求禁止删除或清空
export const HANZI_DB_PATH = path.join(ROOT, 'data', 'hanzi.db')

// 静态数据输出目录（导出脚本与 server 同步共用）
export const ZI_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets', 'zi')
export const PINYIN_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets', 'pinyin')

// 中易楷体（App 内置 TTF 与 web 端 woff2，同源字体）
export const KAI_FONT_TTF_PATH = path.join(ROOT, 'build', 'fonts', 'ZhongYiKaiTi.ttf')
export const KAI_FONT_WOFF2_PATH = path.join(PUBLIC_DIR, 'fonts', 'ZhongYiKaiTi.woff2')

// 开发服务器默认端口（vite 前端 / node 后端，各脚本共用）
export const FRONTEND_PORT = 5173
export const BACKEND_PORT = 3001

// App 安装包目录（debug 产物在 public/ 供 dev 下载，release 产物在 dist/ 供发布）
// 与版本信息文件（联网变体据此检查更新，见 build/app-version-pack.js）
export const APP_DEBUG_APK_DIR = path.join(PUBLIC_DIR, 'assets', 'app', 'android')
export const APP_RELEASE_APK_DIR = path.join(DIST_DIR, 'assets', 'app')
export const APP_VERSION_FILE = path.join(PUBLIC_DIR, 'assets', 'app', 'version')

// 功能页面（vite 构建与 server SPA fallback 共用；不含首页 '/'）
// 顺序仅用于 fallback 最长前缀优先匹配（如 /strokes/write 先于 /strokes）
export const PAGES = ['zi', 'pinyin', 'commons', 'donate', 'strokes', 'strokes/write']
