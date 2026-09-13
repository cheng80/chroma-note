package com.cheng80.chromaanalysis

import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.net.URL
import java.nio.file.Files
import java.security.MessageDigest
import java.security.cert.Certificate
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

private val model = ByteArray(700_003) { (it * 31).toByte() }
private val vision = ByteArray(180_017) { (it * 7).toByte() }
private fun hash(data: ByteArray) = MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }
private val hashes = mapOf("model" to hash(model), "vision" to hash(vision))
private val files = mapOf("model" to model, "vision" to vision)
private const val ETAG = "\"fixture-one\""
private fun manifest() = JSONObject().put("delivery", JSONObject().put("catalog_url", "https://models.invalid/catalog"))
  .put("files", JSONObject().also { entries ->
    files.forEach { (role, bytes) -> entries.put(role, JSONObject().put("key", role).put("name", "$role.gguf")
      .put("bytes", bytes.size).put("sha256", hashes.getValue(role))) }
  }).toString().toByteArray()
private fun catalog(modelUrl: String = "https://models.invalid/model") = JSONObject().put("version", 1)
  .put("files", JSONObject().put("model", JSONObject().put("url", modelUrl))
    .put("vision", JSONObject().put("url", "https://models.invalid/vision"))).toString().toByteArray()

private data class Request(val url: URL, val range: String?, val ifRange: String?)
private data class Reply(val code: Int, val bytes: ByteArray = byteArrayOf(), val headers: Map<String, String> = emptyMap(),
  val stream: InputStream? = null)

private class FixtureConnection(url: URL, private val handler: (Request) -> Reply) : HttpsURLConnection(url) {
  private var opened: Reply? = null
  private val reply by lazy { handler(Request(url, getRequestProperty("Range"), getRequestProperty("If-Range"))).also { opened = it } }
  override fun getResponseCode() = reply.code
  override fun getHeaderField(name: String): String? = reply.headers[name]
  override fun getInputStream() = reply.stream ?: ByteArrayInputStream(reply.bytes)
  override fun disconnect() { opened?.stream?.close() }
  override fun connect() {}
  override fun usingProxy() = false
  override fun getCipherSuite() = "fixture"
  override fun getLocalCertificates(): Array<Certificate>? = null
  override fun getServerCertificates(): Array<Certificate> = emptyArray()
}

