package expo.modules.chromalineart

import java.io.File
import java.net.URI
import java.util.UUID

internal class PrivateFiles(private val files: File, private val cache: File, private val noBackup: File, private val backupAllowed: Boolean) {
  fun local(raw: String): File {
    val uri = try { URI(raw) } catch (_: Exception) { fail("lineart_local_file_required") }
    if (uri.scheme != "file" || !uri.rawAuthority.isNullOrEmpty() || uri.rawQuery != null || uri.rawFragment != null || uri.path.isNullOrEmpty()) {
      fail("lineart_local_file_required")
    }
    val result = try { File(uri).canonicalFile } catch (_: Exception) { fail("lineart_local_file_required") }
    if (!listOf(files, cache, noBackup).any { inside(result, it) }) fail("lineart_app_file_required")
    return result
  }

  fun directory(raw: String, error: String = "lineart_output_directory_required"): File {
    val result = local(raw)
    if (!result.isDirectory || !result.canWrite()) fail(error)
    if (backupAllowed && !inside(result, noBackup) && !inside(result, cache)) fail("lineart_private_directory_requires_backup_exclusion")
    // Validate canonical ownership, but keep the caller's Android path alias in
    // result URIs so JS draft ownership checks see the same directory prefix.
    return File(URI(raw)).absoluteFile
  }

  fun discard(raw: String) {
    val result = local(raw)
    if (!Regex("lineart-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.png").matches(result.name)) {
      fail("lineart_invalid_result")
    }
    if (result.exists() && (!result.isFile || !result.delete())) fail("lineart_invalid_result")
  }

  private fun inside(target: File, root: File) = target.path.startsWith(root.canonicalPath + File.separator)
}

internal class LineArtJobs {
  private var id: String? = null
  private var cancelled = false
  private var destroyed = false

  @Synchronized fun begin(): String {
    if (destroyed) fail("lineart_cancelled")
    if (id != null) fail("lineart_busy")
    return UUID.randomUUID().toString().also { id = it; cancelled = false }
  }
  @Synchronized fun cancel(job: String) { if (id == job) cancelled = true }
  @Synchronized fun check(job: String) {
    if (destroyed || cancelled || id != job) fail("lineart_cancelled")
  }
  @Synchronized fun finish(job: String): Boolean {
    val success = !destroyed && !cancelled && id == job
    if (id == job) id = null
    return success
  }
  @Synchronized fun destroy() { destroyed = true; cancelled = true }
}
