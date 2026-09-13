package expo.modules.chromalineart

import android.content.pm.ApplicationInfo
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import java.io.File
import java.util.concurrent.Executors

class NativeLineArtOptions : Record {
  @Field var maxEdge: Int = 1024
  @Field var lineGain: Double = 1.8
}

class ChromaLineArtModule : Module() {
  private val jobs = LineArtJobs()
  // ponytail: one serial photo pipeline, matching the app's one active photo draft.
  private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "chroma.lineart") }
  private val work = CoroutineScope(SupervisorJob() + executor.asCoroutineDispatcher())
  private var engine: LineArtEngine? = null

  private fun files(): PrivateFiles {
    val context = appContext.reactContext ?: fail("lineart_context_unavailable")
    return PrivateFiles(context.filesDir, context.cacheDir, context.noBackupFilesDir,
      context.applicationInfo.flags and ApplicationInfo.FLAG_ALLOW_BACKUP != 0)
  }

  private fun <T> coded(block: () -> T): T = try { block() }
    catch (error: IllegalArgumentException) { throw CodedException(error.message, error.message, error) }

  override fun definition() = ModuleDefinition {
    Name("ChromaLineArt")

    Function("begin") { coded { jobs.begin() } }
    Function("cancel") { id: String -> jobs.cancel(id) }

    AsyncFunction("convertAsync") { id: String, uri: String, directory: String, options: NativeLineArtOptions ->
      coded {
        var output: File? = null
        var produced = false
        try {
          jobs.check(id)
          PixelMath.validateOptions(options.maxEdge, options.lineGain)
          val policy = files()
          val input = policy.local(uri)
          output = File(policy.directory(directory), "lineart-$id.png")
          if (engine == null) {
            val context = appContext.reactContext ?: fail("lineart_context_unavailable")
            engine = LineArtEngine(context.assets)
          }
          jobs.check(id)
          val result = engine!!.convert(input, output, options.maxEdge, options.lineGain) { jobs.check(id) }
          produced = true
          if (!jobs.finish(id)) fail("lineart_cancelled")
          result
        } catch (error: Throwable) {
          if (produced) output?.delete()
          throw error
        } finally { jobs.finish(id) }
      }
    }.runOnQueue(work)

    AsyncFunction("discardResult") { uri: String -> coded { files().discard(uri) } }.runOnQueue(work)

    AsyncFunction("extractPaletteAsync") { uri: String ->
      coded {
        val bitmap = PhotoCodec.decode(files().local(uri), 256, "palette")
        try { PixelMath.palette(PhotoCodec.pixels(bitmap)) } finally { bitmap.recycle() }
      }
    }.runOnQueue(work)

    AsyncFunction("preparePrivateDirectoryAsync") { directory: String -> coded { files().directory(directory); Unit } }.runOnQueue(work)

    AsyncFunction("normalizePhotoAsync") { uri: String, directory: String ->
      coded {
        val policy = files()
        PhotoCodec.normalize(policy.local(uri), policy.directory(directory, "photo_output_directory_required"))
      }
    }.runOnQueue(work)

    OnDestroy {
      jobs.destroy()
      // Close only after in-flight inference and queued work have returned.
      executor.execute { engine?.close(); engine = null }
      executor.shutdown()
    }
  }
}
