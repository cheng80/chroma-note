package expo.modules.chromalineart

import java.io.File
import java.nio.FloatBuffer
import java.nio.file.Files
import java.util.UUID
import kotlin.math.abs

private fun rejects(code: String, block: () -> Unit) {
  val error = runCatching(block).exceptionOrNull()
  check(error is IllegalArgumentException && error.message == code) { "Expected $code; got $error" }
}

fun main(args: Array<String>) {
  PixelMath.validateOptions(16, .1)
  PixelMath.validateOptions(1536, 4.0)
  for (edge in listOf(-1, 0, 15, 1537)) rejects("lineart_invalid_options") { PixelMath.validateOptions(edge, 1.8) }
  for (gain in listOf(Double.NaN, Double.POSITIVE_INFINITY, 0.0, 4.1)) rejects("lineart_invalid_options") { PixelMath.validateOptions(1024, gain) }

  val source = IntArray(17 * 19) { i -> 0xff000000.toInt() or ((i % 256) shl 16) or ((i * 3 % 256) shl 8) or (i * 7 % 256) }
  val tensor = FloatBuffer.allocate(3 * 20 * 20)
  PixelMath.tensor(source, 17, 19, tensor)
  check(tensor[17] == ((source[15] ushr 16) and 255) / 255f)
  check(tensor[19 * 20] == ((source[17 * 17] ushr 16) and 255) / 255f)
  check(tensor[400] == ((source[0] ushr 8) and 255) / 255f)
  check(tensor[800 + 18] == (source[14] and 255) / 255f)
  check(PixelMath.colorize(FloatBuffer.wrap(FloatArray(400) { 1f }), source, 17, 19, 1.8).all { it == -1 })
  check(PixelMath.colorize(FloatBuffer.wrap(FloatArray(400)), source, 17, 19, 1.8).contentEquals(source))
  // 0.5 * 255 -> 128 (ties to even), then 127 * .5 -> 64 (ties to even).
  val midpoint = PixelMath.colorize(FloatBuffer.wrap(FloatArray(256) { .5f }), IntArray(256) { 0xff000000.toInt() }, 16, 16, .5)
  check(midpoint.all { it == 0xffbfbfbf.toInt() })
  rejects("lineart_invalid_prediction") { PixelMath.colorize(FloatBuffer.wrap(FloatArray(256) { Float.NaN }), IntArray(256), 16, 16, 1.8) }
  rejects("lineart_invalid_prediction") { PixelMath.colorize(FloatBuffer.wrap(FloatArray(255)), IntArray(256), 16, 16, 1.8) }

  val red = 0xffff0000.toInt()
  val blue = 0xff0000ff.toInt()
  check(PixelMath.palette(intArrayOf(red)).single() == mapOf("hex" to "#FF0000", "rgb" to listOf(255, 0, 0), "weight" to 1.0))
  val tags = PixelMath.palette(intArrayOf(red, blue, blue))
  check(tags[0]["hex"] == "#0000FF" && tags[0]["weight"] == 2.0 / 3.0)
  check(PixelMath.palette(intArrayOf(red, blue)).first()["hex"] == "#0000FF")
  val alpha = PixelMath.palette(intArrayOf(0x00ff00ff, blue, 0x80ff0000.toInt()))
  check(alpha.size == 2 && alpha[1]["hex"] == "#FF0000")
  check(abs(alpha[1]["weight"] as Double - 128.0 / 383.0) < 1e-12)
  val many = PixelMath.palette(source)
  check(many.size in 1..5 && many == PixelMath.palette(source))
  check(abs(many.sumOf { it["weight"] as Double } - 1.0) < 1e-12)
  rejects("palette_no_visible_pixels") { PixelMath.palette(intArrayOf(0x00ff0000)) }

  val root = Files.createTempDirectory(File(args.single()).toPath(), "core-").toFile()
  try {
    val files = File(root, "files").apply { mkdir() }
    val cache = File(root, "cache").apply { mkdir() }
    val noBackup = File(root, "no_backup").apply { mkdir() }
    val outside = File(root, "files-other").apply { mkdir() }
    val policy = PrivateFiles(files, cache, noBackup, false)
    val folder = File(files, "draft").apply { mkdir() }
    check(policy.directory(folder.toURI().toString()) == folder.canonicalFile)
    for (bad in listOf("content://image/1", "https://example.com/image.png", "file://localhost/a", folder.toURI().toString() + "?x=1", folder.toURI().toString() + "#x")) {
      rejects("lineart_local_file_required") { policy.local(bad) }
    }
    rejects("lineart_app_file_required") { policy.local(outside.toURI().toString()) }
    rejects("lineart_app_file_required") { policy.local(files.toURI().toString()) }
    rejects("lineart_app_file_required") { policy.local(File(files, "../files-other/photo.png").toURI().toString()) }
    Files.createSymbolicLink(File(folder, "escape").toPath(), outside.toPath())
    rejects("lineart_app_file_required") { policy.local(File(folder, "escape/photo.png").toURI().toString()) }
    val backupPolicy = PrivateFiles(files, cache, noBackup, true)
    rejects("lineart_private_directory_requires_backup_exclusion") { backupPolicy.directory(folder.toURI().toString()) }
    for (safe in listOf(cache, noBackup)) {
      val draft = File(safe, "draft").apply { mkdir() }
      check(backupPolicy.directory(draft.toURI().toString()) == draft.canonicalFile)
    }
    val original = File(folder, "photo-original.png").apply { writeText("original") }
    rejects("lineart_invalid_result") { policy.discard(original.toURI().toString()) }
    check(original.readText() == "original")
    val result = File(folder, "lineart-${UUID.randomUUID()}.png").apply { writeText("generated") }
    policy.discard(result.toURI().toString())
    policy.discard(result.toURI().toString())
    check(!result.exists())
  } finally { root.deleteRecursively() }

  val jobs = LineArtJobs()
  val first = jobs.begin()
  rejects("lineart_busy") { jobs.begin() }
  rejects("lineart_cancelled") { jobs.check("unknown") }
  check(!jobs.finish("unknown"))
  jobs.check(first)
  jobs.cancel(first)
  rejects("lineart_cancelled") { jobs.check(first) }
  check(!jobs.finish(first))
  val next = jobs.begin()
  jobs.cancel(first)
  jobs.check(next)
  check(jobs.finish(next))
  val destroyed = jobs.begin()
  jobs.destroy()
  rejects("lineart_cancelled") { jobs.check(destroyed) }
  check(!jobs.finish(destroyed))
  rejects("lineart_cancelled") { jobs.begin() }
  println("PASS: options, reflection/NCHW, ties-to-even RGB, palette, path/symlink/backup boundaries, discard, cancellation/job lifecycle")
}
