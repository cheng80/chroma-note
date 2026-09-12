import Foundation
import CryptoKit

struct ModelAssetState: Equatable {
  var status = "checking"
  var downloadedBytes: Int64 = 0
  var totalBytes: Int64 = 0
  var currentFile: String?
  var errorCode: String?

  var dictionary: [String: Any] {
    ["status": status, "downloadedBytes": downloadedBytes, "totalBytes": totalBytes,
     "currentFile": currentFile as Any? ?? NSNull(), "errorCode": errorCode as Any? ?? NSNull()]
  }
}

struct ModelAssetManifest: Decodable {
  struct Delivery: Decodable { let catalog_url: String }
  struct File: Decodable {
    let key: String
    let name: String
    let bytes: Int64
    let sha256: String
  }
  let delivery: Delivery
  let files: [String: File]
  static let roles = ["model", "vision"]

  init(data: Data) throws {
    do {
      self = try JSONDecoder().decode(Self.self, from: data)
      _ = try Self.secureURL(delivery.catalog_url)
      guard Set(files.keys) == Set(Self.roles), Set(files.values.map(\.key)).count == 2 else {
        throw ModelAssetStore.failure("model_manifest_invalid")
      }
      for file in files.values {
        guard !file.key.isEmpty, file.key.count <= 128,
          file.name.range(of: "^[A-Za-z0-9_-][A-Za-z0-9._-]*\\.gguf$", options: .regularExpression) != nil,
          !file.name.contains(".."), file.bytes > 0, file.bytes <= 16 * 1024 * 1024 * 1024,
          file.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
          throw ModelAssetStore.failure("model_manifest_invalid")
        }
      }
    } catch { throw ModelAssetStore.failure("model_manifest_invalid") }
  }

  static func secureURL(_ raw: String) throws -> URL {
    guard let url = URL(string: raw), url.scheme?.lowercased() == "https",
      let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
      url.fragment == nil else { throw ModelAssetStore.failure("model_insecure_url") }
    return url
  }

  func catalog(_ data: Data) throws -> [String: URL] {
    struct Catalog: Decodable {
      struct Entry: Decodable { let url: String }
      let version: Int
      let files: [String: Entry]
    }
    guard data.count <= 64 * 1024,
      let catalog = try? JSONDecoder().decode(Catalog.self, from: data), catalog.version == 1 else {
      throw ModelAssetStore.failure("model_catalog_invalid")
    }
    return try Dictionary(uniqueKeysWithValues: Self.roles.map { role in
      guard let entry = catalog.files[files[role]!.key] else { throw ModelAssetStore.failure("model_catalog_invalid") }
      return (role, try Self.secureURL(entry.url))
    })
  }
}

// One queue owns the installation and URLSession delegates. Inference never loads a bundle GGUF.
final class ModelAssetStore: NSObject, URLSessionDownloadDelegate, URLSessionDataDelegate, @unchecked Sendable {
  typealias Completion = (ModelAssetState) -> Void
  private let queue = DispatchQueue(label: "chroma.model-assets", qos: .utility)
  private let cancelLock = NSLock()
  private var stopRequested = false
  private let root: URL
  private let manifestURL: URL?
  private let configuration: URLSessionConfiguration
  private var manifest: ModelAssetManifest?
  private var state = ModelAssetState()
  private var observer: Completion?
  private var verified: [String: Stamp] = [:]
  private var activeTask: URLSessionTask?
  private var pausingTaskID: Int?
  private var pauseCompletions: [Completion] = []
  private var catalogData = Data()
  private var bundledSources: [String: URL] = [:]
  private var sources: [String: URL] = [:]
  private var taskError: String?
  private var resumed = false
  private var lastProgress = Date.distantPast
  private var lastEmitted: ModelAssetState?
  private lazy var session: URLSession = {
    let delegates = OperationQueue()
    delegates.maxConcurrentOperationCount = 1
    delegates.underlyingQueue = queue
    return URLSession(configuration: configuration, delegate: self, delegateQueue: delegates)
  }()

  private struct Stamp: Equatable {
    let bytes: Int64
    let modified: Date
    let created: Date
  }
  private struct Resume: Codable {
    let url: String
    let downloadedBytes: Int64
    let data: Data
  }

