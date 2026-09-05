import express from 'express'
import path from 'path'
import fs from 'fs'
import { initDatabase } from './services/database.js'
import ziRouter from './routes/zi.js'
import strokesRouter from './routes/strokes.js'
import syncRouter from './routes/sync.js'
import { errorHandler } from './middleware/errorHandler.js'
import { BACKEND_PORT, DIST_DIR, HANZI_DB_PATH, PAGES, resolvePortArg } from '../paths.js'

const app = express()

// 端口解析优先级: 命令行 --port <n> > 环境变量 PORT > 默认 3001
const PORT = resolvePortArg(process.argv, ['--port'], 'PORT', BACKEND_PORT)

// 数据库路径解析优先级: 命令行 --db <path> > 环境变量 HANZI_DB > 默认 data/hanzi.db
// （相对路径基于当前工作目录解析）
function resolveDbPath() {
  const idx = process.argv.indexOf('--db')
  if (idx !== -1 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1])
  }
  if (process.env.HANZI_DB) {
    return path.resolve(process.env.HANZI_DB)
  }
  return HANZI_DB_PATH
}
const DB_PATH = resolveDbPath()

app.use(express.json({ limit: '10mb' }))

app.use('/api/zi', ziRouter)
app.use('/api/zi/:ziId/strokes', strokesRouter)
app.use('/api/sync', syncRouter)

// 生产模式: 托管前端构建产物
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  // SPA fallback: 目录式多页结构，未知路径按页面前缀回到对应 index.html
  // （最长前缀优先，如 /strokes/write 先于 /strokes）;
  // 未知 /api/* 不落入页面回退（返回 JSON 404，避免 HTML 误导 API 调用方）
  const pageRoutes = [...PAGES].sort((a, b) => b.length - a.length)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found', details: {} }
      })
    }
    const p = req.path
    for (const page of pageRoutes) {
      if (p === '/' + page || p.startsWith('/' + page + '/')) {
        return res.sendFile(path.join(DIST_DIR, page, 'index.html'))
      }
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.use(errorHandler)

initDatabase(DB_PATH)
app.listen(PORT, () => {
  console.log(`HanziStroke server running on http://localhost:${PORT} (db: ${DB_PATH})`)
})
