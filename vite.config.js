import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
// dev/preview 下将 /write 重定向到 /write/（与生产 express.static 行为一致）
const dirIndexRewrite = {
  name: 'hanzi-dir-index-rewrite',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/write' || req.url === '/write?') {
        res.writeHead(302, { Location: '/write/' })
        res.end()
      } else {
        next()
      }
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/write' || req.url === '/write?') {
        res.writeHead(302, { Location: '/write/' })
        res.end()
      } else {
        next()
      }
    })
  }
}

export default defineConfig({
  plugins: [dirIndexRewrite],
  resolve: {
    alias: {
      '@fonts': path.resolve(__dirname, 'fonts')
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
        index: path.resolve(__dirname, 'index.html'),
        write: path.resolve(__dirname, 'write/index.html')
      }
    }
  }
})
