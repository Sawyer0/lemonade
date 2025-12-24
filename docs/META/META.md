# Integrate Wearables Device Access Toolkit into your Android App

**Updated:** Dec 16, 2025

## Overview

This guide explains how to add Wearables Device Access Toolkit registration, streaming, and photo capture to an existing Android app. For a complete working sample, compare with the provided sample app.

## Prerequisites

Complete the environment, glasses, and GitHub configuration steps in **Setup**.

---

## Step 1: Add manifest entries

In your app's `AndroidManifest.xml`, add the permissions required to allow your app to communicate with the glasses through Bluetooth. The intent filter scheme is required so that the Meta AI app can callback to your application. The example below uses `myexampleapp` as a placeholder. Adjust the scheme to match your project.

Add `APPLICATION_ID` metadata to provide the Wearables Device Access Toolkit with your application ID - omit or use `0` for it if you are using Developer Mode. Published apps receive a dedicated value from the Wearables Developer Center.

```xml
<manifest ...>
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application ...>
        <meta-data
            android:name="com.meta.wearable.mwdat.APPLICATION_ID"
            android:value="0" />

        <activity android:name=".MainActivity" ...>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="myexampleapp" />
            </intent-filter>
        </activity>
    </application>
</manifest>

```

---

## Step 2: Add the SDK to Gradle

Add the Wearables Device Access Toolkit Maven repository to your app's Gradle repositories in `settings.gradle.kts`.

```kotlin
val localProperties = Properties().apply {
    val localPropertiesPath = rootDir.toPath() / "local.properties"
    if (localPropertiesPath.exists()) {
        load(localPropertiesPath.inputStream())
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
            credentials {
                username = "" // not needed
                password = System.getenv("GITHUB_TOKEN") ?: localProperties.getProperty("github_token")
            }
        }
    }
}

```

Declare the artifacts in `libs.versions.toml`:

```toml
[versions]
mwdat = "0.3.0"

[libraries]
mwdat-core = { group = "com.meta.wearable", name = "mwdat-core", version.ref = "mwdat" }
mwdat-camera = { group = "com.meta.wearable", name = "mwdat-camera", version.ref = "mwdat" }
mwdat-mockdevice = { group = "com.meta.wearable", name = "mwdat-mockdevice", version.ref = "mwdat" }

```

Add them as dependencies in your app's `build.gradle.kts`:

```kotlin
dependencies {
    implementation(libs.mwdat.core)
    implementation(libs.mwdat.camera)
    implementation(libs.mwdat.mockdevice)
}

```

---

## Step 3: Initialize the SDK

Initialize the SDK once per process at start up.

```kotlin
Wearables.initialize(context)

```

*Note: Invoking other APIs before initialization yields `WearablesError.NOT_INITIALIZED`.*

---

## Step 4: Launch registration from your app

Register your application with the Meta AI app either at startup or when the user wants to turn on your wearables integration.

```kotlin
fun requestWearablesRegistration(context: Context) {
    Wearables.startRegistration(context)
}

fun requestWearablesUnregistration(context: Context) {
    Wearables.startUnregistration(context)
}

```

Observe registration and device updates:

```kotlin
Wearables.registrationState.collect { state ->
    onState(state)
}

Wearables.devices.collect { devices ->
    onDevices(devices.toList())
}

```

---

## Step 5: Manage camera permissions

Before streaming, check the Wearables camera permission and launch the SDK contract if required.

```kotlin
var permissionStatus = Wearables.checkPermissionStatus(Permission.CAMERA)
if (permissionStatus == PermissionStatus.Granted) {
    // start streaming
}

// Handling permission requests
private var permissionContinuation: CancellableContinuation<PermissionStatus>? = null
private val permissionMutex = Mutex()

private val permissionsResultLauncher = registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
    permissionContinuation?.resume(result)
    permissionContinuation = null
}

suspend fun requestWearablesPermission(permission: Permission): PermissionStatus {
    return permissionMutex.withLock {
        suspendCancellableCoroutine { continuation ->
            permissionContinuation = continuation
            continuation.invokeOnCancellation { permissionContinuation = null }
            permissionsResultLauncher.launch(permission)
        }
    }
}

```

---

## Step 6: Start a camera stream

Create a `StreamSession`, observe its state, and display frames. You can use an `AutoDeviceSelector` or a `SpecificDeviceSelector`.

**Stream Configurations:**

* **Video Quality:** `HIGH` (720x1280), `MEDIUM` (504x896), `LOW` (360x640)
* **Frame Rate:** 2, 7, 15, 24, or 30 FPS.

