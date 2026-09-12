import Foundation
import Darwin
import CryptoKit

// The Foundation transport is exercised with tiny HTTPS fixtures, never model weights or NAS writes.
private final class FixtureProtocol: URLProtocol, @unchecked Sendable {
  enum Reply { case data(Data, Int), partial(Data, Int), failure(NSError), hold }
  static let lock = NSLock()
  static var replies: [String: Reply] = [:]
  static var requests: [String] = []
  static var latestTask: URLSessionTask?
  static var ranges: [String] = []

  override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "models.invalid" }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let url = request.url!
    Self.lock.lock()
    Self.requests.append(url.path)
    Self.latestTask = task
    if let range = request.value(forHTTPHeaderField: "Range") { Self.ranges.append(range) }
    let reply = Self.replies[url.path] ?? .data(Data(), 404)
    Self.lock.unlock()
    switch reply {
    case let .data(data, status):
      var payload = data
      var responseStatus = status
      var headers = ["Content-Length": String(data.count), "Accept-Ranges": "bytes", "ETag": "\"fixture-v1\""]
      if status == 200, let range = request.value(forHTTPHeaderField: "Range"),
        let offset = Int(range.replacingOccurrences(of: "bytes=", with: "").replacingOccurrences(of: "-", with: "")),
        offset > 0, offset < data.count {
        payload = data.suffix(from: offset)
        responseStatus = 206
        headers["Content-Length"] = String(payload.count)
        headers["Content-Range"] = "bytes \(offset)-\(data.count - 1)/\(data.count)"
      }
      let response = HTTPURLResponse(url: url, statusCode: responseStatus, httpVersion: "HTTP/1.1", headerFields: headers)!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: payload)
      client?.urlProtocolDidFinishLoading(self)
    case let .partial(data, total):
      let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
        headerFields: ["Content-Length": String(total), "Accept-Ranges": "bytes", "ETag": "\"fixture-v1\""])!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
    case let .failure(error): client?.urlProtocol(self, didFailWithError: error)
    case .hold: break
    }
  }
  override func stopLoading() {}
  static func set(_ replies: [String: Reply]) { lock.lock(); self.replies = replies; requests = []; ranges = []; latestTask = nil; lock.unlock() }
  static var requested: [String] { lock.lock(); defer { lock.unlock() }; return requests }
  static var currentTask: URLSessionTask? { lock.lock(); defer { lock.unlock() }; return latestTask }
  static var requestedRanges: [String] { lock.lock(); defer { lock.unlock() }; return ranges }
}

private final class States: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [ModelAssetState] = []
  func add(_ state: ModelAssetState) { lock.lock(); values.append(state); lock.unlock() }
  var all: [ModelAssetState] { lock.lock(); defer { lock.unlock() }; return values }
}

@main
struct ModelAssetStoreTests {
  static func check(_ value: Bool) { precondition(value) }
  static func assertError(_ code: String, _ operation: () throws -> Void) {
    do { try operation(); fatalError("Expected \(code)") }
    catch { precondition((error as NSError).localizedDescription == code, "Unexpected error: \(error)") }
  }

  static func result(_ operation: (@escaping ModelAssetStore.Completion) -> Void) -> ModelAssetState {
    let signal = DispatchSemaphore(value: 0)
    var state: ModelAssetState?
    operation { state = $0; signal.signal() }
    precondition(signal.wait(timeout: .now() + 10) == .success, "Callback timed out")
    return state!
  }

  private static func wait(_ states: States, status: String) -> ModelAssetState {
    let deadline = Date().addingTimeInterval(10)
    while Date() < deadline {
      if let last = states.all.last, last.status == status { return last }
      Thread.sleep(forTimeInterval: 0.01)
    }
    fatalError("Expected \(status), observed \(states.all.map { ($0.status, $0.errorCode) })")
  }

  private static func waitUntil(_ check: () -> Bool) {
    let deadline = Date().addingTimeInterval(10)
    while !check(), Date() < deadline { Thread.sleep(forTimeInterval: 0.01) }
    precondition(check(), "Condition timed out")
  }

