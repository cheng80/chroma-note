package com.cheng80.chromaanalysis

import android.content.Context
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.URI
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.locks.ReentrantLock
import javax.net.ssl.HttpsURLConnection
import kotlin.concurrent.withLock

/** One instance per Expo module. Blocking validation belongs on the parent's worker thread. */
class ModelAssetStore internal constructor(
  root: File,
  private val asset: (String) -> InputStream,
  private val emit: (Map<String, Any?>) -> Unit,
  private val connect: (URL) -> HttpsURLConnection = { it.openConnection() as HttpsURLConnection },
  private val availableBytes: (File) -> Long = { it.usableSpace },
) {
  constructor(context: Context, emit: (Map<String, Any?>) -> Unit) : this(
    File(context.noBackupFilesDir, "chroma-models"),
    { context.assets.open("chroma-analysis/$it") }, emit,
  )

  private val root = root.canonicalFile
  private val io = synchronized(rootLocks) { rootLocks.getOrPut(this.root) { ReentrantLock() } }
  private val gate = Any()
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "chroma-model-assets").apply { isDaemon = true }
  }
  private var generation = 0L
  private var active = false
  private var closed = false
  private var connection: HttpsURLConnection? = null
  private var state = State()
  private var lastEmitted: Map<String, Any?>? = null
  // Only io owns manifest, installed and filesystem operations; gate owns lifecycle and events.
  private var manifest: Manifest? = null
  private val installed = mutableSetOf<String>()

  private data class State(
    val status: String = "checking", val downloadedBytes: Long = 0, val totalBytes: Long = 0,
    val currentFile: String? = null, val errorCode: String? = null,
  ) {
    fun map(): Map<String, Any?> = mapOf(
      "status" to status, "downloadedBytes" to downloadedBytes, "totalBytes" to totalBytes,
      "currentFile" to currentFile, "errorCode" to errorCode,
    )
  }

  /** Hashes local bytes first, without ever consulting a remote catalog. */
  fun getStatus(): Map<String, Any?> {
    synchronized(gate) { if (active || closed) return state.map() }
    return io.withLock {
      val token = synchronized(gate) {
        if (active || closed) return state.map()
        generation
      }
      try { loadManifest(token); inspect(token) } catch (error: Exception) { fail(token, error) }
      synchronized(gate) { state.map() }
    }
  }

  /** Returns immediately; inspection, catalog fetch, transfer and verification run in order. */
  fun download(): Map<String, Any?> = synchronized(gate) {
    if (closed || active) return state.map()
    val token = ++generation
    active = true
    update(token) { it.copy(status = "checking", errorCode = null, currentFile = null) }
    worker.execute {
      io.withLock {
        try {
          checkCurrent(token)
          loadManifest(token)
          inspect(token)
          if (installed.size != ROLES.size) {
            update(token) { it.copy(status = "downloading", errorCode = null, currentFile = null) }
            val sources = fetchCatalog(token)
            // Discard only partials whose identity changed; completed files stay in place.
            for (role in ROLES.filterNot { it in installed }) {
              checkCurrent(token)
              if (resume(role)?.url != sources.getValue(role).toExternalForm()) resetPartial(role)
            }
            requireSpace(remainingBytes())
            for (role in ROLES.filterNot { it in installed }) transfer(role, sources.getValue(role), token)
            update(token) { it.copy(status = "ready", downloadedBytes = it.totalBytes, currentFile = null, errorCode = null) }
          }
        } catch (error: Exception) { fail(token, error) }
        finally { synchronized(gate) { if (generation == token) active = false } }
      }
    }
    state.map()
  }

  fun pause(): Map<String, Any?> {
    val old: HttpsURLConnection?
    val result: Map<String, Any?>
    synchronized(gate) {
      ++generation
      active = false
      old = connection
      connection = null
      if (state.status in setOf("checking", "downloading", "verifying")) {
        state = state.copy(status = "paused", errorCode = null)
        emitLocked()
      }
      result = state.map()
    }
    // Do not wait for the IO lock: a hash or socket read may still be running.
    old?.disconnect()
    return result
  }

  fun verifiedPaths(): Pair<File, File> {
    synchronized(gate) {
      if (closed) throw Failure("analysis_cancelled")
      if (active) throw Failure("analysis_model_missing")
    }
    return io.withLock {
      val token = synchronized(gate) {
        if (closed) throw Failure("analysis_cancelled")
        if (active) throw Failure("analysis_model_missing")
        generation
      }
      loadManifest(token, emitChanges = false)
      inspect(token, emitChanges = false)
      synchronized(gate) {
        checkCurrent(token)
        if (installed.size != ROLES.size) {
          val corrupt = ROLES.any { it !in installed && destination(it).exists() }
          throw Failure(if (corrupt) "analysis_model_corrupt" else "analysis_model_missing")
        }
        destination("model") to destination("vision")
      }
    }
  }

  fun close() {
    synchronized(gate) { closed = true }
    pause()
    worker.shutdown()
  }

  private fun checkCurrent(token: Long) = synchronized(gate) {
    if (closed || generation != token) throw Failure("analysis_cancelled")
  }

  private fun update(token: Long, emitChanges: Boolean = true, change: (State) -> State) = synchronized(gate) {
    checkCurrent(token)
    val next = change(state)
    state = next.copy(downloadedBytes = next.downloadedBytes.coerceIn(0, next.totalBytes))
    if (next.status == "ready") active = false
    if (emitChanges) emitLocked()
  }

  private fun emitLocked() {
    if (closed) return
    val snapshot = state.map()
    if (snapshot == lastEmitted) return
    lastEmitted = snapshot
    // Serial delivery under gate prevents a pre-pause event arriving after pause's event.
    // The Expo listener should only enqueue its event and must not block on file validation.
    try { emit(snapshot) } catch (_: Exception) { /* Listener teardown cannot damage a download. */ }
  }

  private fun fail(token: Long, error: Exception) = synchronized(gate) {
    if (closed || generation != token) return@synchronized
    val code = errorCode(error)
    active = false
    state = state.copy(status = if (code == "analysis_cancelled") "paused" else "failed",
      errorCode = code.takeUnless { it == "analysis_cancelled" })
    emitLocked()
  }

  private fun loadManifest(token: Long, emitChanges: Boolean = true) {
    checkCurrent(token)
    if (manifest != null) {
      update(token, emitChanges) { it.copy(totalBytes = manifest!!.files.values.sumOf { file -> file.bytes }) }
      return
    }
    val parsed = try {
      Manifest(parseObject(asset("model-manifest.json").use { bounded(it) }))
    } catch (_: Exception) { throw Failure("model_manifest_invalid") }
    ensureDirectory(root)
    manifest = parsed
    update(token, emitChanges) { it.copy(totalBytes = parsed.files.values.sumOf { file -> file.bytes }) }
  }

  private fun inspect(token: Long, emitChanges: Boolean = true) {
    val previous = synchronized(gate) { state }
    installed.clear()
    for (role in ROLES) {
      checkCurrent(token)
      val file = destination(role)
      if (!regular(file) || file.length() != spec(role).bytes) continue
      update(token, emitChanges) { it.copy(status = "checking", currentFile = role, errorCode = null) }
      try { verify(file, spec(role), token); installed.add(role) }
      catch (error: Failure) { if (error.message != "model_integrity_failed") throw error }
    }
    val partialRole = ROLES.firstOrNull { it !in installed && resume(it) != null }
    val bytes = installedBytes() + (partialRole?.let { partial(it).length() } ?: 0)
    update(token, emitChanges) {
      val status = when {
        installed.size == 2 -> "ready"
        previous.status == "failed" -> "failed"
        partialRole != null || previous.status == "paused" -> "paused"
        else -> "required"
      }
      it.copy(status = status, downloadedBytes = bytes, currentFile = partialRole,
        errorCode = previous.errorCode.takeIf { status == "failed" })
    }
  }

  private fun fetchCatalog(token: Long): Map<String, URL> {
    val result = request(manifest!!.catalog, token) { response ->
      when (network { response.responseCode }) {
        200 -> manifest!!.catalog(network { response.inputStream.use { bounded(it) } })
        404 -> null
        else -> throw Failure("model_catalog_unavailable")
      }
    }
    // Only HTTP 404 permits fallback, and even then bundled addresses get the same validation.
    if (result != null) return result
    val bundled = try { asset("model-download.json").use { bounded(it) } }
      catch (error: Failure) { throw error }
      catch (_: IOException) { throw Failure("model_manifest_invalid") }
    return manifest!!.catalog(bundled)
  }

  private fun transfer(role: String, source: URL, token: Long) {
    val file = spec(role)
    ensureDirectory(directory(role))
    var restarted = false
    while (true) {
      checkCurrent(token)
      val saved = resume(role)
      val offset = if (saved?.url == source.toExternalForm()) partial(role).length() else 0L
      update(token) { it.copy(status = "downloading", currentFile = role,
        downloadedBytes = installedBytes() + offset, errorCode = null) }
      val retry = request(source, token, offset, saved?.etag) { response ->
        val status = network { response.responseCode }
        val encoding = response.getHeaderField("Content-Encoding")
        if (encoding != null && !encoding.equals("identity", ignoreCase = true)) throw Failure("model_integrity_failed")
        val rawETag = response.getHeaderField("ETag")
        val etag = entityTag(rawETag)
        if (rawETag != null && etag == null) throw Failure("model_download_failed")
        if (offset > 0 && status == 206 && saved?.etag != etag) {
          resetPartial(role)
          return@request true
        }
        if (status == 416) {
          if (offset == file.bytes && response.getHeaderField("Content-Range") == "bytes */${file.bytes}") {
            try { install(role, token); return@request false }
            catch (error: Failure) { if (error.message != "model_integrity_failed") throw error }
          }
          resetPartial(role)
          return@request true
        }
        if (status != 200 && status != 206) throw Failure("model_download_failed")
        val start = if (status == 200) 0L else offset
        val length = contentLength(response)
        if (status == 206) {
          val range = RANGE.matchEntire(response.getHeaderField("Content-Range") ?: "")
            ?: throw Failure("model_integrity_failed")
          val (first, last, total) = range.destructured
          if (first.toLongOrNull() != start || last.toLongOrNull() != file.bytes - 1 || total.toLongOrNull() != file.bytes
            || (length != null && length != file.bytes - start)) throw Failure("model_integrity_failed")
        } else if (length != null && length != file.bytes) throw Failure("model_integrity_failed")
        if (start == 0L) resetPartial(role)
        requireSpace(remainingBytes())
        // Persist identity before bytes. A crash leaves either a valid prefix or an empty retry.
        saveResume(role, source, etag)
        var count = start
        var lastProgress = 0L
        FileOutputStream(partial(role), start > 0).use { output ->
          try {
            network { response.inputStream }.use { input ->
              val buffer = ByteArray(BUFFER_SIZE)
              while (true) {
                checkCurrent(token)
                val read = network { input.read(buffer) }
                if (read < 0) break
                if (read == 0) continue
                checkCurrent(token)
                if (read.toLong() > file.bytes - count) throw Failure("model_integrity_failed")
                output.write(buffer, 0, read)
                count += read
                val now = System.nanoTime()
                if (now - lastProgress >= 150_000_000L || count == file.bytes) {
                  lastProgress = now
                  update(token) { it.copy(downloadedBytes = installedBytes() + count) }
                }
              }
            }
          } finally { output.fd.sync() }
        }
        checkCurrent(token)
        if (count != file.bytes) throw Failure("model_download_failed") // Retain a truncated prefix for retry.
        install(role, token)
        false
      }
      if (!retry) return
      if (restarted) throw Failure("model_download_failed")
      restarted = true
      requireSpace(remainingBytes())
    }
  }

  private fun install(role: String, token: Long) {
    update(token) { it.copy(status = "verifying", currentFile = role,
      downloadedBytes = installedBytes() + spec(role).bytes) }
    try { verify(partial(role), spec(role), token) }
    catch (error: Failure) {
      if (error.message == "model_integrity_failed") resetPartial(role)
      throw error
    }
    synchronized(gate) {
      checkCurrent(token)
      // Same-directory rename is atomic on Android; no copy or second full-size allocation.
      if (!partial(role).renameTo(destination(role))) throw Failure("model_storage_failed")
      installed.add(role)
      remove(metadata(role))
    }
  }

  private fun verify(path: File, file: AssetFile, token: Long) {
    if (!regular(path) || path.length() != file.bytes) throw Failure("model_integrity_failed")
    val modified = path.lastModified()
    val digest = MessageDigest.getInstance("SHA-256")
    var count = 0L
    path.inputStream().use { input ->
      val buffer = ByteArray(BUFFER_SIZE)
      while (true) {
        checkCurrent(token)
        val read = input.read(buffer)
        if (read < 0) break
        count += read
        if (count > file.bytes) throw Failure("model_integrity_failed")
        digest.update(buffer, 0, read)
      }
    }
    checkCurrent(token)
    val actual = digest.digest().joinToString("") { "%02x".format(it) }
    if (count != file.bytes || path.length() != count || path.lastModified() != modified || !regular(path)
      || actual != file.sha256) throw Failure("model_integrity_failed")
  }

  private fun <T> request(url: URL, token: Long, offset: Long = 0, etag: String? = null,
    body: (HttpsURLConnection) -> T): T {
    var target = secureURL(url.toExternalForm())
    repeat(6) { hop ->
      checkCurrent(token)
      val response = network { connect(target) }
      try {
        response.instanceFollowRedirects = false
        response.connectTimeout = 30_000
        response.readTimeout = 30_000
        response.useCaches = false
        response.setRequestProperty("Accept-Encoding", "identity")
        if (offset > 0) {
          response.setRequestProperty("Range", "bytes=$offset-")
          if (etag != null && !etag.startsWith("W/")) response.setRequestProperty("If-Range", etag)
        }
        synchronized(gate) { checkCurrent(token); connection = response }
        val status = network { response.responseCode }
        checkCurrent(token)
        secureURL(response.url.toExternalForm())
        if (status in setOf(301, 302, 303, 307, 308)) {
          if (hop == 5) throw Failure("model_download_failed")
          val location = response.getHeaderField("Location") ?: throw Failure("model_download_failed")
          target = secureURL(network { URL(target, location).toExternalForm() })
        } else return body(response)
      } finally {
        synchronized(gate) { if (connection === response) connection = null }
        response.disconnect()
      }
    }
    throw Failure("model_download_failed")
  }

  private data class Resume(val url: String, val etag: String?)

  private fun resume(role: String): Resume? {
    val part = partial(role)
    val meta = metadata(role)
    if (!regular(part) || part.length() > spec(role).bytes || !regular(meta) || meta.length() > JSON_LIMIT) return null
    return try {
      val value = parseObject(meta.inputStream().use { bounded(it) })
      keys(value, setOf("url", "etag", "sha256", "bytes"))
      val url = secureURL(string(value, "url")).toExternalForm()
      if (string(value, "sha256") != spec(role).sha256 || integer(value, "bytes") != spec(role).bytes) return null
      val rawETag = if (value.isNull("etag")) null else string(value, "etag")
      if (rawETag != null && entityTag(rawETag) == null) return null
      Resume(url, rawETag)
    } catch (_: Exception) { null } // Incomplete metadata is never permission to append.
  }

  private fun saveResume(role: String, url: URL, etag: String?) {
    val value = JSONObject().put("url", url.toExternalForm()).put("etag", etag ?: JSONObject.NULL)
      .put("sha256", spec(role).sha256).put("bytes", spec(role).bytes)
    val temporary = File(directory(role), "resume.json.tmp")
    safePath(temporary)
    FileOutputStream(temporary).use { it.write(value.toString().toByteArray(Charsets.UTF_8)); it.fd.sync() }
    if (!temporary.renameTo(metadata(role))) throw Failure("model_storage_failed")
  }

  private fun remainingBytes(): Long = ROLES.filterNot { it in installed }.sumOf {
    spec(it).bytes - if (resume(it) != null) partial(it).length() else 0L
  }
  private fun requireSpace(bytes: Long) {
    if (availableBytes(root) < bytes + 64L * 1024 * 1024) throw Failure("model_storage_full")
  }
  private fun resetPartial(role: String) { remove(partial(role)); remove(metadata(role)) }
  private fun remove(file: File) {
    safePath(file)
    if (file.exists() && !file.delete()) throw Failure("model_storage_failed")
  }
  private fun ensureDirectory(file: File) {
    safePath(file)
    if (!file.isDirectory && !file.mkdirs()) throw Failure("model_storage_failed")
  }
  private fun safePath(file: File) {
    if (file.canonicalFile != file.absoluteFile) throw Failure("model_storage_failed")
  }
  private fun regular(file: File): Boolean = file.isFile && file.canonicalFile == file.absoluteFile
  private fun spec(role: String) = manifest!!.files.getValue(role)
  private fun directory(role: String) = File(root, spec(role).sha256)
  private fun destination(role: String) = File(directory(role), spec(role).name)
  private fun partial(role: String) = File(directory(role), "incoming.part")
  private fun metadata(role: String) = File(directory(role), "resume.json")
  private fun installedBytes() = installed.sumOf { spec(it).bytes }

  private data class AssetFile(val key: String, val name: String, val bytes: Long, val sha256: String)
  private class Manifest(value: JSONObject) {
    val catalog: URL
    val files: Map<String, AssetFile>
    init {
      val delivery = value.getJSONObject("delivery")
      keys(delivery, setOf("catalog_url"))
      catalog = secureURL(string(delivery, "catalog_url"))
      val entries = value.getJSONObject("files")
      keys(entries, ROLES.toSet())
      files = ROLES.associateWith { role ->
        val entry = entries.getJSONObject(role)
        keys(entry, setOf("key", "name", "bytes", "sha256"))
        val key = string(entry, "key")
        val name = string(entry, "name")
        val bytes = integer(entry, "bytes")
        val hash = string(entry, "sha256")
        require(key.isNotEmpty() && key.length <= 128 && key.none { it.isISOControl() })
        require(name.matches(Regex("[A-Za-z0-9_-][A-Za-z0-9._-]*\\.gguf")) && !name.contains(".."))
        require(bytes in 1..(16L * 1024 * 1024 * 1024) && hash.matches(Regex("[a-f0-9]{64}")))
        AssetFile(key, name, bytes, hash)
      }
      require(files.values.map { it.key }.toSet().size == 2)
      require(files.values.map { it.sha256 to it.name }.toSet().size == 2)
    }
    fun catalog(data: ByteArray): Map<String, URL> {
      try {
        val value = parseObject(data)
        keys(value, setOf("version", "files"))
        require(integer(value, "version") == 1L)
        val entries = value.getJSONObject("files")
        keys(entries, files.values.map { it.key }.toSet())
        return ROLES.associateWith {
          val entry = entries.getJSONObject(files.getValue(it).key)
          keys(entry, setOf("url"))
          secureURL(string(entry, "url"))
        }
      } catch (error: Failure) { throw error }
      catch (_: Exception) { throw Failure("model_catalog_invalid") }
    }
  }

  private class Failure(code: String) : IOException(code)

  private companion object {
    // Retain the lock across close(): the old worker may still be draining file IO.
    val rootLocks = mutableMapOf<File, ReentrantLock>()
    val ROLES = listOf("model", "vision")
    val RANGE = Regex("bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)/(0|[1-9][0-9]*)")
    const val JSON_LIMIT = 64 * 1024
    const val BUFFER_SIZE = 256 * 1024

    fun secureURL(raw: String): URL {
      try {
        val uri = URI(raw)
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrEmpty()
          && uri.rawUserInfo == null && uri.rawFragment == null && (uri.port == -1 || uri.port in 1..65535))
        return uri.toURL()
      } catch (_: Exception) { throw Failure("model_insecure_url") }
    }
    fun entityTag(value: String?): String? = value?.takeIf {
      it.length <= 1024 && it.matches(Regex("(W/)?\"[\\x21\\x23-\\x7e\\x80-\\xff]*\""))
    }
    fun contentLength(response: HttpsURLConnection): Long? {
      val raw = response.getHeaderField("Content-Length") ?: return null
      return raw.toLongOrNull()?.takeIf { it >= 0 } ?: throw Failure("model_integrity_failed")
    }
    fun bounded(input: InputStream): ByteArray {
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(4096)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) return output.toByteArray()
        if (output.size() + count > JSON_LIMIT) throw Failure("model_catalog_invalid")
        output.write(buffer, 0, count)
      }
    }
    fun parseObject(bytes: ByteArray): JSONObject {
      require(bytes.size <= JSON_LIMIT)
      val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
      // Android's JSONObject accepts duplicate keys, comments and unquoted strings. Validate
      // this object-only schema explicitly so remote catalogs have the same strict JVM behavior.
      class Reader {
        var index = 0
        fun whitespace() { while (index < text.length && text[index] in " \t\r\n") index++ }
        fun take(char: Char) { whitespace(); require(index < text.length && text[index++] == char) }
        fun string(): String {
          whitespace()
          val start = index
          take('"')
          while (index < text.length) {
            val char = text[index++]
            require(char >= ' ')
            if (char == '"') return JSONTokener(text.substring(start, index)).nextValue() as String
            if (char == '\\') {
              require(index < text.length)
              val escape = text[index++]
              require(escape in "\"\\/bfnrtu")
              if (escape == 'u') repeat(4) { require(index < text.length && text[index++].digitToIntOrNull(16) != null) }
            }
          }
          throw IllegalArgumentException()
        }
        fun value(depth: Int): Any {
          require(depth <= 8)
          whitespace()
          require(index < text.length)
          if (text[index] == '"') return string()
          if (text[index] == '{') {
            take('{')
            val result = JSONObject()
            whitespace()
            if (index < text.length && text[index] == '}') { index++; return result }
            while (true) {
              val key = string()
              require(!result.has(key))
              take(':'); result.put(key, value(depth + 1)); whitespace()
              require(index < text.length)
              if (text[index] == '}') { index++; return result }
              take(',')
            }
          }
          val start = index
          while (index < text.length && text[index] !in ",} \t\r\n") index++
          val token = text.substring(start, index)
          return when (token) {
            "null" -> JSONObject.NULL
            "true" -> true
            "false" -> false
            else -> {
              require(token.matches(Regex("-?(0|[1-9][0-9]*)")))
              token.toLong()
            }
          }
        }
      }
      val reader = Reader()
      val result = reader.value(0) as? JSONObject ?: throw IllegalArgumentException()
      reader.whitespace()
      require(reader.index == text.length)
      return result
    }
    fun keys(value: JSONObject, expected: Set<String>) { require(value.keys().asSequence().toSet() == expected) }
    fun string(value: JSONObject, key: String): String = value.get(key) as? String ?: throw IllegalArgumentException()
    fun integer(value: JSONObject, key: String): Long {
      val number = value.get(key)
      require(number is Int || number is Long)
      return (number as Number).toLong()
    }
    fun <T> network(block: () -> T): T = try { block() }
      catch (error: Failure) { throw error }
      catch (_: IOException) { throw Failure("model_download_failed") }
    fun errorCode(error: Exception): String {
      if (error is Failure) return error.message!!
      var cause: Throwable? = error
      while (cause != null) {
        if (cause.message?.let { it.contains("ENOSPC") || it.contains("No space left on device", ignoreCase = true) } == true) {
          return "model_storage_full"
        }
        cause = cause.cause.takeUnless { it === cause }
      }
      return "model_storage_failed"
    }
  }
}
