# Meta Wearables: Testing with Mock Device Kit (Android)

**Updated:** Nov 14, 2025

## Overview

Use this guide when your Android project already integrates the Wearables Device Access Toolkit and you need to test without physical glasses. The tasks below help you:

1.  Set up Mock Device Kit in instrumentation tests.
2.  Create a reusable base rule or test class that configures Mock Device Kit, grants permissions, and resets state.

---

## Set up Mock Device Kit in Instrumentation Tests

Create a reusable base rule or test class.

```kotlin
import android.content.Context
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitInterface
import org.junit.After
import org.junit.Before
import org.junit.Rule

open class MockDeviceKitTestCase<T : Any>(
    private val activityClass: Class<T>
) {

    @get:Rule
    val scenarioRule = ActivityScenarioRule(activityClass)

    protected lateinit var mockDeviceKit: MockDeviceKitInterface
    protected lateinit var targetContext: Context

    @Before
    open fun setUp() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        targetContext = instrumentation.targetContext
        mockDeviceKit = MockDeviceKit.getInstance(targetContext)

        grantRuntimePermissions()
    }

    @After
    open fun tearDown() {
        mockDeviceKit.reset()
    }

    private fun grantRuntimePermissions() {
        val packageName = targetContext.packageName
        val shell = InstrumentationRegistry.getInstrumentation().uiAutomation
        shell.executeShellCommand("pm grant $packageName android.permission.BLUETOOTH_CONNECT")
        shell.executeShellCommand("pm grant $packageName android.permission.CAMERA")
    }
}
```

---

## Configure Camera Data for Streaming and Capture

Mock camera feeds let you test streaming logic without hardware. The examples below assume assets live under `androidTest/assets`.

### Provide a Mock Video Feed

```kotlin
@Test
fun testCameraStreaming() {
    val device = mockDeviceKit.pairRaybanMeta()
    prepareForStreaming(device)

    val mockCameraKit = device.getCameraKit()
    mockCameraKit.setCameraFeed(getAssetUri("test_video.mp4"))

    // Assert on streaming state in your UI
}
```

### Provide a Captured Photo

```kotlin
@Test
fun testPhotoCapture() {
    val device = mockDeviceKit.pairRaybanMeta()
    prepareForStreaming(device)

    val mockCameraKit = device.getCameraKit()
    mockCameraKit.setCapturedImage(getAssetUri("test_image.png"))

    // Assert on capture results
}
```