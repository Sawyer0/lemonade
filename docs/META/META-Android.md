# Integrate Wearables Device Access Toolkit into your Android app

**Updated:** Dec 16, 2025

## Overview

This guide explains how to add Wearables Device Access Toolkit registration, streaming, and photo capture to an existing Android app. For a complete working sample, compare with the provided sample app.

## Prerequisites

* Complete the environment, glasses, and GitHub configuration steps in Setup.

---

## Step 1: Add manifest entries

In your app’s `AndroidManifest.xml`, add the permissions required to allow your app to communicate with the glasses through Bluetooth. The intent filter scheme is required so that the Meta AI app can callback to your application. The example below uses `myexampleapp` as a placeholder. Adjust the scheme to match your project.

Add `APPLICATION_ID` metadata to provide the Wearables Device Access Toolkit with your application ID - omit or use 0 for it if you are using Developer Mode. Published apps receive a dedicated value (see Manage projects) from the Wearables Developer Center.

```xml
<manifest ...>
    <!-- Runtime permissions used by DAT -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application ...>
        <!-- Use 0 in Developer Mode; production apps receive a unique ID from Wearables Developer Center -->
        <meta-data
            android:name="com.meta.wearable.mwdat.APPLICATION_ID"
            android:value="0" />

        <!-- Callback scheme Meta AI uses to return to your app -->
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

Add the Wearables Device Access Toolkit Maven repository to your app’s Gradle repositories in `settings.gradle.kts`.

```kotlin
val localProperties =
    Properties().apply {
        val localPropertiesPath = rootDir.toPath() / "local.properties"
        if (localPropertiesPath.exists()) {
            load(localPropertiesPath.inputStream())
        }
    }

dependencyResolutionManagement {
    ...
    repositories {
        ...
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

Declare the Wearables Device Access Toolkit artifacts in `libs.versions.toml`. Check the available versions in GitHub Packages.

```toml
[versions]
mwdat = "0.3.0"

[libraries]
mwdat-core = { group = "com.meta.wearable", name = "mwdat-core", version.ref = "mwdat" }
mwdat-camera = { group = "com.meta.wearable", name = "mwdat-camera", version.ref = "mwdat" }
mwdat-mockdevice = { group = "com.meta.wearable", name = "mwdat-mockdevice", version.ref = "mwdat" }
```

Then, add them as dependencies in your app’s `build.gradle.kts`.

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

Invoking other Wearables Device Access Toolkit APIs before initialization yields `WearablesError.NOT_INITIALIZED`.

For lifecycle placement advice, read Session lifecycle.

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

Observe registration and device updates.

```kotlin
...

Wearables.registrationState.collect { state ->
    onState(state)
}

...
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
permissionStatus = requestWearablesPermission(Permission.CAMERA)

...

private var permissionContinuation: CancellableContinuation<PermissionStatus>? = null
private val permissionMutex = Mutex()
// Requesting wearable device permissions via the Meta AI app
private val permissionsResultLauncher =
    registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
        permissionContinuation?.resume(result)
        permissionContinuation = null
    }

// Convenience method to make a permission request in a sequential manner
// Uses a Mutex to ensure requests are processed one at a time, preventing race conditions
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

Create a `StreamSession`, observe its state, and display frames. You can use an auto device selector to make smart decision for the user to select a device. This example uses `AutoDeviceSelector` to make a decision for the user. Alternatively, you can use a specific device selector, `SpecificDeviceSelector`, if you provide a UI for the user to select a device.

You can request resolution and frame rate control using `StreamConfiguration`. Valid `frameRate` values are 2, 7, 15, 24, or 30 FPS. `videoQuality` can be set to:
*   **HIGH**: 720 x 1280
*   **MEDIUM**: 504 x 896
*   **LOW**: 360 x 640

`StreamSessionState` transitions through `STARTING`, `STARTED`, `STREAMING`, `STOPPING`, `STOPPED`, and `CLOSED`.

Register callbacks to collect frames and state events.

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

Resolution and frame rate are constrained by the Bluetooth Classic connection between the user’s phone and their glasses. To manage limited bandwidth, an automatic ladder reduces quality as needed. It first lowers the resolution by one step (for example, from High to Medium). If bandwidth remains constrained, it then reduces the frame rate (for example, 30 to 24), but never below 15 fps.

The image delivered to your app may appear lower quality than expected, even when the resolution reports “High” or “Medium.” This is due to per‑frame compression that adapts to available Bluetooth Classic bandwidth. Requesting a lower resolution, a lower frame rate, or both can yield higher visual quality with less compression loss.

---

## Step 7: Capture and share photos

When a stream session is active, call `capturePhoto` and handle the returned `PhotoData`. Add `app/src/main/res/xml/file_paths.xml` so that the `FileProvider` can expose cached images.

```kotlin
session.capturePhoto()
    .onSuccess { data ->
    ...
    }
    .onFailure(onError)
```