```kotlin
private var session: StreamSession? = null

fun start(deviceId: DeviceIdentifier) {
    val streamSession = Wearables.startStreamSession(
        context = context,
        deviceSelector = AutoDeviceSelector(),
        streamConfiguration = StreamConfiguration(
            videoQuality = VideoQuality.MEDIUM,
            frameRate = 24,
        ),
    )
    session = streamSession

    scope.launch {
        streamSession.videoStream.collect { frame ->
            displayFrame(frame)
        }
    }

    scope.launch {
        streamSession.state.collect { state ->
            updateStreamUi(state)
            if (state == StreamSessionState.STOPPED) {
                stopStream()
            }
        }
    }
}

```

---

## Step 7: Capture and share photos

When a stream session is active, call `capturePhoto` and handle the returned `PhotoData`.

```kotlin
session.capturePhoto()
    .onSuccess { data ->
        // Handle photo data
    }
    .onFailure(onError)

```

---

## Next Steps

* **Permissions:** See details on permission flows in *Permissions and registration*.
* **Lifecycles:** See details on session lifecycles in *Session lifecycle*.
* **Testing:** Test without a device with *Mock Device Kit*.
* **Release:** Prepare for release with *Manage projects* in the Wearables Developer Center.











To ensure you have **everything** necessary for implementation, I have refined the previous version to include technical nuances mentioned in the documentation that are critical for a successful build—specifically the bandwidth logic, the `FileProvider` requirement, and the specific FPS/Resolution constraints.

Here is the complete, detailed technical reference in Markdown:

---

# Meta Wearables: Android Integration Guide (Technical Reference)

**Last Updated:** Dec 16, 2025

