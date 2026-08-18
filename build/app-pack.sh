#!/usr/bin/env bash
# ============ 汉字 App 打包脚本 ============
# 用法:
#   build/app-pack.sh [release|debug]   （缺省 debug）
# 步骤:
#   1. 拷贝拼音读音资源 public/assets/audio/pinyin → app/android/src/main/assets/audio/pinyin
#   2. 拷贝赞助页收款码图片 → app/android/src/main/assets/donate（缺失时从站点下载）
#   3. 精简内置中易楷体（仅汉字库内汉字，woff2）
#   4. 打包开发数据库 server/data/hanzi_stroke.db → app/android/src/main/assets/db/hanzi.db
#   5. 构建 Android App（Gradle，Compose Multiplatform 原生 UI）
#   6. 安装包移至 public/assets/app/android/（保留最新构建的安装包）
#      - debug:    hanzi-debug.apk
#      - release:  hanzi-{versionName}.apk（如 hanzi-1.0.0.apk）
set -euo pipefail

# ---- 解析构建类型 ----
BUILD_TYPE="${1:-debug}"
case "${BUILD_TYPE}" in
  release) TASK="assembleRelease"; APK_TYPE="release" ;;
  debug)   TASK="assembleDebug";   APK_TYPE="debug" ;;
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

echo "==> [1/5] 拷贝拼音读音资源到 app 资源目录"
mkdir -p "${ASSETS_DIR}/audio/pinyin"
cp -f "${ROOT}/public/assets/audio/pinyin/"*.mp3 "${ASSETS_DIR}/audio/pinyin/"

echo "==> [2/5] 拷贝赞助页收款码图片到 app 资源目录"
(cd "${ROOT}" && node build/app-assets-pack.js)

echo "==> [3/6] 精简内置中易楷体（仅保留汉字库内汉字，转为 woff2）"
(cd "${ROOT}" && node build/app-font-subset.js)

echo "==> [4/6] 打包数据库到 app 资源目录"
(cd "${ROOT}" && node build/app-db-pack.js)

echo "==> [5/6] 构建 Android App（${BUILD_TYPE}，版本 ${VERSION_NAME}）"
(cd "${APP_DIR}" && ./gradlew ":android:${TASK}")

echo "==> [6/6] 移动安装包到 public/assets/app/android/"
APK_DIR="${MODULE_DIR}/build/outputs/apk/${APK_TYPE}"
APK="$(find "${APK_DIR}" -maxdepth 1 -type f -name "*.apk" \
  ! -name "*-unsigned.apk" ! -name "*-aligned.apk" \
  -printf "%T@ %p\n" 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
if [[ -z "${APK}" ]]; then
  echo "错误: 未找到构建产物 APK（${APK_DIR}）" >&2
  exit 1
fi

DEST_DIR="${ROOT}/public/assets/app/android"
mkdir -p "${DEST_DIR}"
# 仅保留最新构建的安装包（debug 固定 hanzi-debug.apk；release 为 hanzi-{versionName}.apk）
if [[ "${BUILD_TYPE}" == "debug" ]]; then
  DEST_FILE="hanzi-debug.apk"
else
  DEST_FILE="hanzi-${VERSION_NAME}.apk"
fi
find "${DEST_DIR}" -maxdepth 1 -type f -name "hanzi-*.apk" -delete
cp -f "${APK}" "${DEST_DIR}/${DEST_FILE}"
echo "==> 完成: ${DEST_DIR}/${DEST_FILE}（${BUILD_TYPE}）"
