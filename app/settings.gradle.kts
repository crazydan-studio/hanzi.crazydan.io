// 汉字 App（Kotlin Multiplatform）
//  - shared: 平台无关的汉字数据访问（Android 实现基于 sqlite；iOS 预留）
//  - android: Android 应用（WebView 内嵌前端资源）
rootProject.name = "hanzi-app"

pluginManagement {
    repositories {
        mavenLocal()
        mavenCentral()
        google()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenLocal()
        mavenCentral()
        google()
        maven { url = uri("https://jitpack.io") }
    }
}

include(":shared")
include(":android")