  // Concrete paths/configuration also let standalone tests exercise the real file operations.
  init(root: URL? = nil, manifestURL: URL? = nil, configuration: URLSessionConfiguration = .ephemeral) {
    self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("chroma-models", isDirectory: true)
    self.manifestURL = manifestURL
    self.configuration = configuration
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 24 * 60 * 60
    super.init()
  }

  func observe(_ observer: Completion?) { queue.async { self.observer = observer } }

  func getStatus(_ completion: @escaping Completion) {
    queue.async {
      guard self.activeTask == nil else { completion(self.state); return }
      do {
        try self.loadManifest()
        try self.inspectInstalled()
      } catch { self.fail(error) }
      completion(self.state)
    }
  }

  // Resolves when started; completion/verification is delivered by progress events or getStatus.
  func download(_ completion: @escaping Completion) {
    queue.async {
      guard self.activeTask == nil, self.pausingTaskID == nil else { completion(self.state); return }
      self.setStopped(false)
      do {
        try self.loadManifest()
        try self.inspectInstalled()
        if self.state.status != "ready" {
          self.sources = [:]
          self.state.status = "downloading"
          self.state.errorCode = nil
          self.state.currentFile = nil
          self.emit()
          // The catalog contains addresses only. Sizes, hashes and local names remain bundled.
          self.catalogData = Data()
          self.taskError = nil
          let task = self.session.dataTask(with: try ModelAssetManifest.secureURL(self.manifest!.delivery.catalog_url))
          self.activeTask = task
          task.resume()
        }
      } catch { self.fail(error) }
      completion(self.state)
    }
  }

  func pause(_ completion: @escaping Completion) {
    setStopped(true) // Hashing can stop even while the serial queue is occupied.
    queue.async {
      if self.pausingTaskID != nil { self.pauseCompletions.append(completion); return }
      if let task = self.activeTask as? URLSessionDownloadTask {
        self.pausingTaskID = task.taskIdentifier
        self.pauseCompletions.append(completion)
        task.cancel { data in
          self.queue.async {
            do { try self.saveResume(data) }
            catch { self.fail(error) }
            self.activeTask = nil
            self.pausingTaskID = nil
            if self.state.status != "failed" { self.state.status = "paused"; self.state.errorCode = nil }
            self.emit()
            let completions = self.pauseCompletions
            self.pauseCompletions = []
            completions.forEach { $0(self.state) }
          }
        }
      } else {
        self.activeTask?.cancel()
        self.activeTask = nil
        if ["downloading", "verifying", "checking"].contains(self.state.status) {
          self.state.status = "paused"
          self.state.errorCode = nil
          self.emit()
        }
        completion(self.state)
      }
    }
  }

  func close() {
    pause { _ in self.observer = nil; self.session.invalidateAndCancel() }
  }

  func modelPaths(isCancelled: () -> Bool) throws -> (model: URL, vision: URL) {
    try queue.sync {
      guard activeTask == nil else { throw Self.failure("analysis_model_missing") }
      try loadManifest()
      try inspectInstalled(isCancelled: isCancelled, emitChanges: false)
      guard state.status == "ready" else {
        let corrupt = ModelAssetManifest.roles.contains {
          verified[$0] == nil && FileManager.default.fileExists(atPath: fileURL($0).path)
        }
        throw Self.failure(corrupt ? "analysis_model_corrupt" : "analysis_model_missing")
      }
      return (fileURL("model"), fileURL("vision"))
    }
  }

  private func loadManifest() throws {
    if manifest != nil { return }
    let url = manifestURL ?? [Bundle(for: ModelAssetStore.self), Bundle.main].compactMap { host -> URL? in
      guard let bundleURL = host.url(forResource: "ChromaAnalysis", withExtension: "bundle") else { return nil }
      return Bundle(url: bundleURL)?.url(forResource: "model-manifest", withExtension: "json")
    }.first
    guard let url else { throw Self.failure("model_manifest_invalid") }
    guard let data = try? Data(contentsOf: url) else { throw Self.failure("model_manifest_invalid") }
    let parsed = try ModelAssetManifest(data: data)
    let catalogURL = url.deletingLastPathComponent().appendingPathComponent("model-download.json")
    guard let catalogData = try? Data(contentsOf: catalogURL),
      let defaults = try? parsed.catalog(catalogData) else { throw Self.failure("model_manifest_invalid") }
    try makePrivateDirectory(root)
    bundledSources = defaults
    manifest = parsed
    state.totalBytes = parsed.files.values.reduce(0) { $0 + $1.bytes }
  }

