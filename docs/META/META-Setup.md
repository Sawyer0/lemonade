# Meta Wearables: Setup Guide (Technical Reference)

**Updated:** Dec 2, 2025

## Overview

The Wearables Device Access Toolkit supports iOS and Android mobile platforms, with the same OS version requirements as the Meta AI app (iOS 15.2+ and Android 10+).

*   **iOS**: Xcode 14.0+
*   **Android**: Android Studio Flamingo or newer

---

## Hardware Requirements

Currently, the SDK supports:
*   Ray-Ban Meta (Gen-1 and Gen-2)
*   Oakley Meta HSTN

You can test with a simulated device using **Mock Device Kit**, or directly with a physical device.

---

## Setting Up Your Glasses

To set up your glasses for development:

1.  Ensure your **Meta AI app** version is **v247+**.
2.  Ensure your **glasses software** is version **v20+**.
3.  Connect your glasses to the Meta AI app.
4.  Enable **Developer Mode**.

### Verify Glasses Software Version

1.  In the Meta AI app, go to the **Devices** tab (the glasses icon at the bottom of the app), and select your device.
2.  Tap the gear icon to open **Device settings**.
3.  Tap **General** > **About** > **Version**.

> [!IMPORTANT]
> You should have version **20.0** or above installed on your glasses. If your version is below 20.0, update your glasses software.

### Enable Developer Mode in the Meta AI App

1.  On your iOS or Android device, select **Settings** > **App Info**.
2.  Tap the **App version number** five times to display the toggle for developer mode.
3.  Select the **toggle** to enable Developer Mode.
4.  Click **Enable** to confirm.

---

## SDK for Android Setup

The Wearables Device Access Toolkit for Android is distributed through GitHub Packages. To be able to include it in your Gradle or Android Studio project, you need to provide a **personal access token (classic)** with at least `read:packages` scope.

> [!TIP]
> Follow the instructions [here](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) to create a new personal access token (classic).

In the **CameraAccess** sample app, the token can be provided in two ways:

### Option 1: Environment Variable (Terminal)

Set the environment variable `GITHUB_TOKEN` with your personal access token:

```bash
export GITHUB_TOKEN=ghp...  # your personal access token (classic)

./gradlew installDebug  # from the directory of the actual project
```

### Option 2: Local Properties (Android Studio)

Alternatively, creating a `local.properties` file in the project root with your personal access token and set the key `github_token` with your token. Then, in Android Studio, refresh the Gradle project by clicking **File** > **Sync Project with Gradle Files**.

```properties
github_token=ghp_...  # your personal access token (classic)
```