private class Fixture : AutoCloseable {
  val root: File = Files.createTempDirectory("model-assets-fixture").toFile()
  val requests = CopyOnWriteArrayList<Request>()
  val states = CopyOnWriteArrayList<Map<String, Any?>>()
  val stores = mutableListOf<ModelAssetStore>()
  var manifestBytes = manifest()
  var bundled = catalog()
  var space = Long.MAX_VALUE
  var handler: (Request) -> Reply = { normal(it) }
  fun normal(request: Request): Reply {
    if (request.url.path == "/catalog") return Reply(200, catalog())
    val data = if (request.url.path == "/vision") vision else model
    val offset = request.range?.removePrefix("bytes=")?.removeSuffix("-")?.toInt() ?: 0
    if (offset >= data.size) return Reply(416, headers = mapOf("Content-Range" to "bytes */${data.size}"))
    val headers = mutableMapOf("ETag" to ETAG, "Content-Length" to (data.size - offset).toString())
    if (offset > 0) headers["Content-Range"] = "bytes $offset-${data.size - 1}/${data.size}"
    return Reply(if (offset > 0) 206 else 200, data.copyOfRange(offset, data.size), headers)
  }
  fun store(storageRoot: File = root, available: (File) -> Long = { space },
    observer: (Map<String, Any?>) -> Unit = {}): ModelAssetStore = ModelAssetStore(storageRoot, {
    ByteArrayInputStream(if (it == "model-manifest.json") manifestBytes else bundled)
  }, { value ->
    val downloaded = value["downloadedBytes"] as Long
    check(downloaded in 0..(value["totalBytes"] as Long))
    check(value.keys == setOf("status", "downloadedBytes", "totalBytes", "currentFile", "errorCode"))
    check(value.values.none { it is String && (it.contains("https:") || it.contains(root.path)) })
    states.add(value)
    observer(value)
  }, { url -> FixtureConnection(url) { request -> requests.add(request); handler(request) } }, available).also { stores.add(it) }
  fun target(role: String) = File(root, "${hashes.getValue(role)}/$role.gguf")
  fun part(role: String) = File(root, "${hashes.getValue(role)}/incoming.part")
  fun seed(role: String, bytes: ByteArray, url: String = "https://models.invalid/$role", etag: String? = ETAG) {
    part(role).parentFile!!.mkdirs()
    part(role).writeBytes(bytes)
    File(part(role).parentFile, "resume.json").writeText(JSONObject().put("url", url)
      .put("etag", etag ?: JSONObject.NULL).put("bytes", files.getValue(role).size)
      .put("sha256", hashes.getValue(role)).toString())
  }
  fun installed(role: String) { target(role).parentFile!!.mkdirs(); target(role).writeBytes(files.getValue(role)) }
  fun waitFor(status: String): Map<String, Any?> {
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8)
    while (System.nanoTime() < deadline) {
      states.lastOrNull()?.let { if (it["status"] == status) return it }
      Thread.sleep(5)
    }
    error("Expected $status: ${states.map { it["status"] to it["errorCode"] }}")
  }
  fun download(store: ModelAssetStore = store(), status: String = "ready"): Map<String, Any?> {
    states.clear(); store.download(); return waitFor(status)
  }
  fun stop(store: ModelAssetStore) {
    store.close()
    val field = ModelAssetStore::class.java.getDeclaredField("worker").apply { isAccessible = true }
    check((field.get(store) as ExecutorService).awaitTermination(5, TimeUnit.SECONDS))
  }
  override fun close() { stores.forEach { stop(it) }; root.deleteRecursively() }
}

private fun assertError(code: String, action: () -> Unit) {
  try { action(); error("Expected $code") } catch (error: IOException) { check(error.message == code) { error.message.orEmpty() } }
}

private class HeldStream(private val prefix: ByteArray) : InputStream() {
  val waiting = CountDownLatch(1)
  private val released = CountDownLatch(1)
  private var sent = false
  override fun read() = error("Use bounded bulk reads")
  override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
    if (!sent) { sent = true; prefix.copyInto(buffer, offset); return prefix.size }
    waiting.countDown()
    check(released.await(5, TimeUnit.SECONDS))
    throw IOException("fixture connection closed")
  }
  override fun close() { released.countDown() }
}