  static func main() throws {
    let sandbox = FileManager.default.temporaryDirectory.appendingPathComponent("chroma-assets-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: sandbox, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: sandbox) }
    let large = sandbox.appendingPathComponent("large.gguf")
    FileManager.default.createFile(atPath: large.path, contents: nil)
    let writer = try FileHandle(forWritingTo: large)
    try writer.truncate(atOffset: 256 * 1024 * 1024)
    try writer.close()
    let largeFile = ModelAssetManifest.File(key: "large", name: "large.gguf", bytes: 256 * 1024 * 1024,
      sha256: "a6d72ac7690f53be6ae46ba88506bd97302a093f7108472bd9efc3cefda06484")
    try autoreleasepool {
      var before = rusage(), after = rusage()
      getrusage(RUSAGE_SELF, &before)
      try ModelAssetStore.verify(large, file: largeFile)
      getrusage(RUSAGE_SELF, &after)
      let growth = after.ru_maxrss - before.ru_maxrss
      print("256 MiB verification peak growth: \(growth / 1024 / 1024) MiB")
      fflush(stdout)
      precondition(growth < 64 * 1024 * 1024, "Hash verification retained file-sized temporary buffers")
    }
    let model = Data("a small model fixture".utf8)
    let vision = Data("a separate vision fixture".utf8)
    func entry(_ role: String, _ data: Data) -> [String: Any] {
      ["key": "qwen.\(role)", "name": "\(role).gguf", "bytes": data.count,
       "sha256": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()]
    }
    let manifestObject: [String: Any] = ["delivery": ["catalog_url": "https://models.invalid/catalog.json"],
      "files": ["model": entry("model", model), "vision": entry("vision", vision)]]
    let manifestData = try JSONSerialization.data(withJSONObject: manifestObject)
    let manifest = try ModelAssetManifest(data: manifestData)
    let manifestURL = sandbox.appendingPathComponent("manifest.json")
    try manifestData.write(to: manifestURL)
    let catalog = Data(#"{"version":1,"files":{"qwen.model":{"url":"https://models.invalid/moved/body"},"qwen.vision":{"url":"https://models.invalid/new/projector"}}}"#.utf8)
    let defaultCatalog = Data(#"{"version":1,"files":{"qwen.model":{"url":"https://models.invalid/default/body"},"qwen.vision":{"url":"https://models.invalid/default/projector"}}}"#.utf8)
    try defaultCatalog.write(to: manifestURL.deletingLastPathComponent().appendingPathComponent("model-download.json"))
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [FixtureProtocol.self]
    func newStore(_ name: String) -> (ModelAssetStore, URL, States) {
      let root = sandbox.appendingPathComponent(name)
      let store = ModelAssetStore(root: root, manifestURL: manifestURL, configuration: configuration)
      let states = States()
      store.observe { states.add($0) }
      return (store, root, states)
    }
    func finalURL(_ root: URL, _ role: String) -> URL {
      root.appendingPathComponent(manifest.files[role]!.sha256).appendingPathComponent(manifest.files[role]!.name)
    }
    func installFixture(_ root: URL, _ role: String, _ data: Data) throws {
      let destination = finalURL(root, role)
      try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: destination)
    }

    // Addresses can move independently of the pinned local file identity.
    check(try manifest.catalog(catalog)["model"]!.path == "/moved/body")
    for bad in ["http://models.invalid/x", "file:///etc/passwd", "https://user:pass@models.invalid/x", "https://models.invalid/x#part"] {
      assertError("model_insecure_url") { _ = try ModelAssetManifest.secureURL(bad) }
    }
    assertError("model_catalog_invalid") { _ = try manifest.catalog(Data(#"{"version":2,"files":{}}"#.utf8)) }
    assertError("model_catalog_invalid") { _ = try manifest.catalog(Data(repeating: 0, count: 65 * 1024)) }
    let invalidManifest = String(data: manifestData, encoding: .utf8)!.replacingOccurrences(of: "model.gguf", with: "../model.gguf")
    assertError("model_manifest_invalid") { _ = try ModelAssetManifest(data: Data(invalidManifest.utf8)) }

    // A valid remote catalog takes precedence over the bundled initial addresses.
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200), "/moved/body": .data(model, 200), "/new/projector": .data(vision, 200)])
    fputs("TEST success\n", stderr)
    let (store, root, states) = newStore("success")
    precondition(result(store.getStatus).status == "required")
    precondition(result(store.download).status == "downloading")
    let ready = wait(states, status: "ready")
    precondition(FixtureProtocol.requested == ["/catalog.json", "/moved/body", "/new/projector"])
    precondition(ready.downloadedBytes == Int64(model.count + vision.count))
    precondition(states.all.contains { $0.status == "verifying" })
    check(try root.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
    let paths = try store.modelPaths(isCancelled: { false })
    precondition(paths.model == finalURL(root, "model") && paths.vision == finalURL(root, "vision"))
    check(try Data(contentsOf: paths.model) == model)
    check(try Data(contentsOf: paths.vision) == vision)
    let eventsBeforeInference = states.all.count
    _ = try store.modelPaths(isCancelled: { false })
    precondition(result(store.getStatus).status == "ready")
    precondition(states.all.count == eventsBeforeInference, "Ready cache and inference must not gate/remount the app")
    store.close()

    // Relaunch offline still verifies and reuses installed files without requesting the catalog.
    FixtureProtocol.set([:])
    let offline = ModelAssetStore(root: root, manifestURL: manifestURL, configuration: configuration)
    precondition(result(offline.getStatus).status == "ready")
    precondition(result(offline.download).status == "ready")
    precondition(FixtureProtocol.requested.isEmpty)
    offline.close()

    try Data(repeating: 120, count: model.count).write(to: paths.model)
    let corrupted = ModelAssetStore(root: root, manifestURL: manifestURL, configuration: configuration)
    precondition(result(corrupted.getStatus).status == "required")
    assertError("analysis_model_corrupt") { _ = try corrupted.modelPaths(isCancelled: { false }) }
    corrupted.close()
    try model.write(to: paths.model)

    // Same-size corruption and truncated data can never become ready; symlinks are rejected.
    let bad = sandbox.appendingPathComponent("bad.gguf")
    try Data(repeating: 120, count: model.count).write(to: bad)
    assertError("model_integrity_failed") { try ModelAssetStore.verify(bad, file: manifest.files["model"]!) }
    try Data([1]).write(to: bad)
    assertError("model_integrity_failed") { try ModelAssetStore.verify(bad, file: manifest.files["model"]!) }
    assertError("analysis_cancelled") { try ModelAssetStore.verify(paths.model, file: manifest.files["model"]!, isCancelled: { true }) }
    let link = sandbox.appendingPathComponent("link.gguf")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: paths.model)
    assertError("model_integrity_failed") { try ModelAssetStore.verify(link, file: manifest.files["model"]!) }

    // One correct file survives a bad second download; retry fetches only the missing file.
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200), "/new/projector": .data(Data(repeating: 120, count: vision.count), 200)])
    fputs("TEST repair\n", stderr)
    let (repair, repairRoot, repairStates) = newStore("repair")
    try installFixture(repairRoot, "model", model)
    _ = result(repair.download)
    precondition(wait(repairStates, status: "failed").errorCode == "model_integrity_failed")
    precondition(result(repair.getStatus).errorCode == "model_integrity_failed", "Status polling must preserve errors")
    precondition(!FixtureProtocol.requested.contains("/moved/body"))
    check(try Data(contentsOf: finalURL(repairRoot, "model")) == model)
    precondition(!FileManager.default.fileExists(atPath: finalURL(repairRoot, "vision").path))
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200), "/new/projector": .data(vision, 200)])
    _ = result(repair.download)
    _ = wait(repairStates, status: "ready")
    precondition(FixtureProtocol.requested == ["/catalog.json", "/new/projector"], "Explicit retry must fetch the remote catalog again")
    repair.close()

    // A verified staging file survives an atomic-rename failure; no valid bytes are deleted.
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200)])
    let (renameFailure, renameRoot, renameStates) = newStore("rename-failure")
    try installFixture(renameRoot, "vision", vision)
    let blockedDestination = finalURL(renameRoot, "model")
    try FileManager.default.createDirectory(at: blockedDestination, withIntermediateDirectories: true)
    let retainedStaging = blockedDestination.deletingLastPathComponent().appendingPathComponent("incoming.download")
    try model.write(to: retainedStaging)
    _ = result(renameFailure.download)
    precondition(wait(renameStates, status: "failed").errorCode == "model_storage_failed")
    check(try Data(contentsOf: retainedStaging) == model)
    check(try Data(contentsOf: finalURL(renameRoot, "vision")) == vision)
    renameFailure.close()

    // Only HTTP 404 selects the bundled initial addresses; the files are still downloaded and verified.
    FixtureProtocol.set(["/catalog.json": .data(Data("not installed".utf8), 404),
      "/default/body": .data(model, 200), "/default/projector": .data(vision, 200)])
    fputs("TEST catalog-404-defaults\n", stderr)
    let (defaults, defaultsRoot, defaultsStates) = newStore("catalog-404-defaults")
    precondition(result(defaults.getStatus).status == "required")
    _ = result(defaults.download)
    precondition(wait(defaultsStates, status: "ready").downloadedBytes == Int64(model.count + vision.count))
    precondition(FixtureProtocol.requested == ["/catalog.json", "/default/body", "/default/projector"])
    check(try Data(contentsOf: finalURL(defaultsRoot, "model")) == model)
    check(try Data(contentsOf: finalURL(defaultsRoot, "vision")) == vision)
    defaults.close()

    // A healthy default must not conceal malformed JSON, insecure addresses, other HTTP failures or offline errors.
    let insecureCatalog = Data(String(data: catalog, encoding: .utf8)!.replacingOccurrences(of: "https://", with: "http://").utf8)
    let rejectedCatalogs: [(String, FixtureProtocol.Reply, String)] = [
      ("malformed", .data(Data("{".utf8), 200), "model_catalog_invalid"),
      ("insecure", .data(insecureCatalog, 200), "model_insecure_url"),
      ("forbidden", .data(Data(), 403), "model_catalog_unavailable"),
      ("unavailable", .data(Data(), 503), "model_catalog_unavailable"),
      ("offline", .failure(NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)), "model_download_failed"),
    ]
    for (name, reply, errorCode) in rejectedCatalogs {
      FixtureProtocol.set(["/catalog.json": reply, "/default/body": .data(model, 200), "/default/projector": .data(vision, 200)])
      let (rejected, rejectedRoot, rejectedStates) = newStore("catalog-\(name)")
      _ = result(rejected.download)
      precondition(wait(rejectedStates, status: "failed").errorCode == errorCode, name)
      precondition(result(rejected.getStatus).errorCode == errorCode, "Status polling must preserve \(name)")
      precondition(FixtureProtocol.requested == ["/catalog.json"], "No fallback allowed for \(name)")
      precondition(!FileManager.default.fileExists(atPath: finalURL(rejectedRoot, "model").path))
      rejected.close()
    }

    // The bundled address catalog is required next to the manifest, even if the remote catalog is valid.
    let missingDefaultsDirectory = sandbox.appendingPathComponent("without-defaults")
    try FileManager.default.createDirectory(at: missingDefaultsDirectory, withIntermediateDirectories: true)
    let missingDefaultsManifest = missingDefaultsDirectory.appendingPathComponent("manifest.json")
    try manifestData.write(to: missingDefaultsManifest)
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200)])
    let missingDefaults = ModelAssetStore(root: missingDefaultsDirectory.appendingPathComponent("models"),
      manifestURL: missingDefaultsManifest, configuration: configuration)
    precondition(result(missingDefaults.getStatus).errorCode == "model_manifest_invalid")
    precondition(result(missingDefaults.download).errorCode == "model_manifest_invalid")
    precondition(FixtureProtocol.requested.isEmpty)
    missingDefaults.close()

    // URLProtocol redirects don't forward Apple's task delegate callbacks. Exercise those callbacks
    // with the actual held task, including a stale response arriving after pause/retry.
    FixtureProtocol.set(["/catalog.json": .hold])
    fputs("TEST redirect\n", stderr)
    let (redirect, _, redirectStates) = newStore("redirect")
    _ = result(redirect.download)
    waitUntil { FixtureProtocol.currentTask != nil }
    let staleTask = FixtureProtocol.currentTask!
    _ = result(redirect.pause)
    _ = result(redirect.download)
    waitUntil { FixtureProtocol.currentTask?.taskIdentifier != staleTask.taskIdentifier }
    let currentTask = FixtureProtocol.currentTask!
    let response = HTTPURLResponse(url: URL(string: "https://models.invalid/catalog.json")!, statusCode: 302,
      httpVersion: "HTTP/1.1", headerFields: [:])!
    let insecure = URLRequest(url: URL(string: "http://models.invalid/insecure")!)
    redirect.urlSession(.shared, task: staleTask, willPerformHTTPRedirection: response, newRequest: insecure) { precondition($0 == nil) }
    redirect.urlSession(.shared, dataTask: staleTask as! URLSessionDataTask, didReceive: response) { precondition($0 == .cancel) }
    precondition(result(redirect.getStatus).errorCode == nil)
    redirect.urlSession(.shared, task: currentTask, willPerformHTTPRedirection: response, newRequest: insecure) { precondition($0 == nil) }
    redirect.urlSession(.shared, task: currentTask, didCompleteWithError: nil)
    precondition(wait(redirectStates, status: "failed").errorCode == "model_insecure_url")
    precondition(FixtureProtocol.requested == ["/catalog.json", "/catalog.json"], "A downgrade must not trigger default addresses")
    redirect.close()

    // A stopped catalog request resolves paused and is safe to restart.
    FixtureProtocol.set(["/catalog.json": .hold])
    fputs("TEST paused\n", stderr)
    let (paused, pausedRoot, _) = newStore("paused")
    _ = result(paused.download)
    precondition(result(paused.pause).status == "paused")
    precondition(result(paused.getStatus).status == "paused")
    paused.close()
    let partial = finalURL(pausedRoot, "model").deletingLastPathComponent().appendingPathComponent("incoming.download")
    try FileManager.default.createDirectory(at: partial.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data([1, 2]).write(to: partial)
    let afterKill = ModelAssetStore(root: pausedRoot, manifestURL: manifestURL, configuration: configuration)
    precondition(result(afterKill.getStatus).status == "paused")
    assertError("analysis_model_missing") { _ = try afterKill.modelPaths(isCancelled: { false }) }
    afterKill.close()

    // A real Foundation download task produces opaque resume data, which remains on disk.
    let resumeModel = Data(repeating: 71, count: 2 * 1024 * 1024)
    var resumeManifestObject = manifestObject
    resumeManifestObject["files"] = ["model": entry("model", resumeModel), "vision": entry("vision", vision)]
    let resumeManifestData = try JSONSerialization.data(withJSONObject: resumeManifestObject)
    let resumeManifestURL = sandbox.appendingPathComponent("resume-manifest.json")
    try resumeManifestData.write(to: resumeManifestURL)
    let resumeManifest = try ModelAssetManifest(data: resumeManifestData)
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200), "/moved/body": .partial(resumeModel.prefix(1024 * 1024), resumeModel.count)])
    let partialRoot = sandbox.appendingPathComponent("resume")
    let partialStore = ModelAssetStore(root: partialRoot, manifestURL: resumeManifestURL, configuration: configuration)
    let partialStates = States()
    partialStore.observe { partialStates.add($0) }
    _ = result(partialStore.download)
    waitUntil { partialStates.all.contains { $0.downloadedBytes > 0 } }
    precondition(result(partialStore.pause).status == "paused")
    let resumeURL = partialRoot.appendingPathComponent(resumeManifest.files["model"]!.sha256).appendingPathComponent("resume.json")
    precondition(FileManager.default.fileExists(atPath: resumeURL.path), "Foundation resume data must persist")
    let resumeJSON = try JSONSerialization.jsonObject(with: Data(contentsOf: resumeURL)) as! [String: Any]
    precondition(resumeJSON["url"] as? String == "https://models.invalid/moved/body")
    precondition((resumeJSON["downloadedBytes"] as? Int) == 1024 * 1024)
    partialStore.close()
    FixtureProtocol.set(["/catalog.json": .data(catalog, 200), "/moved/body": .data(resumeModel, 200), "/new/projector": .data(vision, 200)])
    let resumedStore = ModelAssetStore(root: partialRoot, manifestURL: resumeManifestURL, configuration: configuration)
    let resumedStates = States()
    resumedStore.observe { resumedStates.add($0) }
    precondition(result(resumedStore.getStatus).status == "paused")
    precondition(result(resumedStore.getStatus).downloadedBytes == 1024 * 1024)
    _ = result(resumedStore.download)
    _ = wait(resumedStates, status: "ready")
    precondition(FixtureProtocol.requestedRanges == ["bytes=1048576-"], "Resume must issue a range request")
    precondition(!FileManager.default.fileExists(atPath: resumeURL.path))
    let resumedPaths = try resumedStore.modelPaths(isCancelled: { false })
    check(try Data(contentsOf: resumedPaths.model) == resumeModel)
    resumedStore.close()

    precondition(ModelAssetStore.errorCode(NSError(domain: NSPOSIXErrorDomain, code: Int(ENOSPC))) == "model_storage_full")
    precondition(ModelAssetStore.errorCode(NSError(domain: NSCocoaErrorDomain, code: NSFileWriteOutOfSpaceError)) == "model_storage_full")
    print("ModelAssetStore: remote priority, 404-only defaults, catalog rejection, pinned hashes, atomic install, offline reuse, repair, pause, redirects, no gate regression PASS")
  }
}
