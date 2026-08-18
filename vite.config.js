import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { DIST_DIR, PAGES } from './paths.js'
import { THEME_KEY } from './src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// App 版本号（单一来源 app/version.txt，与 app/android/build.gradle.kts 的 versionName 一致）
// 以 __HANZI_APP_VERSION__ 注入前端，供 App 下载面板展示版本信息
function appVersion() {
  try {
    return fs.readFileSync(path.join(__dirname, 'app', 'version.txt'), 'utf-8').trim()
  } catch {
    return ''
  }
}

// 命令行参数解析: --api-port N 指定后端端口（优先级: 参数 > 环境变量 VITE_API_PORT > 默认3001）
function apiPort() {
  const i = process.argv.indexOf('--api-port')
  if (i !== -1 && process.argv[i + 1]) {
    const p = Number(process.argv[i + 1])
    if (Number.isInteger(p) && p > 0 && p < 65536) return p
  }
  const env = Number(process.env.VITE_API_PORT)
  if (Number.isInteger(env) && env > 0 && env < 65536) return env
  return 3001
}

// 目录式页面: 跳转只指定目录，自动定位到目录下的 index.html
// dev/preview 下将 /zi /pinyin 等重定向到带尾斜杠路径（与生产 express.static 行为一致）
const DIR_PAGES = PAGES.map(p => '/' + p)

function dirIndexRewrite(req, res, next) {
  const [pathname, query] = req.url.split('?')
  if (DIR_PAGES.includes(pathname)) {
    // 保留查询串: 无尾斜杠的 302 若不携带查询，回退时路由参数会丢失
    res.writeHead(302, { Location: pathname + '/' + (query ? `?${query}` : '') })
    res.end()
  } else {
    next()
  }
}

// 构建产物扁平化: src 源码目录结构 → dist 页面目录结构（与页面 URL 一致）
function flattenPages() {
  return {
    name: 'hanzi-flatten-pages',
    closeBundle() {
      const srcDist = path.join(__dirname, 'dist', 'src')
      const pages = ['index.html', ...PAGES.map(p => `${p}/index.html`)]
      for (const name of pages) {
        const from = path.join(srcDist, name)
        const to = path.join(__dirname, 'dist', name)
        if (fs.existsSync(from)) {
          fs.mkdirSync(path.dirname(to), { recursive: true })
          fs.renameSync(from, to)
        }
      }
      fs.rmSync(srcDist, { recursive: true, force: true })
    }
  }
}

// 注入内联主题脚本（head 阻塞执行，于首次绘制前应用主题类）
// 避免刷新时因设置的主题与默认主题不一致而造成的页面跳闪
function injectThemeScript() {
  const snippet = `try{var t=localStorage.getItem('${THEME_KEY}');` +
    "if(t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches)" +
    "document.documentElement.classList.add('dark')}catch(e){}"
  return {
    name: 'hanzi-inject-theme-script',
    transformIndexHtml() {
      return {
        html: undefined,
        tags: [{ tag: 'script', attrs: {}, children: snippet, injectTo: 'head-prepend' }]
      }
    }
  }
}

// 整页加载遮罩公共逻辑（统一经 HTML 模板注入，各页面源码不重复内联）:
//  - html 标签恒带 boot-loading 类（从页面渲染开始即由遮罩遮挡，消除字体加载抖动）
//  - 遮罩样式内嵌于 head（仅加载动画，无文字; 就绪后 boot-done 内容淡入/遮罩淡出，
//    配合 boot.js 注入的 #boot-overlay 遮罩节点）
const BOOT_LOADING_CSS = `
  html.boot-loading body > *:not(#boot-overlay) { opacity: 0; }
  html.boot-done body > *:not(#boot-overlay) { opacity: 1; transition: opacity .5s ease-in; }
  html.boot-done #boot-overlay { opacity: 0; transition: opacity .5s ease-out .2s; }
  #boot-overlay {
    position: fixed; inset: 0; z-index: 50;
    display: flex; align-items: center; justify-content: center;
    background: #f9fafb;
  }
  html.dark #boot-overlay { background: #111827; }
  #boot-overlay .boot-spinner {
    width: 1.5rem; height: 1.5rem;
    border: 2px solid #d1d5db; border-top-color: #3b82f6;
    border-radius: 9999px;
    animation: boot-spin 1s linear infinite;
  }
  @keyframes boot-spin { to { transform: rotate(360deg); } }
`