**Source:** [Meta Wearables Developer Center](https://wearables.developer.meta.com/docs/build-integration-android)

## 1. Prerequisites

* Complete the environment, glasses, and GitHub configuration steps in the **Setup** guide.
* Ensure you have a `GITHUB_TOKEN` with package read permissions.

---

## 2. Android Manifest Configuration (`AndroidManifest.xml`)

You must define permissions for Bluetooth and Internet, set your Application ID, and configure a callback scheme for Meta AI.

```xml
<manifest ...>
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application ...>
        <meta-data
            android:name="com.meta.wearable.mwdat.APPLICATION_ID"
            android:value="0" />

        <activity android:name=".MainActivity" ...>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="myexampleapp" /> 
            </intent-filter>
        </activity>
    </application>
</manifest>

```

---

## 3. Dependency Management

### `settings.gradle.kts`

Add the Maven repository and authentication logic.

```kotlin
val localProperties = Properties().apply {
    val localPropertiesPath = rootDir.toPath() / "local.properties"
    if (localPropertiesPath.exists()) {
        load(localPropertiesPath.inputStream())
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven {
            url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
            credentials {
                username = "" // Leave blank
                password = System.getenv("GITHUB_TOKEN") ?: localProperties.getProperty("github_token")
            }
        }
    }
}

```

### `libs.versions.toml`

```toml
[versions]
mwdat = "0.3.0"

[libraries]
mwdat-core = { group = "com.meta.wearable", name = "mwdat-core", version.ref = "mwdat" }
mwdat-camera = { group = "com.meta.wearable", name = "mwdat-camera", version.ref = "mwdat" }
mwdat-mockdevice = { group = "com.meta.wearable", name = "mwdat-mockdevice", version.ref = "mwdat" }

```

### `build.gradle.kts` (App Module)

```kotlin
dependencies {
    implementation(libs.mwdat.core)
    implementation(libs.mwdat.camera)
    implementation(libs.mwdat.mockdevice)
}

```

---

## 4. SDK Initialization & Registration

Initialize the SDK once at process startup (usually in `Application.onCreate` or your first `Activity`).

```kotlin
// 1. Initialization
Wearables.initialize(context)

// 2. Registration Flow
fun requestWearablesRegistration(context: Context) {
    Wearables.startRegistration(context)
}

// 3. Observe State Updates
scope.launch {
    Wearables.registrationState.collect { state -> /* handle state */ }
}
scope.launch {
    Wearables.devices.collect { devices -> /* update device list */ }
}

```

---

## 5. Permissions Handling

Use the `Wearables.RequestPermissionContract()` to request camera access from the glasses via the Meta AI app.

```kotlin
private val permissionsResultLauncher = registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
    if (result == PermissionStatus.Granted) {
        // Proceed to stream
    }
}

fun checkAndRequestPermission() {
    val status = Wearables.checkPermissionStatus(Permission.CAMERA)
    if (status != PermissionStatus.Granted) {
        permissionsResultLauncher.launch(Permission.CAMERA)
    }
}

```

---

## 6. Camera Streaming Logic

### Configuration Constraints

* **Valid Frame Rates:** 2, 7, 15, 24, or 30 FPS.
* **Quality Presets:**
* `HIGH`: 720 x 1280
* `MEDIUM`: 504 x 896
* `LOW`: 360 x 640



### Bandwidth Ladder (Important)

The SDK automatically manages Bluetooth bandwidth:

1. It first lowers resolution (e.g., High → Medium).
2. If bandwidth is still constrained, it reduces FPS (down to 15 FPS minimum).
3. Note: Frames may appear compressed despite "High" reports due to per-frame adaptive compression.

### Implementation

```kotlin
fun startStream() {
    val streamSession = Wearables.startStreamSession(
        context = context,
        deviceSelector = AutoDeviceSelector(), // Or SpecificDeviceSelector(deviceId)
        streamConfiguration = StreamConfiguration(
            videoQuality = VideoQuality.MEDIUM,
            frameRate = 24,
        ),
    )

    scope.launch {
        streamSession.videoStream.collect { frame -> displayFrame(frame) }
    }
}

```

---

## 7. Photo Capture & File Provider

To capture photos, you must call `capturePhoto()`. **Crucial:** You must also configure a `FileProvider` to expose the cached images.

1. **Code:**
```kotlin
session.capturePhoto()
    .onSuccess { photoData -> /* Process PhotoData */ }
    .onFailure { error -> /* Handle Error */ }

```


2. **Resources:** Create `app/src/main/res/xml/file_paths.xml` (refer to the Android Sample App for exact path specs) to allow the `FileProvider` to share the captured image file.

---

## Next Steps

* **Testing:** Use the **Mock Device Kit** if physical glasses are unavailable.
* **Lifecycle:** Review the **Session Lifecycle** documentation for advanced resource management.
* **Production:** Before releasing, update your `APPLICATION_ID` in the manifest with the value assigned in the Wearables Developer Center.


Yes, that is exactly the correct technical guide. Based on the **December 16, 2025** update of the **Meta Wearables Device Access Toolkit (DAT)** documentation you provided, here is how the "Phone-to-Glasses" camera connection actually functions for your app:

### How the Camera Works (The Bridge)

Even though your **Project Lemonade** app lives on your phone, it doesn't use the phone's physical camera. Instead, the **Meta AI app** on your phone acts as a secure "bridge".

* **The Handshake:** Your app initiates a **Registration** and **Permission** flow that deep-links the user to the Meta AI app to approve camera access.
* **The Data Stream:** Once approved, the glasses stream live video (up to **720p at 30 FPS**) to the Meta AI app, which then hands those frames directly to your app's `StreamSession`.
* **Local Inference:** Your app receives these frames as `VideoFrame` objects in a standard collection, which you can then pipe into **SmolVLM2** for real-time mechanical analysis.

---

### Critical Technical Nuances for Your Build

The documentation highlights a few "make-or-break" details for a garage environment:

* **Bandwidth Ladder:** The SDK automatically manages the connection. If the garage Wi-Fi/Bluetooth is congested, it will first drop your resolution (e.g., High to Medium) and then drop your frame rate (down to a minimum of **15 FPS**).
* **Resolution Constraints:** You have three quality presets: **High** (720x1280), **Medium** (504x896), and **Low** (360x640). For your **SmolVLM2** model, `MEDIUM` or `LOW` might actually be better to reduce latency and battery drain.
* **Photo Capture:** While streaming, you can call `session.capturePhoto()` to get a high-resolution still—perfect for when you need **Gemini** to do a deep-dive analysis on a specific part.
* **FileProvider Setup:** If you want to share or process captured photos, you **must** configure a `FileProvider` in your resources to allow the Meta SDK to share the cached image files with your app.

### Implementation Checklist for Your Pilot

To get this working for your Q1 2026 demo, you'll need to follow these steps from the doc:

1. **Manifest:** Add the `APPLICATION_ID` (use `0` for Developer Mode) and the intent filter for your app's custom scheme.
2. **Gradle:** Add the GitHub Maven repository with your `GITHUB_TOKEN`.
3. **DI Layer:** In your **InversifyJS** setup, your `VisionProvider` will now use `Wearables.startStreamSession` to pull the POV feed.

