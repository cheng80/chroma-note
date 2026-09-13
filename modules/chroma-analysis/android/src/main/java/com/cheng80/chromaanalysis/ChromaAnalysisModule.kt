package com.cheng80.chromaanalysis

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URI
import java.util.UUID
import java.util.concurrent.Executors

class ChromaAnalysisModule : Module() {
  private val work = Executors.newSingleThreadExecutor()
  private val lock = Any()
  private var activeJob: String? = null
  private var cancelled = false
  private var unloading = false
  private var destroyed = false
  private var engine: AnalysisEngine? = null
  private var assets: ModelAssetStore? = null

  override fun definition() = ModuleDefinition {
    Name("ChromaAnalysis")
    Events("onModelDownloadProgress")
    OnCreate { assets = ModelAssetStore(context()) { sendEvent("onModelDownloadProgress", it) } }
    AsyncFunction("getModelAssetStatus") { modelAssets().getStatus() }
    AsyncFunction("downloadModelAssets") { modelAssets().download() }
    AsyncFunction("pauseModelDownload") { modelAssets().pause() }
    OnActivityEntersBackground { assets?.pause() }

    Function("begin") { begin() }
    Function("cancel") { id: String ->
      synchronized(lock) {
        if (activeJob == id) { cancelled = true; engine?.cancel() }
      }
    }
    AsyncFunction("prepareAsync") { promise: Promise ->
      try { prepareJob(begin(), promise) } catch (error: Throwable) { reject(promise, error) }
    }
    AsyncFunction("prepareJobAsync") { id: String, promise: Promise -> prepareJob(id, promise) }
    AsyncFunction("generateAsync") { id: String, uri: String, prompt: String, maxTokens: Int, promise: Promise ->
      runJob(id, promise) { runtime ->
        if (maxTokens !in 8..128 || prompt.codePointCount(0, prompt.length) !in 1..1200) fail("analysis_invalid_request")
        val image = localImage(uri)
        val (model, vision) = modelAssets().verifiedPaths()
        runtime.prepare(model, vision)
        val started = System.nanoTime()
        val text = runtime.generate(image, prompt, maxTokens)
        mapOf("text" to text, "durationMs" to (System.nanoTime() - started) / 1_000_000)
      }
    }
    AsyncFunction("unloadAsync") { promise: Promise ->
      val accepted = synchronized(lock) {
        if ((activeJob != null && !cancelled) || unloading || destroyed) false else { unloading = true; true }
      }
      if (!accepted) promise.reject("analysis_busy", "analysis_busy", null)
      else work.execute {
        var failure: Throwable? = null
        try {
          synchronized(lock) { engine?.close(); engine = null }
        } catch (error: Throwable) { failure = error }
        finally { synchronized(lock) { unloading = false } }
        failure?.let { reject(promise, it) } ?: promise.resolve()
      }
    }
    OnDestroy {
      assets?.close()
      synchronized(lock) { destroyed = true; cancelled = true; engine?.cancel() }
      work.execute { synchronized(lock) { engine?.close(); engine = null } }
      work.shutdown()
    }
  }

  private fun context(): Context = appContext.reactContext ?: fail("analysis_native_build_required")
  private fun modelAssets(): ModelAssetStore = assets ?: fail("model_native_build_required")
  private fun begin(): String = synchronized(lock) {
    if (activeJob != null || unloading || destroyed) fail("analysis_busy")
    UUID.randomUUID().toString().also { activeJob = it; cancelled = false }
  }
  private fun prepareJob(id: String, promise: Promise) = runJob(id, promise) { runtime ->
    val (model, vision) = modelAssets().verifiedPaths()
    runtime.prepare(model, vision)
    mapOf("ready" to true)
  }

  private fun runJob(id: String, promise: Promise, action: (AnalysisEngine) -> Any?) {
    work.execute {
      try {
        val runtime = synchronized(lock) {
          if (activeJob != id || cancelled || destroyed) fail("analysis_cancelled")
          (engine ?: AnalysisEngine().also { engine = it }).also { it.beginJob() }
        }
        val result = action(runtime)
        synchronized(lock) {
          if (activeJob != id || cancelled || destroyed) fail("analysis_cancelled")
          activeJob = null
        }
        promise.resolve(result)
      } catch (error: Throwable) {
        synchronized(lock) {
          if (cancelled || errorCode(error) in setOf("analysis_model_load_failed", "analysis_vision_load_failed", "analysis_out_of_memory", "analysis_tokenize_failed", "analysis_image_eval_failed", "analysis_decode_failed")) {
            engine?.close(); engine = null
          }
          if (activeJob == id) activeJob = null
        }
        reject(promise, error)
      }
      finally { synchronized(lock) { if (activeJob == id) activeJob = null } }
    }
  }

  private fun localImage(raw: String): File {
    val uri = try { URI(raw) } catch (_: Exception) { fail("analysis_local_file_required") }
    if (uri.scheme != "file" || !uri.authority.isNullOrEmpty() || uri.query != null || uri.fragment != null) fail("analysis_local_file_required")
    val file = File(uri).canonicalFile
    val context = context()
    if (listOf(context.filesDir, context.cacheDir, context.noBackupFilesDir).none { file.path.startsWith(it.canonicalPath + File.separator) }) fail("analysis_app_file_required")
    if (!file.isFile || file.length() !in 1..30L * 1024 * 1024 || file.extension.lowercase() !in setOf("jpg", "jpeg", "png")) fail("analysis_invalid_image")
    return file
  }

  private fun reject(promise: Promise, error: Throwable) {
    val code = errorCode(error)
    promise.reject(code, code, null)
  }
  private fun errorCode(error: Throwable): String = if (error is OutOfMemoryError) "analysis_out_of_memory"
    else error.message?.takeIf { it.matches(Regex("(?:analysis|model)_[a-z_]+")) } ?: "analysis_failed"
  private fun fail(code: String): Nothing = throw IllegalStateException(code)
}