function injectBootLoading() {
  return {
    name: 'hanzi-inject-boot-loading',
    transformIndexHtml(html) {
      // html 标签恒带 boot-loading 类（与既有 class 合并）
      const htmlTag = /<html([^>]*)>/
      const withClass = htmlTag.test(html)
        ? html.replace(htmlTag, (m, attrs) =>
            attrs.includes('class=')
              ? m.replace(/class="([^"]*)"/, (_, c) => `class="${c} boot-loading"`)
              : `<html class="boot-loading"${attrs}>`)
        : html
      // 遮罩样式内嵌 head（与主题脚本同置 head 首部，顺序: 主题脚本 → 加载样式）
      return {
        html: withClass,
        tags: [{
          tag: 'style',
          children: BOOT_LOADING_CSS.trim(),
          injectTo: 'head-prepend'
        }]
      }
    }
  }
}

// 注入各页面公共 head 标签（charset / 站点图标 / 样式表），
// 各页面 HTML 仅保留 <title> 与 <meta viewport>
// 注意: 须以 order:'pre' 注入 —— Vite 在 HTML 模块 transform 阶段收集
// <link>/<script> 资源引用，仅 pre 钩子在该阶段之前执行；
// 否则样式表引用无法被构建期提取打包
function injectPageHead() {
  const PAGE_HEAD = `  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="/logo.svg">
  <link rel="stylesheet" href="/src/styles/main.css">
`
  return {
    name: 'hanzi-inject-page-head',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return {
          html: html.replace('<head>', `<head>\n${PAGE_HEAD}`),
          tags: []
        }
      }
    }
  }
}

// 功能页入口: URL 路径 → 源码 HTML（dev 下将页面 URL 映射到对应文件）
const SRC_PAGES = {
  '/': 'src/index.html',
  ...Object.fromEntries(PAGES.map(p => [`/${p}/`, `src/${p}/index.html`]))
}

export default defineConfig({
  plugins: [
    flattenPages(),
    injectBootLoading(),
    injectThemeScript(),
    injectPageHead(),
    {
      name: 'hanzi-dir-index-rewrite',
      configureServer(server) {
        server.middlewares.use(dirIndexRewrite)
        server.middlewares.use(async (req, res, next) => {
          const file = SRC_PAGES[req.url.split('?')[0]]
          if (!file) return next()
          try {
            let html = fs.readFileSync(path.resolve(__dirname, file), 'utf-8')
            html = await server.transformIndexHtml(req.url, html, req.originalUrl)
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html')
            res.end(html)
          } catch (err) {
            next(err)
          }
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use(dirIndexRewrite)
      }
    }
  ],
  // App 版本号注入（下载面板版本信息）
  define: {
    __HANZI_APP_VERSION__: JSON.stringify(appVersion())
  },
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src', 'components'),
      '@services': path.resolve(__dirname, 'src', 'services')
    }
  },
  server: {
    // 绑定所有网络接口（0.0.0.0），支持局域网/容器访问
    // 仅本机访问可传 --host localhost 覆盖
    host: true,
    port: 5173,   // 前端端口: 可用 `pnpm dev --port <n>` 覆盖
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort()}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: DIST_DIR,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/index.html'),
        ...Object.fromEntries(PAGES.map(p => [p, path.resolve(__dirname, `src/${p}/index.html`)]))
      }
    }
  }
})