  private func makePrivateDirectory(_ url: URL) throws {
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    var directory = url
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
    #endif
  }

  private func directory(_ role: String) -> URL {
    root.appendingPathComponent(manifest!.files[role]!.sha256, isDirectory: true)
  }

  private func fileURL(_ role: String) -> URL { directory(role).appendingPathComponent(manifest!.files[role]!.name) }
  private func stagingURL(_ role: String) -> URL { directory(role).appendingPathComponent("incoming.download") }
  private func resumeURL(_ role: String) -> URL { directory(role).appendingPathComponent("resume.json") }

  private func stamp(_ url: URL) throws -> Stamp {
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey, .contentModificationDateKey, .creationDateKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true,
      let bytes = values.fileSize, let modified = values.contentModificationDate, let created = values.creationDate else {
      throw Self.failure("model_integrity_failed")
    }
    return Stamp(bytes: Int64(bytes), modified: modified, created: created)
  }

  static func verify(_ url: URL, file: ModelAssetManifest.File, isCancelled: () -> Bool = { false }) throws {
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true, values.fileSize.map(Int64.init) == file.bytes else {
      throw failure("model_integrity_failed")
    }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var digest = SHA256()
    while true {
      guard !isCancelled() else { throw failure("analysis_cancelled") }
      let hasData = try autoreleasepool {
        guard let data = try handle.read(upToCount: 4 * 1024 * 1024), !data.isEmpty else { return false }
        digest.update(data: data)
        return true
      }
      if !hasData { break }
    }
    guard digest.finalize().map({ String(format: "%02x", $0) }).joined() == file.sha256 else {
      throw failure("model_integrity_failed")
    }
  }

  private func inspectInstalled(isCancelled: () -> Bool = { false }, emitChanges: Bool = true) throws {
    let previous = state
    var bytes: Int64 = 0
    for role in ModelAssetManifest.roles {
      let file = manifest!.files[role]!
      guard let current = try? stamp(fileURL(role)), current.bytes == file.bytes else {
        verified.removeValue(forKey: role)
        continue
      }
      if verified[role] != current {
        state.status = "checking"
        state.currentFile = role
        if emitChanges { emit() }
        do {
          try Self.verify(fileURL(role), file: file, isCancelled: isCancelled)
          verified[role] = current
        } catch let error as NSError where error.localizedDescription == "analysis_cancelled" { throw error }
        catch { verified.removeValue(forKey: role); continue }
      }
      bytes += file.bytes
    }
    let hasPartial = ModelAssetManifest.roles.contains { role in
      verified[role] == nil && (FileManager.default.fileExists(atPath: resumeURL(role).path)
        || FileManager.default.fileExists(atPath: stagingURL(role).path))
    }
    state.downloadedBytes = bytes
    state.currentFile = nil
    state.errorCode = nil
    state.status = verified.count == 2 ? "ready" : (hasPartial || previous.status == "paused" ? "paused" : "required")
    if state.status != "ready" {
      if previous.status == "failed" { state.status = "failed"; state.errorCode = previous.errorCode }
      if let role = ModelAssetManifest.roles.first(where: { verified[$0] == nil }), let resume = readResume(role) {
        state.currentFile = role
        state.downloadedBytes += resume.downloadedBytes
      }
    }
    if emitChanges { emit() }
  }

  private var installedBytes: Int64 {
    verified.keys.reduce(0) { $0 + manifest!.files[$1]!.bytes }
  }

