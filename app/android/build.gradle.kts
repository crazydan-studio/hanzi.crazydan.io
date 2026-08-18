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
    // 宿主界面所需 Compose 依赖（开屏/淡入淡出动画、布局等）
    implementation(compose.animation)
    implementation(compose.foundation)
    implementation(compose.runtime)
    implementation(compose.ui)
}