fun main(args: Array<String>) {
  var passed = 0
  fun test(name: String, body: () -> Unit) { body(); passed++; println("PASS $name") }
  test("bundled production manifest stays unchanged, supports >2GB sizes, and stays offline") {
    Fixture().use { f ->
      val module = File(args.single())
      f.manifestBytes = File(module, "model-manifest.json").readBytes()
      f.bundled = File(module, "model-download.json").readBytes()
      val state = f.store().getStatus()
      check(state["status"] == "required" && state["totalBytes"] == 2_950_511_680L)
      check(f.requests.isEmpty())
    }
  }
  test("offline SHA-first reuse and same-size corruption detection") {
    Fixture().use { f ->
      f.installed("model"); f.installed("vision")
      val store = f.store()
      check(store.getStatus()["status"] == "ready")
      check(store.verifiedPaths() == (f.target("model").canonicalFile to f.target("vision").canonicalFile))
      f.target("model").writeBytes(model.copyOf().also { it[17]++ })
      check(store.getStatus()["status"] == "required")
      assertError("analysis_model_corrupt") { store.verifiedPaths() }
      check(f.requests.isEmpty())
    }
  }
  test("128 MiB sparse file hashes within a 96 MiB heap") {
    Fixture().use { f ->
      val bytes = 128L * 1024 * 1024
      val digest = MessageDigest.getInstance("SHA-256")
      val chunk = ByteArray(256 * 1024)
      repeat((bytes / chunk.size).toInt()) { digest.update(chunk) }
      val sha = digest.digest().joinToString("") { "%02x".format(it) }
      val large = File(f.root, "$sha/model.gguf")
      large.parentFile!!.mkdirs()
      RandomAccessFile(large, "rw").use { it.setLength(bytes) }
      val manifest = JSONObject(f.manifestBytes.toString(Charsets.UTF_8))
      manifest.getJSONObject("files").getJSONObject("model").put("bytes", bytes).put("sha256", sha)
      f.manifestBytes = manifest.toString().toByteArray()
      f.installed("vision")
      check(f.store().getStatus()["status"] == "ready")
      check(f.requests.isEmpty())
    }
  }
  test("download, incremental states, exact installed bytes and restart offline") {
    Fixture().use { f ->
      val store = f.store(); f.download(store)
      check(f.states.any { (it["downloadedBytes"] as Long) in 1 until model.size.toLong() })
      check(f.target("model").readBytes().contentEquals(model) && f.target("vision").readBytes().contentEquals(vision))
      f.stop(store); f.requests.clear()
      check(f.store().getStatus()["status"] == "ready" && f.requests.isEmpty())
    }
  }
  test("catalog fallback only for 404; 500 and transport errors surface") {
    Fixture().use { f ->
      f.handler = { if (it.url.path == "/catalog") Reply(404) else f.normal(it) }
      f.download()
    }
    for (code in listOf(403, 500)) Fixture().use { f ->
      f.handler = { Reply(code) }
      val store = f.store()
      check(f.download(store, "failed")["errorCode"] == "model_catalog_unavailable")
      check(store.getStatus()["errorCode"] == "model_catalog_unavailable")
      check(f.requests.size == 1)
    }
    Fixture().use { f ->
      f.handler = { throw IOException("fixture offline") }
      check(f.download(status = "failed")["errorCode"] == "model_download_failed")
      check(f.requests.size == 1)
    }
  }
  test("strict catalog types, keys, HTTPS and bounded catalog body") {
    val bad = listOf(
      "{}".toByteArray(), catalog().toString(Charsets.UTF_8).replace("\"version\":1", "\"version\":\"1\"").toByteArray(),
      catalog().toString(Charsets.UTF_8).replace("\"version\":1", "\"extra\":0,\"version\":1").toByteArray(),
      ByteArray(65_537) { 32 },
      catalog().toString(Charsets.UTF_8).replace("\"version\":1", "\"version\":1,\"version\":1").toByteArray(),
      catalog().toString(Charsets.UTF_8).replace("\"version\"", "version").toByteArray(),
      catalog().toString(Charsets.UTF_8).replace("\"version\"", "'version'").toByteArray(),
      ("/* comment */" + catalog().toString(Charsets.UTF_8)).toByteArray(),
      (catalog().toString(Charsets.UTF_8) + " trailing").toByteArray(),
    )
    bad.forEach { bytes -> Fixture().use { f ->
      f.handler = { Reply(200, bytes) }
      check(f.download(status = "failed")["errorCode"] == "model_catalog_invalid")
      check(f.requests.size == 1)
    } }
    for (url in listOf("http://models.invalid/model", "https://user:pass@models.invalid/model", "https://models.invalid/model#x")) {
      Fixture().use { f ->
        f.handler = { Reply(200, catalog(url)) }
        check(f.download(status = "failed")["errorCode"] == "model_insecure_url")
      }
    }
  }
  test("truncated transfer persists a prefix and new instance resumes Range with If-Range") {
    Fixture().use { f ->
      f.handler = { if (it.url.path == "/model") f.normal(it).copy(bytes = model.copyOf(123_456)) else f.normal(it) }
      val old = f.store()
      check(f.download(old, "failed")["errorCode"] == "model_download_failed")
      f.stop(old); check(f.part("model").length() == 123_456L)
      f.handler = { f.normal(it) }; f.requests.clear()
      val next = f.store()
      check(next.getStatus()["status"] == "paused" && f.requests.isEmpty())
      f.download(next)
      check(f.requests.first { it.url.path == "/model" }.let { it.range == "bytes=123456-" && it.ifRange == ETAG })
    }
  }
  test("pause cancels a held read, stale events suppressed, rapid download does not overlap writers") {
    Fixture().use { f ->
      val held = HeldStream(model.copyOf(12_345))
      f.handler = { if (it.url.path == "/model" && it.range == null) f.normal(it).copy(stream = held) else f.normal(it) }
      val store = f.store(); store.download(); check(held.waiting.await(5, TimeUnit.SECONDS))
      check(store.getStatus()["status"] == "downloading")
      assertError("analysis_model_missing") { store.verifiedPaths() }
      check(store.pause()["status"] == "paused")
      val count = f.states.size
      Thread.sleep(40)
      check(f.states.size == count)
      f.download(store)
      check(f.requests.first { it.range != null }.range == "bytes=12345-")
    }
  }
  test("pause during verification prevents installation and a full part remains resumable") {
    Fixture().use { f ->
      lateinit var store: ModelAssetStore
      var pauseOnce = true
      store = f.store { if (it["status"] == "verifying" && pauseOnce) { pauseOnce = false; store.pause() } }
      f.download(store, "paused")
      check(!f.target("model").exists() && f.part("model").length() == model.size.toLong())
      f.download(store)
      check(f.requests.any { it.range == "bytes=${model.size}-" })
    }
  }
  test("URL and ETag changes safely restart only the unfinished file") {
    for (urlChanged in listOf(false, true)) Fixture().use { f ->
      f.installed("vision"); f.seed("model", model.copyOf(1234))
      f.handler = {
        if (it.url.path == "/catalog" && urlChanged) Reply(200, catalog("https://models.invalid/new-model"))
        else f.normal(it).let { reply -> if (it.url.path != "/catalog") reply.copy(headers = reply.headers + ("ETag" to "\"two\"")) else reply }
      }
      f.download()
      val requests = f.requests.filter { it.url.path != "/catalog" }
      check(requests.none { it.url.path == "/vision" })
      if (urlChanged) check(requests.single().range == null)
      else check(requests.map { it.range } == listOf("bytes=1234-", null))
      check(f.target("vision").readBytes().contentEquals(vision))
    }
  }
  test("200 ignored Range truncates safely; malformed 206 is rejected") {
    Fixture().use { f ->
      f.seed("model", model.copyOf(321))
      f.handler = { f.normal(it.copy(range = null)) }
      f.download(); check(f.target("model").readBytes().contentEquals(model))
    }
    for (range in listOf("bytes 0-700002/700003", "bytes 321-700002/700004", "bytes 321-699999/700003", "garbage")) {
      Fixture().use { f ->
        f.seed("model", model.copyOf(321))
        f.handler = { if (it.url.path == "/model") f.normal(it).let { r -> r.copy(headers = r.headers + ("Content-Range" to range)) } else f.normal(it) }
        check(f.download(status = "failed")["errorCode"] == "model_integrity_failed")
        check(!f.target("model").exists())
      }
    }
  }
  test("weak ETag changes restart safely without sending weak If-Range") {
    Fixture().use { f ->
      f.seed("model", model.copyOf(1000), etag = "W/\"one\"")
      f.handler = { f.normal(it).let { r -> if (it.url.path == "/model") r.copy(headers = r.headers + ("ETag" to "W/\"two\"")) else r } }
      f.download()
      check(f.requests.filter { it.url.path == "/model" }.map { it.range } == listOf("bytes=1000-", null))
      check(f.requests.all { it.ifRange == null })
    }
  }
  test("416 only installs an exact full SHA-verified part; other cases restart safely") {
    for (count in listOf(123, model.size)) Fixture().use { f ->
      f.seed("model", model.copyOf(count))
      f.handler = { if (it.url.path == "/model" && it.range != null) Reply(416,
        headers = mapOf("Content-Range" to "bytes */${model.size}")) else f.normal(it) }
      f.download()
      check(f.requests.count { it.url.path == "/model" } == if (count == model.size) 1 else 2)
    }
    Fixture().use { f ->
      f.seed("model", model.copyOf().also { it[9]++ })
      f.download(); check(f.requests.count { it.url.path == "/model" } == 2)
      check(f.target("model").readBytes().contentEquals(model))
    }
  }
  test("bad SHA and excess body never install; completed vision is preserved") {
    for (extra in listOf(false, true)) Fixture().use { f ->
      f.installed("vision")
      f.handler = { if (it.url.path == "/model") f.normal(it).copy(bytes =
        if (extra) model + byteArrayOf(1) else model.copyOf().also { it[99]++ }) else f.normal(it) }
      check(f.download(status = "failed")["errorCode"] == "model_integrity_failed")
      check(!f.target("model").exists() && f.target("vision").readBytes().contentEquals(vision))
    }
  }
  test("space, insecure redirects, malformed manifest and closed lifecycle") {
    Fixture().use { f ->
      f.space = 1
      check(f.download(status = "failed")["errorCode"] == "model_storage_full")
      check(f.requests.none { it.url.path == "/model" })
    }
    Fixture().use { f ->
      f.handler = { Reply(302, headers = mapOf("Location" to "http://models.invalid/catalog")) }
      check(f.download(status = "failed")["errorCode"] == "model_insecure_url")
      check(f.requests.size == 1)
    }
    Fixture().use { f ->
      f.manifestBytes = manifest().toString(Charsets.UTF_8).replace("model.gguf", "../model.gguf").toByteArray()
      check(f.store().getStatus()["errorCode"] == "model_manifest_invalid")
      check(f.requests.isEmpty())
    }
    Fixture().use { f ->
      val store = f.store(); f.stop(store); store.download()
      check(f.requests.isEmpty()); assertError("analysis_cancelled") { store.verifiedPaths() }
    }
  }
  test("internal path verification stays silent on cold load, reuse and corruption") {
    for (warm in listOf(false, true)) Fixture().use { f ->
      f.installed("model"); f.installed("vision")
      val store = f.store()
      if (warm) check(store.getStatus()["status"] == "ready")
      f.states.clear()
      repeat(2) {
        check(store.verifiedPaths() == (f.target("model").canonicalFile to f.target("vision").canonicalFile))
        check(f.states.isEmpty()) { "Internal verification must not unmount the app through setup events" }
      }
      f.target("model").writeBytes(model.copyOf().also { it[17]++ })
      assertError("analysis_model_corrupt") { store.verifiedPaths() }
      check(f.states.isEmpty())
      check(store.getStatus()["status"] == "required")
      check(f.states.last()["status"] == "required" && f.requests.isEmpty())
    }
  }
  test("replacement store waits for the closing writer on the same canonical root") {
    Fixture().use { f ->
      val beforeWrite = CountDownLatch(1)
      val releaseWrite = CountDownLatch(1)
      val nextRequest = CountDownLatch(1)
      var spaceChecks = 0
      val old = f.store(available = {
        if (++spaceChecks == 2) {
          beforeWrite.countDown()
          check(releaseWrite.await(8, TimeUnit.SECONDS))
        }
        Long.MAX_VALUE
      })
      old.download()
      try {
        check(beforeWrite.await(5, TimeUnit.SECONDS))
        old.close() // Do not await termination: the old writer is still inside file IO.
        f.requests.clear(); f.states.clear()
        f.handler = { nextRequest.countDown(); f.normal(it) }
        val next = f.store(storageRoot = File(f.root, "."))
        next.download()
        // A different root must remain usable while this root's old writer drains.
        Fixture().use { other -> other.download() }
        check(!nextRequest.await(250, TimeUnit.MILLISECONDS)) { "Replacement accessed files before the old writer drained" }
        releaseWrite.countDown()
        f.stop(old)
        f.waitFor("ready")
        check(nextRequest.count == 0L)
        check(next.verifiedPaths() == (f.target("model").canonicalFile to f.target("vision").canonicalFile))
        check(f.target("model").readBytes().contentEquals(model) && f.target("vision").readBytes().contentEquals(vision))
      } finally { releaseWrite.countDown() }
    }
  }
  println("$passed ModelAssetStore JVM scenarios passed (96 MiB heap; no Gradle or NAS transfer).")
}
