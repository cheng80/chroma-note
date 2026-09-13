package expo.modules.chromalineart

import java.nio.FloatBuffer
import java.util.Locale
import kotlin.math.min
import kotlin.math.round

internal fun fail(code: String): Nothing = throw IllegalArgumentException(code)

internal object PixelMath {
  fun validateOptions(maxEdge: Int, gain: Double) {
    if (maxEdge !in 16..1536 || !gain.isFinite() || gain !in 0.1..4.0) fail("lineart_invalid_options")
  }

  fun padded(n: Int) = (n + 3) / 4 * 4
  fun reflected(index: Int, count: Int) = if (index < count) index else 2 * count - 2 - index

  fun tensor(argb: IntArray, width: Int, height: Int, target: FloatBuffer) {
    val w = padded(width)
    val h = padded(height)
    for (channel in 0..2) for (y in 0 until h) for (x in 0 until w) {
      val pixel = argb[reflected(y, height) * width + reflected(x, width)]
      target.put(((pixel ushr (16 - channel * 8)) and 255) / 255f)
    }
    target.rewind()
  }

  fun colorize(line: FloatBuffer, argb: IntArray, width: Int, height: Int, gain: Double): IntArray {
    val w = padded(width)
    if (line.remaining() != w * padded(height)) fail("lineart_invalid_prediction")
    return IntArray(width * height) { index ->
      val value = line.get(index / width * w + index % width)
      if (!value.isFinite() || value !in 0f..1f) fail("lineart_invalid_prediction")
      // Swift multiplies in Float, then rounds both gray and gain ties to even.
      val gray = round(value * 255f).toInt()
      val alpha = min(255, round((255 - gray) * gain).toInt())
      var color = -0x1000000
      for (shift in 16 downTo 0 step 8) {
        val source = (argb[index] ushr shift) and 255
        color = color or (((source * alpha + 255 * (255 - alpha) + 127) / 255) shl shift)
      }
      color
    }
  }

  // Android getPixels returns unpremultiplied sRGB, unlike Swift's CGContext bytes.
  fun palette(argb: IntArray): List<Map<String, Any>> {
    val buckets = sortedMapOf<Int, Bucket>()
    for (pixel in argb) {
      val alpha = pixel ushr 24
      if (alpha == 0) continue
      val rgb = intArrayOf((pixel ushr 16) and 255, (pixel ushr 8) and 255, pixel and 255)
      val key = ((rgb[0] shr 4) shl 8) or ((rgb[1] shr 4) shl 4) or (rgb[2] shr 4)
      buckets.getOrPut(key) { Bucket() }.add(rgb, alpha / 255.0)
    }
    if (buckets.isEmpty()) fail("palette_no_visible_pixels")
    val seeds = buckets.values.sortedWith(compareByDescending<Bucket> { it.weight }.thenBy { hex(it.mean()) })
      .take(5).map { it.mean() }
    val clusters = List(seeds.size) { Bucket() }
    for (bucket in buckets.values) {
      val rgb = bucket.mean()
      val nearest = seeds.indices.minBy { i -> (0..2).sumOf { c -> (rgb[c] - seeds[i][c]) * (rgb[c] - seeds[i][c]) } }
      clusters[nearest].merge(bucket)
    }
    val total = clusters.sumOf { it.weight }
    return clusters.filter { it.weight > 0 }.sortedWith(compareByDescending<Bucket> { it.weight }.thenBy { hex(it.mean()) })
      .map { mapOf("hex" to hex(it.mean()), "rgb" to it.mean().toList(), "weight" to it.weight / total) }
  }

  private fun hex(rgb: IntArray) = String.format(Locale.ROOT, "#%02X%02X%02X", rgb[0], rgb[1], rgb[2])

  private class Bucket {
    var weight = 0.0
    val sums = DoubleArray(3)
    fun add(rgb: IntArray, amount: Double) {
      weight += amount
      for (c in 0..2) sums[c] += rgb[c] * amount
    }
    fun merge(other: Bucket) {
      weight += other.weight
      for (c in 0..2) sums[c] += other.sums[c]
    }
    fun mean() = IntArray(3) { round(sums[it] / weight).toInt() }
  }
}
