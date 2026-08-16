import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initDatabase } from './services/database.js'
import charactersRouter from './routes/characters.js'
import strokesRouter from './routes/strokes.js'
import syncRouter from './routes/sync.js'
import { errorHandler } from './middleware/errorHandler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// 端口解析优先级: 命令行 --port <n> > 环境变量 PORT > 默认 3001
function resolvePort() {
  const idx = process.argv.indexOf('--port')
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = Number(process.argv[idx + 1])
    if (Number.isInteger(p) && p > 0 && p < 65536) return p
    console.warn(`Invalid --port value "${process.argv[idx + 1]}", falling back`)
  }
  const env = Number(process.env.PORT)
  if (Number.isInteger(env) && env > 0 && env < 65536) return env
  return 3001
}
const PORT = resolvePort()

app.use(express.json({ limit: '10mb' }))

app.use('/api/characters', charactersRouter)
app.use('/api/characters/:characterId/strokes', strokesRouter)
app.use('/api/sync', syncRouter)

// 生产模式: 托管前端构建产物
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback: 目录式多页结构，未知路径按前缀回到对应页面的 index.html
  app.get('*', (req, res) => {
    const p = req.path
    if (/^\/char(\/|$)/.test(p)) return res.sendFile(path.join(distDir, 'char', 'index.html'))
    if (/^\/pinyin(\/|$)/.test(p)) return res.sendFile(path.join(distDir, 'pinyin', 'index.html'))
    if (/^\/commons(\/|$)/.test(p)) return res.sendFile(path.join(distDir, 'commons', 'index.html'))
    if (/^\/donate(\/|$)/.test(p)) return res.sendFile(path.join(distDir, 'donate', 'index.html'))
    if (/^\/strokes\/write(\/|$)/.test(p)) {
      return res.sendFile(path.join(distDir, 'strokes', 'write', 'index.html'))
    }
    if (/^\/strokes(\/|$)/.test(p)) {
      return res.sendFile(path.join(distDir, 'strokes', 'index.html'))
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use(errorHandler)

initDatabase()
app.listen(PORT, () => {
  console.log(`HanziStroke server running on http://localhost:${PORT}`)
})
