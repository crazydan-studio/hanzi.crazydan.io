#!/bin/bash
_DIR_="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ROOT_DIR="$(cd "${_DIR_}/.." && pwd -P)"

SOURCE_DIR="${ROOT_DIR}/public/assets"
TARGET_FILE="${ROOT_DIR}/dist/assets/hanzi-assets-bundled.zip"

echo "Packaging ${SOURCE_DIR} ..."

pushd "${SOURCE_DIR}"
    mkdir -p "$(dirname "${TARGET_FILE}")"

    zip -r "${TARGET_FILE}" . \
        -x "zi/glyphs.json"
popd

echo "Done"
