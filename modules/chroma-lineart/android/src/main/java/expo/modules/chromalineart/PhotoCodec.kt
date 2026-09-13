package expo.modules.chromalineart

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Paint
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal object PhotoCodec {
  fun decode(input: File, edge: Int, prefix: String, normalize: Boolean = false): Bitmap {
    val invalid = if (normalize) "photo_input_unavailable" else "${prefix}_invalid_input"
    if (!input.isFile || !input.canRead()) fail(invalid)
    if (input.length() > (if (normalize) 150L else 30L) * 1024 * 1024) fail("${prefix}_input_too_large")
    val pixelLimit = if (normalize) 250_000_000L else 50_000_000L
    try {
      rejectAnimatedPng(input, if (normalize) "photo_input_corrupt" else invalid)
      return if (Build.VERSION.SDK_INT >= 28) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(input)) { decoder, info, _ ->
          if (info.mimeType !in setOf("image/jpeg", "image/png", "image/heif", "image/heic")) {
            fail(if (normalize) "photo_unsupported_format" else invalid)
          }
          if (info.isAnimated) fail(if (normalize) "photo_input_corrupt" else invalid)
          if (info.mimeType == "image/heif" || info.mimeType == "image/heic") {
            val metadata = MediaMetadataRetriever()
            try {
              metadata.setDataSource(input.path)
              if (metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_IMAGE_COUNT)?.toIntOrNull() != 1) {
                fail(if (normalize) "photo_input_corrupt" else invalid)
              }
            } finally { metadata.release() }
          }
          dimensions(info.size.width, info.size.height, pixelLimit, prefix)
          val scale = min(1.0, edge.toDouble() / max(info.size.width, info.size.height))
          decoder.setTargetSize(max(1, (info.size.width * scale).roundToInt()), max(1, (info.size.height * scale).roundToInt()))
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
          decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
          decoder.setOnPartialImageListener { false }
        }
      } else {
        decodeLegacy(input, edge, pixelLimit, prefix, normalize)
      }
    } catch (error: IllegalArgumentException) {
      if (error.message?.startsWith("${prefix}_") == true) throw error
      fail("${prefix}_decode_failed")
    } catch (_: OutOfMemoryError) {
      fail("${prefix}_decode_failed")
    } catch (_: Exception) {
      fail(if (normalize) "photo_input_corrupt" else "${prefix}_decode_failed")
    }
  }

  private fun dimensions(width: Int, height: Int, limit: Long, prefix: String) {
    if (width <= 0 || height <= 0) fail("${prefix}_decode_failed")
    if (width.toLong() * height > limit) fail("${prefix}_image_too_large")
  }

  private fun decodeLegacy(input: File, edge: Int, limit: Long, prefix: String, normalize: Boolean): Bitmap {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(input.path, options)
    if (options.outMimeType !in setOf("image/jpeg", "image/png", "image/heif", "image/heic")) {
      fail(if (normalize) "photo_unsupported_format" else "${prefix}_invalid_input")
    }
    dimensions(options.outWidth, options.outHeight, limit, prefix)
    val sourceWidth = options.outWidth
    val sourceHeight = options.outHeight
    options.inSampleSize = 1
    while (max(sourceWidth, sourceHeight) / options.inSampleSize > edge * 2) options.inSampleSize *= 2
    options.inJustDecodeBounds = false
    options.inPreferredConfig = Bitmap.Config.ARGB_8888
    if (Build.VERSION.SDK_INT >= 26) options.inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
    var bitmap = BitmapFactory.decodeFile(input.path, options) ?: fail("${prefix}_decode_failed")
    try {
      val exif = try { ExifInterface(input) } catch (_: Exception) { null }
      val matrix = Matrix()
      when (exif?.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) ?: 1) {
        2 -> matrix.setScale(-1f, 1f)
        3 -> matrix.setRotate(180f)
        4 -> matrix.setScale(1f, -1f)
        5 -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
        6 -> matrix.setRotate(90f)
        7 -> { matrix.setRotate(-90f); matrix.postScale(-1f, 1f) }
        8 -> matrix.setRotate(-90f)
      }
      val scale = min(1.0, edge.toDouble() / max(sourceWidth, sourceHeight))
      val w = max(1, (sourceWidth * scale).roundToInt())
      val h = max(1, (sourceHeight * scale).roundToInt())
      val resized = Bitmap.createScaledBitmap(bitmap, w, h, true)
      if (resized !== bitmap) { bitmap.recycle(); bitmap = resized }
      val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (oriented !== bitmap) bitmap.recycle()
      return oriented
    } catch (error: Throwable) {
      bitmap.recycle()
      throw error
    }
  }

  private fun rejectAnimatedPng(input: File, error: String) {
    RandomAccessFile(input, "r").use { file ->
      if (file.length() < 8 || file.readLong() != -8552249625308161526L) return
      while (file.filePointer + 12 <= file.length()) {
        val length = file.readInt().toLong() and 0xffffffffL
        val type = file.readInt()
        if (length > file.length() - file.filePointer - 4) fail(error)
        val next = file.filePointer + length + 4
        if (type == 0x6163544c && (length != 8L || file.readInt() != 1)) fail(error) // acTL
        if (type == 0x49454e44) return // IEND
        file.seek(next)
      }
      fail(error)
    }
  }

  fun pixels(bitmap: Bitmap, white: Boolean = false): IntArray {
    var rendered = bitmap
    if (white) {
      rendered = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
      Canvas(rendered).apply {
        drawColor(Color.WHITE)
        drawBitmap(bitmap, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG))
      }
    }
    return try {
      IntArray(bitmap.width * bitmap.height).also { rendered.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height) }
    } finally { if (rendered !== bitmap) rendered.recycle() }
  }

  fun normalize(input: File, folder: File): Map<String, Any> {
    val bitmap = decode(input, 2048, "photo", normalize = true)
    try {
      val captured = capturedDate(input)
      val transparent = pixels(bitmap).any { it ushr 24 < 255 }
      val output = File(folder, "photo-${UUID.randomUUID()}.${if (transparent) "png" else "jpg"}")
      write(bitmap, output, if (transparent) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, "photo")
      return linkedMapOf<String, Any>("uri" to Uri.fromFile(output).toString(), "width" to bitmap.width,
        "height" to bitmap.height, "bytes" to output.length()).apply {
        captured?.let { put("capturedDate", it) }
      }
    } finally { bitmap.recycle() }
  }

  fun capturedDate(input: File): String? {
    val exif = try { ExifInterface(input) } catch (_: Exception) { return null }
    return captureDate(listOf(ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED, ExifInterface.TAG_DATETIME).map { exif.getAttribute(it) })
  }

  fun captureDate(values: List<String?>): String? {
    for (value in values) {
      if (value == null || !Regex("[0-9]{4}:[0-9]{2}:[0-9]{2}.*").matches(value)) continue
      val parts = value.take(10).split(':').map { it.toInt() }
      val calendar = GregorianCalendar(TimeZone.getTimeZone("UTC"), Locale.ROOT).apply {
        isLenient = false
        clear()
        set(parts[0], parts[1] - 1, parts[2])
      }
      try { calendar.time } catch (_: IllegalArgumentException) { continue }
      if (parts[0] < 1) continue
      return String.format(Locale.ROOT, "%04d-%02d-%02d", parts[0], parts[1], parts[2])
    }
    return null
  }

  fun write(bitmap: Bitmap, output: File, format: Bitmap.CompressFormat, prefix: String,
            maxBytes: Long = Long.MAX_VALUE, cancelled: () -> Unit = {}) {
    if (output.exists()) fail("${prefix}_output_exists")
    val parent = output.parentFile ?: fail("${prefix}_invalid_output")
    if (!parent.isDirectory || !parent.canWrite()) fail("${prefix}_invalid_output")
    var temporary: File? = null
    var published = false
    try {
      cancelled()
      temporary = File.createTempFile(".$prefix-", ".tmp", parent)
      FileOutputStream(temporary).use { stream ->
        if (!bitmap.compress(format, 95, stream)) fail("${prefix}_output_failed")
        stream.fd.sync()
      }
      if (temporary.length() == 0L) fail("${prefix}_output_failed")
      if (temporary.length() > maxBytes) fail("${prefix}_output_too_large")
      cancelled()
      // Android SELinux denies hard links in app data. UUID outputs are published
      // on the module's serial queue; same-directory rename keeps readers atomic.
      if (output.exists()) fail("${prefix}_output_exists")
      Os.rename(temporary.path, output.path)
      published = true
      cancelled()
    } catch (error: Throwable) {
      if (published) output.delete()
      if (error is IllegalArgumentException) throw error
      val causes = generateSequence(error) { it.cause }.take(8)
      if (causes.any { it is ErrnoException && it.errno == OsConstants.ENOSPC }) fail("${prefix}_storage_full")
      if (error is ErrnoException && error.errno == OsConstants.EEXIST) fail("${prefix}_output_exists")
      fail("${prefix}_output_failed")
    } finally { temporary?.delete() }
  }
}
