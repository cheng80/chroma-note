import ExpoModulesCore
import Foundation

public final class ChromaAnalysisModule: Module {
  private let work = DispatchQueue(label: "chroma.analysis", qos: .userInitiated)
  private let lock = NSLock()
  private var jobs: [String: Bool] = [:]
  private var engine: ChromaAnalysisBridge?

  public func definition() -> ModuleDefinition {
    Name("ChromaAnalysis")

    Function("begin") { () throws -> String in
      self.lock.lock(); defer { self.lock.unlock() }
      guard self.jobs.isEmpty else { throw self.failure("analysis_busy") }
      let id = UUID().uuidString
      self.jobs[id] = false
      return id
    }

    Function("cancel") { (id: String) in
      self.lock.lock(); defer { self.lock.unlock() }
      if self.jobs[id] != nil { self.jobs[id] = true }
    }

    AsyncFunction("prepareAsync") { () throws -> [String: Bool] in
      if self.engine == nil {
        guard let paths = self.modelPaths() else { throw self.failure("analysis_model_missing") }
        self.engine = ChromaAnalysisBridge(modelPath: paths.model.path, visionPath: paths.vision.path)
      }
      _ = try self.engine!.prepare()
      return ["ready": true]
    }.runOnQueue(work)

    AsyncFunction("generateAsync") { (id: String, uri: String, prompt: String, maxTokens: Int) throws -> [String: Any] in
      defer { self.lock.lock(); self.jobs.removeValue(forKey: id); self.lock.unlock() }
      guard !self.cancelled(id) else { throw self.failure("analysis_cancelled") }
      guard (8...128).contains(maxTokens), (1...1200).contains(prompt.count) else { throw self.failure("analysis_invalid_request") }
      let input = try self.localURL(uri)
      if self.engine == nil {
        guard let paths = self.modelPaths() else { throw self.failure("analysis_model_missing") }
        self.engine = ChromaAnalysisBridge(modelPath: paths.model.path, visionPath: paths.vision.path)
      }
      let started = Date()
      let text = try self.engine!.generate(forImagePath: input.path, prompt: prompt, maxTokens: maxTokens,
        isCancelled: { [weak self] in self?.cancelled(id) ?? true })
      return ["text": text, "durationMs": Int(Date().timeIntervalSince(started) * 1000)]
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

  private func modelPaths() -> (model: URL, vision: URL)? {
    let host = Bundle(for: ChromaAnalysisModule.self)
    for bundle in [host, Bundle.main] {
      guard let bundleURL = bundle.url(forResource: "ChromaAnalysis", withExtension: "bundle"),
        let resources = Bundle(url: bundleURL),
        let model = resources.url(forResource: "Qwen3VL-4B-Instruct-Q4_K_M-compatible", withExtension: "gguf"),
        let vision = resources.url(forResource: "mmproj-Qwen3VL-4B-Instruct-Q8_0", withExtension: "gguf") else { continue }
      return (model, vision)
    }
    return nil
  }

  private func localURL(_ raw: String) throws -> URL {
    guard let url = URL(string: raw), url.isFileURL, url.host == nil || url.host == "",
      url.query == nil, url.fragment == nil else { throw failure("analysis_local_file_required") }
    let resolved = url.standardizedFileURL.resolvingSymlinksInPath()
    let roots = [appContext?.config.documentDirectory, appContext?.config.cacheDirectory]
      .compactMap { $0?.standardizedFileURL.resolvingSymlinksInPath().path }
    guard roots.contains(where: { resolved.path.hasPrefix($0 + "/") }) else { throw failure("analysis_app_file_required") }
    let values = try resolved.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, let bytes = values.fileSize, bytes > 0, bytes <= 30 * 1024 * 1024,
      ["jpg", "jpeg", "png", "heic"].contains(resolved.pathExtension.lowercased()) else {
      throw failure("analysis_invalid_image")
    }
    return resolved
  }

  private func failure(_ code: String) -> NSError {
    NSError(domain: "ChromaAnalysis", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }
}
