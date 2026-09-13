package expo.modules.chromalineart

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.res.AssetManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.SystemClock
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal class LineArtEngine(assets: AssetManager) : AutoCloseable {
  private val environment = OrtEnvironment.getEnvironment()
  private val session = OrtSession.SessionOptions().use { options ->
    options.setIntraOpNumThreads(2)
    options.setInterOpNumThreads(1)
    // Release large activation buffers after each photo; don't retain a peak-size arena.
    options.setCPUArenaAllocator(false)
    options.setMemoryPatternOptimization(false)
    val bytes = try { assets.open("chroma-lineart/LineArt.onnx").use { it.readBytes() } }
      catch (_: Exception) { fail("lineart_model_missing") }
    try { environment.createSession(bytes, options) } catch (_: Exception) { fail("lineart_model_failed") }
  }

  fun convert(input: File, output: File, maxEdge: Int, gain: Double, check: () -> Unit): Map<String, Any> {
    val started = SystemClock.elapsedRealtimeNanos()
    PixelMath.validateOptions(maxEdge, gain)
    check()
    if (input.canonicalFile == output.canonicalFile || output.extension != "png") fail("lineart_invalid_output")
    if (output.exists()) fail("lineart_output_exists")
    val photo = PhotoCodec.decode(input, maxEdge, "lineart")
    try {
      if (photo.width < 16 || photo.height < 16) fail("lineart_image_too_small")
      check()
      val pixels = PhotoCodec.pixels(photo, white = true)
      val width = PixelMath.padded(photo.width)
      val height = PixelMath.padded(photo.height)
      val buffer = ByteBuffer.allocateDirect(3 * width * height * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
      PixelMath.tensor(pixels, photo.width, photo.height, buffer)
      check()
      val colors = try {
        OnnxTensor.createTensor(environment, buffer, longArrayOf(1, 3, height.toLong(), width.toLong())).use { tensor ->
          session.run(mapOf("image" to tensor)).use { result ->
            check()
            val line = result.get("line").orElse(null) as? OnnxTensor ?: fail("lineart_invalid_prediction")
            if (line.info.type != OnnxJavaType.FLOAT || !line.info.shape.contentEquals(longArrayOf(1, 1, height.toLong(), width.toLong()))) {
              fail("lineart_invalid_prediction")
            }
            PixelMath.colorize(line.floatBuffer, pixels, photo.width, photo.height, gain)
          }
        }
      } catch (error: IllegalArgumentException) { throw error }
        catch (_: Exception) { fail("lineart_model_failed") }
      check()
      val result = Bitmap.createBitmap(colors, photo.width, photo.height, Bitmap.Config.ARGB_8888)
      try { PhotoCodec.write(result, output, Bitmap.CompressFormat.PNG, "lineart", 5L * 1024 * 1024, check) }
      finally { result.recycle() }
      return mapOf("uri" to Uri.fromFile(output).toString(), "width" to photo.width, "height" to photo.height,
        "bytes" to output.length(), "durationMs" to (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000.0)
    } catch (_: OutOfMemoryError) {
      fail("lineart_model_failed")
    } finally { photo.recycle() }
  }

  override fun close() = session.close()
}
