// 统一启动前后端，支持命令行指定端口与监听地址:
//   node build/dev-all.js --frontend-port 5173 --backend-port 3001 --host 0.0.0.0
//   pnpm dev:all -- --frontend-port 5174 --backend-port 3100 -H 127.0.0.1
import { spawn } from 'child_process'
import { BACKEND_PORT, FRONTEND_PORT, resolvePortArg } from '../paths.js'

function argString(names) {
  const idx = process.argv.findIndex(a => names.includes(a))
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return null
}

const frontendPort = resolvePortArg(process.argv, ['--frontend-port', '-f'], null, FRONTEND_PORT)
const backendPort = resolvePortArg(process.argv, ['--backend-port', '-b'], null, BACKEND_PORT)
// 前端监听地址: 默认 0.0.0.0（所有网络接口，支持局域网/容器访问）
const host = argString(['--host', '-H']) ?? '0.0.0.0'

console.log(`[dev-all] frontend: http://${host === '0.0.0.0' ? 'localhost' : host}:${frontendPort}  backend: http://localhost:${backendPort}  (host: ${host})`)

// 透传给前后端进程
const env = {
  ...process.env,
  PORT: String(backendPort),          // 后端端口
  VITE_API_PORT: String(backendPort)  // vite proxy 目标
}

const child = spawn(
  'pnpm',
  ['exec', 'concurrently', '-k',
    `vite --host ${host} --port ${frontendPort}`,
    `node --watch --disable-warning=ExperimentalWarning server/index.js --port ${backendPort}`
  ],
  { env, stdio: 'inherit' }
)

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

