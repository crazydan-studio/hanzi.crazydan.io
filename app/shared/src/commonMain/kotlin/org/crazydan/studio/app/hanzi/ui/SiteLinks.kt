package org.crazydan.studio.app.hanzi.ui

/** 站点链接与资源路径（固定数据单一来源，各页面共用） */
object SiteLinks {
    const val SITE = "https://hanzi.crazydan.io"
    const val REPO = "https://github.com/crazydan-studio/hanzi.crazydan.io"
    const val ISSUES = "$REPO/issues"
    const val KUAII_IME = "https://github.com/crazydan-studio/kuaizi-ime"
    const val ZDIC = "https://zdic.net/"
    const val ZDIC_TERMS = "https://zdic.net/terms/"
    const val STUDIO = "https://studio.crazydan.org/"
    const val SUPPORT_EMAIL = "support@studio.crazydan.org"
    const val DONATE_LIST = "$REPO/blob/master/docs/donate/index.md"

    /** 笔画数据下载前缀（产物命名与 build/export-stroke-db.js 一致: hanzi-stroke-{规模}.db） */
    const val STROKE_DB_DOWNLOAD = "$REPO/releases/latest/download/hanzi-stroke-"

    /** App 最新版本信息（构建脚本写入 public/assets/app/version，单行 JSON） */
    const val APP_VERSION_CHECK = "https://hanzi.crazydan.io/assets/app/version"

    /**
     * App 安装包下载地址: {version}/hanzi-{variant}-{os}-{version}.{suffix}
     * （命名与 build/app-pack.sh 产物一致，随 GitHub Releases 发布）
     */
    fun apkDownloadUrl(version: String, variant: String): String =
        "$REPO/releases/download/v$version/hanzi-$variant-android-$version.apk"
}
