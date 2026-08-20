// 汉字 App（Kotlin Multiplatform）
//  - shared: 平台无关的汉字数据访问与 Compose UI（Android 实现基于 sqlite）
//  - android: Android 应用（原生 Compose UI）
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
    }
}

include(":shared")
include(":android")