  private func nextFile() throws {
    guard !stopped else { state.status = "paused"; emit(); return }
    guard let role = ModelAssetManifest.roles.first(where: { verified[$0] == nil }) else {
      state.status = "ready"
      state.currentFile = nil
      state.downloadedBytes = state.totalBytes
      state.errorCode = nil
      emit()
      return
    }
    state.currentFile = role
    state.downloadedBytes = installedBytes
    try makePrivateDirectory(directory(role))
    if FileManager.default.fileExists(atPath: stagingURL(role).path) {
      do {
        try publishStaging(role)
        try nextFile()
        return
      } catch let error as NSError where error.localizedDescription == "model_integrity_failed" {
        try FileManager.default.removeItem(at: stagingURL(role))
      }
    }
    guard let url = sources[role] else { throw Self.failure("model_catalog_invalid") }
    let resume = readResume(role).flatMap { $0.url == url.absoluteString ? $0 : nil }
    let remaining = ModelAssetManifest.roles.filter { verified[$0] == nil }.reduce(Int64(0)) { total, remainingRole in
      let retained = readResume(remainingRole).flatMap { $0.url == sources[remainingRole]?.absoluteString ? $0.downloadedBytes : nil } ?? 0
      return total + max(0, manifest!.files[remainingRole]!.bytes - retained)
    }
    try requireSpace(remaining)
    state.status = "downloading"
    taskError = nil
    let task: URLSessionDownloadTask
    if let resume {
      task = session.downloadTask(withResumeData: resume.data)
      resumed = true
      state.downloadedBytes += resume.downloadedBytes
    } else {
      try? FileManager.default.removeItem(at: resumeURL(role))
      task = session.downloadTask(with: url)
      resumed = false
    }
    activeTask = task
    emit()
    task.resume()
  }

