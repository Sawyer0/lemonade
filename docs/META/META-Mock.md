# Meta Wearables: Mock Device Kit (Technical Reference)

**Updated:** Nov 14, 2025

## Overview

Mock Device Kit is a component of the Device Access Toolkit that helps you build and test integrations for Meta glasses, without the need to access the actual hardware.

This kit provides a simulated device that mirrors the capabilities and behavior of Meta glasses, including camera, media streaming, permissions, and device state changes. You can use it to test your app integrations in a virtual environment. This is useful for rapid iteration, automated testing, and development workflows where physical devices may not be available or practical to use.

> [!NOTE]
> This page demonstrates how the Mock Device Kit is used in the **CameraAccess** sample. For information on using Mock Device Kit APIs in your own testing, see **Android testing with Mock Device Kit** or **iOS testing with Mock Device Kit**.

---

## Mock Device Kit in the CameraAccess Sample

To connect to a simulated device using the sample app:

1.  Tap the **Debug icon** on your mobile device. You will see the Mock Device Kit menu open.
2.  Tap **Pair RayBan Meta**. A Mock Device card is then added to the view.
3.  Swipe down the Mock Device Kit menu. The new device should now be available.

---

## Changing State

Now that your mock device is paired, you can alter the state of your virtual device:

*   To simulate powering on the glasses, tap **PowerOn**. The device must change to "Connected" on the main screen.
*   To simulate unfolding the glasses, tap **Unfold**. The device is now ready for streaming.
*   To simulate putting on the glasses, tap **Don**.

> [!NOTE]
> **CameraAccess** automatically checks camera permissions when you start streaming. If permission isn't granted, the app redirects to Meta AI to complete the flow.

---

## Simulating Media Streaming

To test your app's media handling capabilities, you can configure the Mock Device Kit with sample media files that simulate video streaming and photo capture from the glasses.

### Streaming Video

1.  Set your mock device to **Unfold**.
2.  Click **Select video** and select any supported video. This video will be used as mock streaming video.

> [!NOTE]
> Android doesn't transcode video automatically. Any video used here must be in `h265` format. To transcode a video to `h265`, you can use FFmpeg.

**Example FFmpeg command:**

```bash
ffmpeg -hwaccel videotoolbox -i input_video.mp4 -c:v hevc_videotoolbox -c:a aac_at -tag:v hvc1 -vf "scale=540:960" output_video.mov
```

### Image Capture

1.  Tap **Select image** and select any supported photo. This photo will be used as a mock capture result.
2.  Go to the main screen, navigate to the device, and start streaming. You can try capture here as well.