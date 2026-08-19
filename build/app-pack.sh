#!/usr/bin/env bash
# ============ 汉字 App 打包脚本 ============
# 用法:
#   build/app-pack.sh [release|debug]   （缺省 debug）
# 步骤:
#   1. 拷贝拼音读音资源 public/assets/audio/pinyin → app/android/src/main/assets/audio/pinyin
#   2. 拷贝赞助页收款码图片 → app/android/src/main/assets/donate（缺失时从站点下载）
#   3. 打包中易楷体（全量，不精简; App 用 TTF，web 用 woff2；目标文件已存在则跳过）
#   4. 打包开发数据库 server/data/hanzi_stroke.db → app/android/src/main/assets/db/hanzi.db
#   5. 构建 Android App（Gradle，Compose Multiplatform 原生 UI）
#   6. 移动安装包并写入版本信息文件
#      - debug:   public/assets/app/android/hanzi-{variant}-debug.apk（pure/net 双变体，
#                 web dev 本地下载；两变体 applicationId 一致，可互相覆盖安装）
#      - release: dist/assets/app/hanzi-{variant}-android-{versionName}.apk
#        （pure=纯净版无权限 / net=可联网变体，随 GitHub Releases 发布）
#      版本信息（单行 JSON: 版本号/更新日志/各变体安装包 sha256）写入
#      public/assets/app/version（联网变体据此检查更新并校验安装包完整性）
set -euo pipefail

# ---- 解析构建类型 ----
BUILD_TYPE="${1:-debug}"
case "${BUILD_TYPE}" in
  release|debug) ;;
  *)
    echo "用法: $0 [release|debug]（缺省 debug）" >&2
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT}/app"
MODULE_DIR="${APP_DIR}/android"
ASSETS_DIR="${MODULE_DIR}/src/main/assets"
# 版本号（单一来源 app/version.txt，与 android 构建 versionName 一致）
VERSION_NAME="$(tr -d '[:space:]' < "${APP_DIR}/version.txt")"
# 目标平台（当前仅支持 Android; 安装包命名含该标识）
OS="android"

# 复制指定变体的构建产物 APK 到目标目录（覆盖同名文件）
cp_apk() {
  local flavor="$1" apk_type="$2" dest_dir="$3" dest_file="$4"
  local apk_dir="${MODULE_DIR}/build/outputs/apk/${flavor}/${apk_type}"
  local apk
  apk="$(find "${apk_dir}" -maxdepth 1 -type f -name "*.apk" \
    ! -name "*-unsigned.apk" ! -name "*-aligned.apk" \
    -printf "%T@ %p\n" 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
  if [[ -z "${apk}" ]]; then
    echo "错误: 未找到构建产物 APK（${apk_dir}）" >&2
    exit 1
  fi
  cp -f "${apk}" "${dest_dir}/${dest_file}"
}

# 清理并准备安装包输出目录（移除旧版本遗留的安装包）
prepare_dest() {
  local dest_dir="$1"
  mkdir -p "${dest_dir}"
  find "${dest_dir}" -maxdepth 1 -type f -name "hanzi-*.apk" -delete
}

echo "==> [1/6] 拷贝拼音读音资源到 app 资源目录"
mkdir -p "${ASSETS_DIR}/audio/pinyin"
cp -f "${ROOT}/public/assets/audio/pinyin/"*.mp3 "${ASSETS_DIR}/audio/pinyin/"

echo "==> [2/6] 拷贝赞助页收款码图片到 app 资源目录"
(cd "${ROOT}" && node build/app-assets-pack.js)

echo "==> [3/6] 打包中易楷体（全量，App TTF / web woff2）"
(cd "${ROOT}" && node build/app-font-pack.js)

echo "==> [4/6] 打包数据库到 app 资源目录"
(cd "${ROOT}" && node build/app-db-pack.js)

echo "==> [5/6] 构建 Android App（${BUILD_TYPE}，版本 ${VERSION_NAME}）"
if [[ "${BUILD_TYPE}" == "debug" ]]; then
  # 本地开发: 构建 pure/net 双变体 debug（applicationId 一致，可互相覆盖安装）
  (cd "${APP_DIR}" && ./gradlew ":android:assemblePureDebug" ":android:assembleNetDebug")
else
  # 发布: 同时构建纯净版与可联网变体
  (cd "${APP_DIR}" && ./gradlew ":android:assemblePureRelease" ":android:assembleNetRelease")
fi

echo "==> [6/6] 移动安装包并写入版本信息文件"
if [[ "${BUILD_TYPE}" == "debug" ]]; then
  DEST_DIR="${ROOT}/public/assets/app/android"
  prepare_dest "${DEST_DIR}"
  cp_apk "pure" "debug" "${DEST_DIR}" "hanzi-debug.apk"
  cp_apk "net"  "debug" "${DEST_DIR}" "hanzi-net-debug.apk"
  echo "==> 完成: ${DEST_DIR}/hanzi-debug.apk（pure）"
  echo "           ${DEST_DIR}/hanzi-net-debug.apk（net）"
else
  DEST_DIR="${ROOT}/dist/assets/app"
  prepare_dest "${DEST_DIR}"
  cp_apk "pure" "release" "${DEST_DIR}" "hanzi-pure-${OS}-${VERSION_NAME}.apk"
  cp_apk "net"  "release" "${DEST_DIR}" "hanzi-net-${OS}-${VERSION_NAME}.apk"
  echo "==> 完成: ${DEST_DIR}/hanzi-pure-${OS}-${VERSION_NAME}.apk（纯净版）"
  echo "           ${DEST_DIR}/hanzi-net-${OS}-${VERSION_NAME}.apk（联网版）"
fi

# 版本信息文件（单行 JSON: 版本号/更新日志/各变体安装包 sha256），
# 供联网变体检查更新与安装包完整性校验; public/ 由 vite 构建时复制到 dist
(cd "${ROOT}" && node build/app-version-pack.js)