  private func requireSpace(_ bytes: Int64) throws {
    let values = try root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey])
    let available = values.volumeAvailableCapacityForImportantUsage ?? values.volumeAvailableCapacity.map(Int64.init)
    // Keep a small filesystem reserve. URLSession's temporary file is moved on the same volume.
    if let available, available < bytes + 64 * 1024 * 1024 { throw Self.failure("model_storage_full") }
  }

  private func readResume(_ role: String) -> Resume? {
    guard let size = try? resumeURL(role).resourceValues(forKeys: [.fileSizeKey]).fileSize,
      size <= 2 * 1024 * 1024, let data = try? Data(contentsOf: resumeURL(role)),
      let resume = try? JSONDecoder().decode(Resume.self, from: data),
      (try? ModelAssetManifest.secureURL(resume.url)) != nil,
      resume.downloadedBytes >= 0, resume.downloadedBytes <= manifest!.files[role]!.bytes else { return nil }
    return resume
  }

  private func saveResume(_ data: Data?) throws {
    guard let role = state.currentFile, let url = sources[role] else { return }
    guard let data, !data.isEmpty, data.count <= 1024 * 1024 else {
      try? FileManager.default.removeItem(at: resumeURL(role))
      state.downloadedBytes = installedBytes
      return
    }
    let record = Resume(url: url.absoluteString,
      downloadedBytes: max(0, min(manifest!.files[role]!.bytes, state.downloadedBytes - installedBytes)), data: data)
    try JSONEncoder().encode(record).write(to: resumeURL(role), options: .atomic)
  }

  private func publishStaging(_ role: String) throws {
    state.status = "verifying"
    state.downloadedBytes = installedBytes + manifest!.files[role]!.bytes
    emit()
    let incoming = stagingURL(role)
    try Self.verify(incoming, file: manifest!.files[role]!, isCancelled: { self.stopped })
    guard !stopped else { throw Self.failure("analysis_cancelled") }
    let destination = fileURL(role)
    // POSIX rename atomically publishes on this volume and preserves an existing file on failure.
    guard rename(incoming.path, destination.path) == 0 else {
      throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
    }
    verified[role] = try stamp(destination)
    try? FileManager.default.removeItem(at: resumeURL(role))
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    guard activeTask?.taskIdentifier == task.taskIdentifier else { completionHandler(nil); return }
    guard let url = request.url, (try? ModelAssetManifest.secureURL(url.absoluteString)) != nil else {
      taskError = "model_insecure_url"
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard activeTask?.taskIdentifier == dataTask.taskIdentifier else { completionHandler(.cancel); return }
    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
      taskError = taskError ?? ((response as? HTTPURLResponse)?.statusCode == 404
        ? "model_catalog_missing" : "model_catalog_unavailable")
      completionHandler(.cancel)
      return
    }
    guard response.expectedContentLength <= 64 * 1024 else {
      taskError = "model_catalog_invalid"
      completionHandler(.cancel)
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard activeTask?.taskIdentifier == dataTask.taskIdentifier else { return }
    guard catalogData.count + data.count <= 64 * 1024 else {
      taskError = "model_catalog_invalid"
      dataTask.cancel()
      return
    }
    catalogData.append(data)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    guard activeTask?.taskIdentifier == downloadTask.taskIdentifier, let role = state.currentFile else { return }
    let expected = manifest!.files[role]!.bytes
    guard totalBytesWritten <= expected, totalBytesExpectedToWrite <= expected else {
      taskError = "model_integrity_failed"
      downloadTask.cancel()
      return
    }
    state.downloadedBytes = installedBytes + min(expected, max(0, totalBytesWritten))
    if Date().timeIntervalSince(lastProgress) >= 0.15 { lastProgress = Date(); emit() }
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard activeTask?.taskIdentifier == downloadTask.taskIdentifier, let role = state.currentFile else { return }
    do {
      guard taskError == nil, let response = downloadTask.response as? HTTPURLResponse,
        [200, 206].contains(response.statusCode), let responseURL = response.url,
        (try? ModelAssetManifest.secureURL(responseURL.absoluteString)) != nil else {
        throw Self.failure(taskError ?? "model_download_failed")
      }
      let incoming = stagingURL(role)
      if FileManager.default.fileExists(atPath: incoming.path) { try FileManager.default.removeItem(at: incoming) }
      try FileManager.default.moveItem(at: location, to: incoming)
      try publishStaging(role)
    } catch {
      taskError = Self.errorCode(error)
      if taskError == "model_integrity_failed" {
        try? FileManager.default.removeItem(at: stagingURL(role))
        try? FileManager.default.removeItem(at: resumeURL(role))
      }
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard activeTask?.taskIdentifier == task.taskIdentifier, pausingTaskID != task.taskIdentifier else { return }
    activeTask = nil
    // An unpublished address override must not block the bundled initial addresses.
    if task is URLSessionDataTask, taskError == "model_catalog_missing" {
      taskError = nil
      catalogData = Data()
      sources = bundledSources
      do { try nextFile() } catch { fail(error) }
      return
    }
    if let taskError {
      fail(Self.failure(taskError))
      return
    }
    if let error {
      do { try saveResume((error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data) }
      catch { fail(error); return }
      // OS temporary resume files can disappear. Retry this file from zero once, preserving other files.
      if resumed, (error as NSError).domain == NSURLErrorDomain,
        [NSURLErrorCannotOpenFile, NSURLErrorCannotWriteToFile, NSURLErrorFileDoesNotExist, NSURLErrorCannotDecodeRawData].contains((error as NSError).code),
        Self.errorCode(error) != "model_storage_full" {
        if let role = state.currentFile { try? FileManager.default.removeItem(at: resumeURL(role)) }
        resumed = false
        do { try nextFile() } catch { fail(error) }
      } else { fail(error) }
      return
    }
    do {
      if task is URLSessionDataTask { sources = try manifest!.catalog(catalogData); catalogData = Data() }
      try nextFile()
    } catch { fail(error) }
  }

  private func emit() {
    guard state != lastEmitted else { return }
    lastEmitted = state
    observer?(state)
  }
  private var stopped: Bool { cancelLock.lock(); defer { cancelLock.unlock() }; return stopRequested }
  private func setStopped(_ value: Bool) { cancelLock.lock(); stopRequested = value; cancelLock.unlock() }

  private func fail(_ error: Error) {
    let code = Self.errorCode(error)
    state.status = code == "analysis_cancelled" ? "paused" : "failed"
    state.errorCode = code == "analysis_cancelled" ? nil : code
    emit()
  }

  static func errorCode(_ error: Error) -> String {
    let error = error as NSError
    if error.domain == "ChromaModelAssets" { return error.localizedDescription }
    if (error.domain == NSCocoaErrorDomain && error.code == NSFileWriteOutOfSpaceError)
      || (error.domain == NSPOSIXErrorDomain && error.code == Int(ENOSPC)) { return "model_storage_full" }
    if let underlying = error.userInfo[NSUnderlyingErrorKey] as? Error,
      errorCode(underlying) == "model_storage_full" { return "model_storage_full" }
    return error.domain == NSURLErrorDomain ? "model_download_failed" : "model_storage_failed"
  }

  static func failure(_ code: String) -> NSError {
    NSError(domain: "ChromaModelAssets", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }
}
