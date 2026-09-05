// 生成 App 版本信息文件（public/assets/app/version，单行 JSON）:
//   {"name":"1.0.0","changelog":"更新日志","checksum":{"android":"sha256:..."}}
// App 启动据此检查更新: 版本号/更新日志展示、安装包 sha256 完整性校验
// 输入:
//   - app/version.txt      版本号（与构建 versionName 单一来源一致）
//   - app/notes.txt        更新日志（可选，缺失时 changelog 为空）
//   - 安装包 hanzi-debug.apk（debug） / hanzi-android-{version}.apk（release），
//     扫描 public/assets/app/android（debug 产物）与 dist/assets/app（release 产物）
// 输出: public/assets/app/version（dist/assets/app 已存在时同步写入）
// 用法: pnpm app:version
import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { ROOT, APP_DEBUG_APK_DIR, APP_RELEASE_APK_DIR, APP_VERSION_FILE, DIST_DIR } from '../paths.js'

const APP_DIR = path.join(ROOT, 'app')
const NAME = fs.readFileSync(path.join(APP_DIR, 'version.txt'), 'utf8').trim()

const NOTES_FILE = path.join(APP_DIR, 'notes.txt')
const CHANGELOG = fs.existsSync(NOTES_FILE)
  ? fs.readFileSync(NOTES_FILE, 'utf8').trim()
  : ''

// 安装包所在目录（debug 产物在 public/，release 产物在 dist/）
const APK_DIRS = [APP_DEBUG_APK_DIR, APP_RELEASE_APK_DIR]

function sha256(file) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

// 单个 Android 安装包 sha256（存在多份产物时取修改时间最新的）
let androidHash = null
let androidMtime = -1
for (const dir of APK_DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.apk')) continue
    const file = path.join(dir, name)
    const mtime = fs.statSync(file).mtimeMs
    if (mtime > androidMtime) {
      androidMtime = mtime
      androidHash = 'sha256:' + sha256(file)
    }
  }
}

const content = JSON.stringify({
  name: NAME,
  changelog: CHANGELOG,
  checksum: androidHash ? { android: androidHash } : {}
}) + '\n'

const targets = [APP_VERSION_FILE]
if (fs.existsSync(path.join(DIST_DIR, 'assets', 'app'))) {
  targets.push(path.join(DIST_DIR, 'assets', 'app', 'version'))
}
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
console.log(`已写入 App 版本信息（v${NAME}）→ ${targets.join(', ')}`)
