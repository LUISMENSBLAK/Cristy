import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun String.asBuildConfigString(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val productionPosUrl = providers.gradleProperty("POS_BASE_URL")
    .orElse("https://candid-banoffee-d589cc.netlify.app/login")
    .get()
val debugPosUrl = providers.gradleProperty("DEBUG_POS_URL")
    .orElse(productionPosUrl)
    .get()

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use(keystoreProperties::load)
}

android {
    namespace = "com.innovanetwork.cristispos"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.innovanetwork.cristispos"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "POS_BASE_URL", productionPosUrl.asBuildConfigString())
        manifestPlaceholders["usesCleartext"] = "false"
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "POS_BASE_URL", debugPosUrl.asBuildConfigString())
            manifestPlaceholders["usesCleartext"] = "true"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            buildConfigField("String", "POS_BASE_URL", productionPosUrl.asBuildConfigString())
            manifestPlaceholders["usesCleartext"] = "false"
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
}
