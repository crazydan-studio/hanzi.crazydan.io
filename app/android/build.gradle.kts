import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.compose.multiplatform)
}

// 版本号单一来源（app/version.txt）: 与前端 vite 构建（vite.config.js）读取同一文件
val hanziVersion: String = file("../version.txt").readText().trim()

android {
    namespace = "org.crazydan.studio.app.hanzi"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.crazydan.studio.app.hanzi"
        minSdk = 26
        targetSdk = 34
        versionName = hanziVersion
        // versionCode = versionName 去掉小数点后的数字（如 1.0.0 → 100）
        versionCode = hanziVersion.replace(".", "").toIntOrNull() ?: 1
    }

    // 变体拆分:
    //   pure   - 纯净版（无任何权限），仅使用内置数据
    //   online - 可联网变体（INTERNET/安装应用权限，见 src/online/AndroidManifest.xml），
    //            支持启动检查更新、在线下载笔画数据
    flavorDimensions += "variant"
    productFlavors {
        create("pure") {
            dimension = "variant"
            buildConfigField("boolean", "ONLINE_VARIANT", "false")
        }
        create("online") {
            dimension = "variant"
            // 与纯净版使用不同 applicationId，可同时安装
            applicationIdSuffix = ".online"
            buildConfigField("boolean", "ONLINE_VARIANT", "true")
        }
    }

    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore/release.properties")
            val keystoreProperties = Properties().apply {
                load(FileInputStream(keystorePropertiesFile))
            }

            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            // 可重复构建不能在发布包中包含版本控制信息：
            // https://f-droid.org/en/docs/Reproducible_Builds/#vcs-info
            vcsInfo.include = false

            isShrinkResources = true
            isMinifyEnabled = true

            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    dependenciesInfo {
        // 可重复构建不能在发布包中包含依赖信息：
        // https://f-droid.org/en/docs/Reproducible_Builds/
        includeInApk = false
        includeInBundle = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    // 宿主界面所需 Compose 依赖（开屏/淡入淡出动画、更新弹窗等）
    implementation(compose.animation)
    implementation(compose.foundation)
    implementation(compose.material3)
    implementation(compose.runtime)
    implementation(compose.ui)
}
