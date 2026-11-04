package expo.modules.metawearables

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.PhotoData
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.DatResult
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionError
import com.meta.wearable.dat.core.types.PermissionStatus
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.FileOutputStream

private typealias PermissionResult = DatResult<PermissionStatus, PermissionError>

/** Adapts the toolkit's androidx RequestPermissionContract to Expo's activity-result API. */
private class RequestPermission : AppContextActivityResultContract<Permission, PermissionResult> {
  private val contract = Wearables.RequestPermissionContract()

  override fun createIntent(context: Context, input: Permission): Intent = contract.createIntent(context, input)

  override fun parseResult(input: Permission, resultCode: Int, intent: Intent?): PermissionResult =
    contract.parseResult(resultCode, intent)
}

private const val SESSION_START_TIMEOUT_MS = 15_000L

/**
 * Expo module over the Meta Wearables Device Access Toolkit (Android):
 * registration with the Meta AI app, the CAMERA device permission, a camera
 * stream from the glasses, and in-stream photo capture.
 */
class MetaWearablesModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var initialized = false
  private var session: DeviceSession? = null
  private var camera: Camera? = null
  private var streamStateJob: Job? = null
  private lateinit var permissionLauncher: AppContextActivityResultLauncher<Permission, PermissionResult>

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MetaWearables")

    Events("onRegistrationChange", "onStreamStateChange", "onPermissionResult")

    RegisterActivityContracts {
      permissionLauncher = registerForActivityResult(RequestPermission())
    }

    Function("initialize") {
      ensureInitialized()
    }

    Function("startRegistration") {
      ensureInitialized()
      Wearables.startRegistration(appContext.currentActivity ?: throw Exceptions.MissingActivity())
    }

    Function("getRegistrationState") {
      ensureInitialized()
      Wearables.registrationState.value.name
    }

    AsyncFunction("checkPermission") Coroutine { permissionName: String ->
      ensureInitialized()
      val result = Wearables.checkPermissionStatus(permissionOf(permissionName))
      result.errorOrNull()?.let { throw CodedException("ERR_PERMISSION", it.description, null) }
      result.getOrNull() == PermissionStatus.Granted
    }

    AsyncFunction("requestPermission") Coroutine { permissionName: String ->
      ensureInitialized()
      val result = permissionLauncher.launch(permissionOf(permissionName))
      result.errorOrNull()?.let { throw CodedException("ERR_PERMISSION", it.description, null) }
      val status = if (result.getOrNull() == PermissionStatus.Granted) "GRANTED" else "DENIED"
      sendEvent("onPermissionResult", mapOf("permission" to permissionName, "status" to status))
    }

    // deviceId is accepted for API compatibility; the toolkit picks the linked glasses (AutoDeviceSelector).
    AsyncFunction("startStream") Coroutine { _: String? ->
      ensureInitialized()
      stopStreaming()
      val newSession = Wearables.createSession(AutoDeviceSelector()).let { result ->
        result.errorOrNull()?.let { throw CodedException("ERR_SESSION", it.description, null) }
        result.getOrThrow()
      }
      session = newSession
      newSession.start()
      val state = withTimeoutOrNull(SESSION_START_TIMEOUT_MS) {
        newSession.state.first { it == DeviceSessionState.STARTED || it == DeviceSessionState.STOPPED }
      }
      if (state != DeviceSessionState.STARTED) {
        stopStreaming()
        throw CodedException("ERR_SESSION", "Glasses session did not start (state: ${state ?: "timeout"})", null)
      }

      val cameraResult = newSession.addCamera(StreamConfiguration(videoQuality = VideoQuality.MEDIUM, frameRate = 24))
      cameraResult.errorOrNull()?.let {
        stopStreaming()
        throw CodedException("ERR_CAMERA", it.description, null)
      }
      val newCamera = cameraResult.getOrThrow()
      camera = newCamera
      streamStateJob = scope.launch {
        newCamera.stream.state.collect { sendEvent("onStreamStateChange", mapOf("state" to it.name)) }
      }
      newCamera.stream.start().errorOrNull()?.let {
        stopStreaming()
        throw CodedException("ERR_STREAM", it.description, null)
      }
    }

    AsyncFunction("capturePhoto") Coroutine { ->
      val stream = camera?.stream ?: throw CodedException("ERR_NOT_STREAMING", "Start the stream before capturing", null)
      val result = stream.capturePhoto()
      result.errorOrNull()?.let { throw CodedException("ERR_CAPTURE", it.description, null) }
      Uri.fromFile(savePhoto(result.getOrThrow())).toString()
    }

    Function("stopStream") {
      stopStreaming()
    }

    OnDestroy {
      stopStreaming()
      scope.cancel()
    }
  }

  private fun ensureInitialized() {
    if (initialized) return
    Wearables.initialize(context).errorOrNull()?.let {
      throw CodedException("ERR_INITIALIZE", it.description, null)
    }
    initialized = true
    scope.launch {
      Wearables.registrationState.collect { sendEvent("onRegistrationChange", mapOf("state" to it.name)) }
    }
  }

  private fun permissionOf(name: String): Permission =
    Permission.entries.firstOrNull { it.name == name.uppercase() }
      ?: throw CodedException("ERR_PERMISSION", "Unknown permission: $name", null)

  private fun stopStreaming() {
    streamStateJob?.cancel()
    streamStateJob = null
    camera?.stop()
    camera = null
    session?.stop()
    session = null
  }

  private fun savePhoto(photo: PhotoData): File {
    val dir = File(context.cacheDir, "meta-wearables").apply { mkdirs() }
    return when (photo) {
      is PhotoData.Bitmap -> File(dir, "capture-${System.currentTimeMillis()}.jpg").also { file ->
        FileOutputStream(file).use { photo.bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
      }
      is PhotoData.HEIC -> File(dir, "capture-${System.currentTimeMillis()}.heic").also { file ->
        val bytes = ByteArray(photo.data.remaining()).also { photo.data.duplicate().get(it) }
        file.writeBytes(bytes)
      }
    }
  }
}
