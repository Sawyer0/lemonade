# Meta Wearables: Use Device Microphones and Speakers (Technical Reference)

**Updated:** Nov 14, 2025

## Overview

Device audio uses two Bluetooth profiles:

*   **A2DP (Advanced Audio Distribution Profile)** for high‑quality, output‑only media.
*   **HFP (Hands‑Free Profile)** for two‑way voice communication.

---

## Integrating Sessions with HFP

Wearables Device Access Toolkit sessions share microphone and speaker access with the system Bluetooth stack on the glasses.

### iOS Sample Code

```swift
// Set up the audio session
let audioSession = AVAudioSession.sharedInstance()
try audioSession.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth])
try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
```

> [!NOTE]
> When planning to use HFP and streaming simultaneously, it is essential to ensure that HFP is fully configured before initiating any streaming session that requires audio functionality.

```swift
func startStreamSessionWithAudio() async {
    // Set up the HFP audio session
    startAudioSession()

    // Instead of waiting for a fixed 2 seconds, it should be a state-based coordination that waits for HFP to be ready
    try? await Task.sleep(nanoseconds: 2 * NSEC_PER_SEC)

    // Start the stream session as usual
    await streamSession.start()
}
```

### Android Sample Code

```kotlin
private fun routeAudioToBluetooth() {
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    // Get list of currently available devices
    val devices = audioManager.availableCommunicationDevices

    // User choose one of the devices
    val userSelectedDeviceType = AudioDeviceInfo.TYPE_BLE_HEADSET

    // for the device from the list
    var selectedDevice: AudioDeviceInfo? = null
    for (device in devices) {
      if (device.type == userSelectedDeviceType) {
        selectedDevice = device
        break
      }
    }

    if( selectedDevice != null ) {
      audioManager.mode = AudioManager.MODE_NORMAL
      audioManager.setCommunicationDevice(selectedDevice)
  }
}
```
