// ============ 仓库级路径与固定文件（build/ server/ vite 构建共用，单一来源） ============
import path from 'path'
import { fileURLToPath } from 'url'

export const ROOT = path.dirname(fileURLToPath(import.meta.url))
export const DIST_DIR = path.join(ROOT, 'dist')
export const PUBLIC_DIR = path.join(ROOT, 'public')

// 笔画开发库（导入/导出/打包共用）
export const STROKE_DB_PATH = path.join(ROOT, 'server', 'data', 'hanzi_stroke.db')

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
