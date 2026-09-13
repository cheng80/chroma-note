package expo.modules.chromalineart

import android.app.Activity
import android.app.Instrumentation
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.util.UUID

/** Run by the parent's Android test APK; creates/removes only its own no-backup folder. */
class LineArtInstrumentation : Instrumentation() {
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

  override fun onStart() {
    val result = Bundle()
    try {
      runChecks()
      result.putString("stream", "PASS: Android decode/EXIF/sRGB, normalization, transparency/palette, actual ONNX/PNG, invalid input, cancellation/atomic output\n")
      finish(Activity.RESULT_OK, result)
    } catch (error: Throwable) {
      result.putString("stream", "FAIL: ${error.stackTraceToString()}\n")
      finish(Activity.RESULT_CANCELED, result)
    }
  }

  private fun rejects(code: String, block: () -> Unit) {
    val error = runCatching(block).exceptionOrNull()
    check(error is IllegalArgumentException && error.message == code) { "Expected $code; got $error" }
  }

  private fun runChecks() {
    val folder = File(targetContext.noBackupFilesDir, "lineart-check-${UUID.randomUUID()}").apply { mkdirs() }
    try {
      val pixels = IntArray(101 * 151) { i -> 0xff000000.toInt() or ((i * 17 % 256) shl 16) or ((i * 29 % 256) shl 8) or (i * 31 % 256) }
      val bitmap = Bitmap.createBitmap(pixels, 101, 151, Bitmap.Config.ARGB_8888)
      val input = File(folder, "input.png")
      try { input.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) } } finally { bitmap.recycle() }
      val original = input.readBytes()
      val normalized = PhotoCodec.normalize(input, folder)
      val policy = PrivateFiles(targetContext.filesDir, targetContext.cacheDir, targetContext.noBackupFilesDir, false)
      val checkedFolder = policy.directory(Uri.fromFile(folder).toString())
      check((PhotoCodec.normalize(input, checkedFolder)["uri"] as String).startsWith(Uri.fromFile(folder).toString() + "/")) {
        "Native normalized URI must preserve the caller's private directory prefix"
      }
      check(normalized["width"] == 101 && normalized["height"] == 151)
      check((normalized["uri"] as String).endsWith(".jpg"))
      check((normalized["uri"] as String).startsWith(Uri.fromFile(folder).toString() + "/"))
      check(!normalized.containsKey("capturedDate"))
      val corrupt = File(folder, "broken.png").apply { writeText("not an image") }
      rejects("photo_input_corrupt") { PhotoCodec.normalize(corrupt, folder) }

      val transparent = File(folder, "alpha.png")
      val alphaBitmap = Bitmap.createBitmap(intArrayOf(0x00000000, 0x80ff0000.toInt(), 0xff0000ff.toInt()), 3, 1, Bitmap.Config.ARGB_8888)
      try { transparent.outputStream().use { check(alphaBitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) } } finally { alphaBitmap.recycle() }
      val alpha = PhotoCodec.normalize(transparent, folder)
      check((alpha["uri"] as String).endsWith(".png"))
      val decoded = PhotoCodec.decode(transparent, 256, "palette")
      try {
        val tags = PixelMath.palette(PhotoCodec.pixels(decoded))
        check(tags.size == 2 && tags[0]["hex"] == "#0000FF" && tags[1]["hex"] == "#FF0000")
      } finally { decoded.recycle() }

      val jpeg = File(java.net.URI(normalized["uri"] as String))
      ExifInterface(jpeg).apply {
        setAttribute(ExifInterface.TAG_ORIENTATION, "6")
        setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2024:02:29 12:00:00")
        saveAttributes()
      }
      val rotated = PhotoCodec.normalize(jpeg, folder)
      check(rotated["width"] == 151 && rotated["height"] == 101 && rotated["capturedDate"] == "2024-02-29")
      check(PhotoCodec.captureDate(listOf("2023:02:29 00:00:00", "2024:02:29 00:00:00")) == "2024-02-29")

      val large = Bitmap.createBitmap(4096, 2048, Bitmap.Config.ARGB_8888)
      val largeFile = File(folder, "large.jpg")
      try { large.eraseColor(0xff123456.toInt()); largeFile.outputStream().use { check(large.compress(Bitmap.CompressFormat.JPEG, 95, it)) } } finally { large.recycle() }
      val resized = PhotoCodec.normalize(largeFile, folder)
      check(resized["width"] == 2048 && resized["height"] == 1024)

      LineArtEngine(targetContext.assets).use { engine ->
        val output = File(folder, "lineart-${UUID.randomUUID()}.png")
        val generated = engine.convert(input, output, 1024, 1.8) {}
        check(generated["width"] == 101 && generated["height"] == 151 && generated["bytes"] == output.length())
        check((generated["durationMs"] as Double) >= 0 && output.length() in 1..5L * 1024 * 1024)
        val actual = BitmapFactory.decodeFile(output.path)
        try { check(actual != null && actual.width == 101 && actual.height == 151 && PhotoCodec.pixels(actual).all { it ushr 24 == 255 }) }
        finally { actual?.recycle() }
        rejects("lineart_output_exists") { engine.convert(input, output, 1024, 1.8) {} }
        val canceled = File(folder, "lineart-${UUID.randomUUID()}.png")
        rejects("lineart_cancelled") { engine.convert(input, canceled, 1024, 1.8) { fail("lineart_cancelled") } }
        check(!canceled.exists())
        var step = 0
        rejects("lineart_cancelled") { engine.convert(input, canceled, 1024, 1.8) { if (++step == 8) fail("lineart_cancelled") } }
        check(!canceled.exists())
        rejects("lineart_image_too_small") { engine.convert(transparent, canceled, 1024, 1.8) {} }
      }
      check(input.readBytes().contentEquals(original))
      check(folder.listFiles()!!.none { it.name.startsWith(".lineart-") || it.name.startsWith(".photo-") })
    } finally { folder.deleteRecursively() }
  }
}
