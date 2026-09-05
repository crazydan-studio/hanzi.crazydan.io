#!/usr/bin/env bash
# ============ 汉字 App 打包脚本 ============
# 用法:
#   build/app-pack.sh [release|debug]   （缺省 debug）
# 步骤:
#   1. 校验拼音读音音频（由 pnpm audio:pack 生成到 app/android/src/main/assets/audio/pinyin，逐读音单文件）
#   2. 拷贝赞助页收款码图片 → app/android/src/main/assets/donate（缺失时从站点下载）
#   3. 拷贝中易楷体（全量 TTF，不精简）到 app 资源目录（已存在则跳过;
#      web 端 woff2 由 pnpm dev/build/dev:all 前置脚本单独生成，见 build/web-font-pack.js）
#   4. 打包开发数据库 server/data/hanzi_stroke.db → app/android/src/main/assets/db/hanzi.db
#   5. 构建 Android App（Gradle，Compose Multiplatform 原生 UI）
#   6. 移动安装包并写入版本信息文件
#      - debug:   public/assets/app/android/hanzi-debug.apk（web dev 本地下载）
#      - release: dist/assets/app/hanzi-android-{versionName}.apk（随 GitHub Releases 发布）
#      版本信息（单行 JSON: 版本号/更新日志/安装包 sha256）写入
#      public/assets/app/version（App 据此检查更新并校验安装包完整性）
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

# 复制构建产物 APK 到目标目录（覆盖同名文件）
cp_apk() {
  local apk_type="$1" dest_dir="$2" dest_file="$3"
  local apk_dir="${MODULE_DIR}/build/outputs/apk/${apk_type}"
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

echo "==> [1/6] 校验拼音读音音频（由 audio:pack 生成到 app 资源目录，逐读音单文件）"
if [ -z "$(ls -A "${ASSETS_DIR}/audio/pinyin/" 2>/dev/null)" ]; then
  echo "[告警] app 音频资源为空（请先执行 pnpm audio:pack）" >&2
fi

echo "==> [2/6] 拷贝赞助页收款码图片到 app 资源目录"
(cd "${ROOT}" && node build/app-assets-pack.js)

echo "==> [3/6] 拷贝中易楷体到 app 资源目录（全量 TTF，App 内置）"
mkdir -p "${ASSETS_DIR}/fonts"
if [[ ! -f "${ASSETS_DIR}/fonts/ZhongYiKaiTi.ttf" ]]; then
  cp -f "${ROOT}/build/fonts/ZhongYiKaiTi.ttf" "${ASSETS_DIR}/fonts/ZhongYiKaiTi.ttf"
  echo "  已拷贝: ${ASSETS_DIR}/fonts/ZhongYiKaiTi.ttf"
else
  echo "目标字体文件已存在，跳过拷贝中易楷体（如需重新生成请删除 ${ASSETS_DIR}/fonts/ZhongYiKaiTi.ttf）"
fi

echo "==> [4/6] 打包数据库到 app 资源目录"
(cd "${ROOT}" && node build/app-db-pack.js)

echo "==> [5/6] 构建 Android App（${BUILD_TYPE}，版本 ${VERSION_NAME}）"
(cd "${APP_DIR}" && ./gradlew ":android:assemble${BUILD_TYPE^}")

echo "==> [6/6] 移动安装包并写入版本信息文件"
if [[ "${BUILD_TYPE}" == "debug" ]]; then
  DEST_DIR="${ROOT}/public/assets/app/android"
  prepare_dest "${DEST_DIR}"
  cp_apk "debug" "${DEST_DIR}" "hanzi-debug.apk"
  echo "==> 完成: ${DEST_DIR}/hanzi-debug.apk"
else
  DEST_DIR="${ROOT}/dist/assets/app"
  prepare_dest "${DEST_DIR}"
  cp_apk "release" "${DEST_DIR}" "hanzi-${OS}-${VERSION_NAME}.apk"
  echo "==> 完成: ${DEST_DIR}/hanzi-${OS}-${VERSION_NAME}.apk"
fi

# 版本信息文件（单行 JSON: 版本号/更新日志/安装包 sha256），
# App 据此检查更新与安装包完整性校验; public/ 由 vite 构建时复制到 dist
(cd "${ROOT}" && pnpm app:version)
