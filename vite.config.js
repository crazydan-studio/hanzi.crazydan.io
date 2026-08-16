import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

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
// dev/preview 下将 /char /pinyin /strokes(/write) 重定向到带尾斜杠路径
// （与生产 express.static 行为一致）
const DIR_PAGES = ['/strokes/write', '/strokes', '/commons', '/donate', '/char', '/pinyin']

function dirIndexRewrite(req, res, next) {
  const pathname = req.url.split('?')[0]
  if (DIR_PAGES.includes(pathname)) {
    res.writeHead(302, { Location: pathname + '/' })
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
      for (const name of ['index.html', 'char/index.html', 'pinyin/index.html',
        'commons/index.html', 'donate/index.html', 'strokes/index.html', 'strokes/write/index.html']) {
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
  const snippet = "try{var t=localStorage.getItem('hanzi:theme');" +
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

export default defineConfig({
  plugins: [
    flattenPages(),
    injectThemeScript(),
    {
      name: 'hanzi-dir-index-rewrite',
      configureServer(server) {
        server.middlewares.use(dirIndexRewrite)
        // 功能页入口位于 src/ 源码目录，dev 下将页面 URL 映射到对应 HTML 文件
        const SRC_PAGES = {
          '/': 'src/index.html',
          '/char/': 'src/char/index.html',
          '/pinyin/': 'src/pinyin/index.html',
          '/commons/': 'src/commons/index.html',
          '/donate/': 'src/donate/index.html',
          '/strokes/': 'src/strokes/index.html',
          '/strokes/write/': 'src/strokes/write/index.html'
        }
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
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/index.html'),
        char: path.resolve(__dirname, 'src/char/index.html'),
        pinyin: path.resolve(__dirname, 'src/pinyin/index.html'),
        commons: path.resolve(__dirname, 'src/commons/index.html'),
        donate: path.resolve(__dirname, 'src/donate/index.html'),
        'strokes/index': path.resolve(__dirname, 'src/strokes/index.html'),
        'strokes/write': path.resolve(__dirname, 'src/strokes/write/index.html')
      }
    }
  }
})
