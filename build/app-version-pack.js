// 生成 App 版本信息文件（public/assets/app/version，单行 JSON）:
//   {"name":"1.0.0","changelog":"更新日志","checksum":{"android":{"pure":"sha256:...","net":"sha256:..."}}}
// 供联网变体（net）启动检查更新: 版本号/更新日志展示、安装包 sha256 完整性校验
// 输入:
//   - app/version.txt      版本号（与构建 versionName 单一来源一致）
//   - app/notes.txt        更新日志（可选，缺失时 changelog 为空）
//   - 安装包 hanzi-{variant}-{os}-{version}.apk / hanzi-{variant}-debug.apk，
//     扫描 public/assets/app/android（debug 产物）与 dist/assets/app（release 产物）
// 输出: public/assets/app/version（dist/assets/app 已存在时同步写入）
// 用法: pnpm app:version
import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { ROOT, PUBLIC_DIR, DIST_DIR } from '../paths.js'

const APP_DIR = path.join(ROOT, 'app')
const NAME = fs.readFileSync(path.join(APP_DIR, 'version.txt'), 'utf8').trim()

const NOTES_FILE = path.join(APP_DIR, 'notes.txt')
const CHANGELOG = fs.existsSync(NOTES_FILE)
  ? fs.readFileSync(NOTES_FILE, 'utf8').trim()
  : ''

// 安装包所在目录（debug 产物在 public/，release 产物在 dist/）
const APK_DIRS = [
  path.join(PUBLIC_DIR, 'assets', 'app', 'android'),
  path.join(DIST_DIR, 'assets', 'app')
]

function sha256(file) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

// 安装包文件名 → 变体（net/pure）与系统（当前仅 android）:
//   hanzi-debug.apk / hanzi-net-debug.apk（debug）
//   hanzi-android-1.0.0.apk（pure release，无变体标识）/ hanzi-net-android-1.0.0.apk（net release）
// 其他前缀（非 net/debug/android/pure）视为未知变体，忽略
const apkMetaOf = (name) => {
  const parts = name.replace(/^hanzi-/, '').replace(/\.apk$/, '').split('-')
  const variant = parts[0] === 'net' ? 'net'
    : (parts[0] === 'debug' || parts[0] === 'android' || parts[0] === 'pure') ? 'pure'
    : null
  return { variant, os: 'android' }
}

// 各系统各变体安装包 sha256（同一变体存在多份产物时取修改时间最新的）
const checksum = {}
for (const dir of APK_DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.apk')) continue
    const { os, variant } = apkMetaOf(name)
    if (!variant) continue
    const file = path.join(dir, name)
    const mtime = fs.statSync(file).mtimeMs
    checksum[os] = checksum[os] || {}
    const prev = checksum[os][variant]
    if (!prev || prev.mtime < mtime) {
      checksum[os][variant] = { mtime, hash: 'sha256:' + sha256(file) }
    }
  }
}
const checksumOut = Object.fromEntries(
  Object.entries(checksum).map(([os, variants]) => [
    os,
    Object.fromEntries(Object.entries(variants).map(([v, e]) => [v, e.hash]))
  ])
)

const content = JSON.stringify({ name: NAME, changelog: CHANGELOG, checksum: checksumOut }) + '\n'

const targets = [path.join(PUBLIC_DIR, 'assets', 'app', 'version')]
if (fs.existsSync(path.join(DIST_DIR, 'assets', 'app'))) {
  targets.push(path.join(DIST_DIR, 'assets', 'app', 'version'))
}
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
console.log(`已写入 App 版本信息（v${NAME}）→ ${targets.join(', ')}`)
