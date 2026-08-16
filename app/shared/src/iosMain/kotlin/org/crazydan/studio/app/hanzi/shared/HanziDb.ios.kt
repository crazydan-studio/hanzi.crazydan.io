package org.crazydan.studio.app.hanzi.shared

/**
 * iOS 预留: 暂不实现（待 iOS 版本开发时，基于 SQLite CInterop 提供
 * 与 androidMain 相同的查询能力，返回一致的 [HanziDb] 数据）。
 */
actual object HanziDbFactory {
    actual fun open(dbPath: String): HanziDb = error("HanziDb: iOS 暂未实现")
}
