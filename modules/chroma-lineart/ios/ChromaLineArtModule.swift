import ExpoModulesCore
import Foundation

private struct NativeLineArtOptions: Record {
  @Field var maxEdge: Int = 1024
  @Field var lineGain: Double = 1.8
}

public final class ChromaLineArtModule: Module {
  private let work = DispatchQueue(label: "chroma.lineart", qos: .userInitiated)
  private let lock = NSLock()
  private var jobs: [String: Bool] = [:]
  private var engine: LineArtEngine?

  public func definition() -> ModuleDefinition {
    Name("ChromaLineArt")

    Function("begin") { () throws -> String in
      self.lock.lock(); defer { self.lock.unlock() }
      // ponytail: one conversion per module; the app has only one active photo draft.
      guard self.jobs.isEmpty else { throw self.failure("lineart_busy") }
      let id = UUID().uuidString
      self.jobs[id] = false
      return id
    }

    Function("cancel") { (id: String) in
      self.lock.lock(); defer { self.lock.unlock() }
      if self.jobs[id] != nil { self.jobs[id] = true }
    }

    AsyncFunction("convertAsync") { (id: String, uri: String, directory: String, options: NativeLineArtOptions) throws -> [String: Any] in
      defer {
        self.lock.lock(); self.jobs.removeValue(forKey: id); self.lock.unlock()
      }
      guard !self.cancelled(id) else { throw self.failure("lineart_cancelled") }
      guard #available(iOS 17.0, *) else { throw self.failure("lineart_ios_17_required") }
      let input = try self.localURL(uri, output: false)
      let folder = try self.localURL(directory, output: true)
      let attributes = try folder.resourceValues(forKeys: [.isDirectoryKey])
      guard attributes.isDirectory == true else { throw self.failure("lineart_output_directory_required") }
      try excludePrivateDirectoryFromBackup(folder, coveredBy: self.appContext?.config.documentDirectory)
      let output = folder.appendingPathComponent("lineart-\(id).png")
      if self.engine == nil {
        guard let model = self.modelURL() else { throw self.failure("lineart_model_missing") }
        self.engine = try LineArtEngine(modelURL: model)
      }
      let result = try self.engine!.convert(inputURL: input, outputURL: output,
        options: LineArtOptions(maxEdge: options.maxEdge, lineGain: options.lineGain),
        isCancelled: { self.cancelled(id) })
      return ["uri": output.absoluteString, "width": result.width, "height": result.height,
              "bytes": result.bytes, "durationMs": result.durationMs]
    }.runOnQueue(work)

    AsyncFunction("discardResult") { (uri: String) throws in
      let url = try self.localURL(uri, output: true)
      let stem = url.deletingPathExtension().lastPathComponent
      guard url.pathExtension == "png", stem.hasPrefix("lineart-"),
        UUID(uuidString: String(stem.dropFirst(8))) != nil else {
        throw self.failure("lineart_invalid_result")
      }
      if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }.runOnQueue(work)

    AsyncFunction("extractPaletteAsync") { (uri: String) throws -> [[String: Any]] in
      let input = try self.localURL(uri, output: false)
      return try PaletteExtractor.extract(inputURL: input).map {
        ["hex": $0.hex, "rgb": $0.rgb, "weight": $0.weight]
      }
    }.runOnQueue(work)

    AsyncFunction("preparePrivateDirectoryAsync") { (directory: String) throws in
      let folder = try self.localURL(directory, output: true)
      let attributes = try folder.resourceValues(forKeys: [.isDirectoryKey])
      guard attributes.isDirectory == true else { throw self.failure("lineart_output_directory_required") }
      try excludePrivateDirectoryFromBackup(folder, coveredBy: self.appContext?.config.documentDirectory)
    }.runOnQueue(work)

    AsyncFunction("normalizePhotoAsync") { (uri: String, directory: String) throws -> [String: Any] in
      let input = try self.localURL(uri, output: false)
      let folder = try self.localURL(directory, output: true)
      let attributes = try folder.resourceValues(forKeys: [.isDirectoryKey])
      guard attributes.isDirectory == true else { throw self.failure("photo_output_directory_required") }
      try excludePrivateDirectoryFromBackup(folder, coveredBy: self.appContext?.config.documentDirectory)
      let result = try PhotoImporter.normalize(inputURL: input, outputDirectory: folder)
      var response: [String: Any] = ["uri": result.uri, "width": result.width,
                                     "height": result.height, "bytes": result.bytes]
      if let capturedDate = result.capturedDate { response["capturedDate"] = capturedDate }
      return response
    }.runOnQueue(work)

    OnDestroy {
      self.lock.lock()
      for id in self.jobs.keys { self.jobs[id] = true }
      self.lock.unlock()
    }
  }

  private func cancelled(_ id: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return jobs[id] != false
  }

  private func modelURL() -> URL? {
    let host = Bundle(for: ChromaLineArtModule.self)
    for bundle in [host, Bundle.main] {
      if let url = bundle.url(forResource: "ChromaLineArt", withExtension: "bundle"),
        let model = Bundle(url: url)?.url(forResource: "LineArt", withExtension: "mlmodelc") { return model }
    }
    return nil
  }

  private func localURL(_ raw: String, output: Bool) throws -> URL {
    guard let url = URL(string: raw), url.isFileURL, url.host == nil || url.host == "",
      url.query == nil, url.fragment == nil else { throw failure("lineart_local_file_required") }
    let resolved = url.standardizedFileURL.resolvingSymlinksInPath()
    let documents = appContext?.config.documentDirectory
    let directories = output ? [documents] : [documents, appContext?.config.cacheDirectory]
    let roots = directories.compactMap { $0?.standardizedFileURL.resolvingSymlinksInPath().path }
    guard roots.contains(where: { resolved.path.hasPrefix($0 + "/") }) else {
      throw failure("lineart_app_file_required")
    }
    return resolved
  }

  private func failure(_ code: String) -> NSError {
    NSError(domain: "ChromaLineArt", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }
}
