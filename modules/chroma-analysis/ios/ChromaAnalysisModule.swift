import ExpoModulesCore
import Foundation
import UIKit

public final class ChromaAnalysisModule: Module {
  private let work = DispatchQueue(label: "chroma.analysis", qos: .userInitiated)
  private let lock = NSLock()
  private var jobs: [String: Bool] = [:]
  private var unloading = false
  private var engine: ChromaAnalysisBridge?
  private let modelAssets = ModelAssetStore()

  public func definition() -> ModuleDefinition {
    Name("ChromaAnalysis")
    Events("onModelDownloadProgress")

    OnCreate {
      self.modelAssets.observe { [weak self] state in
        self?.sendEvent("onModelDownloadProgress", state.dictionary)
      }
    }

    AsyncFunction("getModelAssetStatus") { (promise: Promise) in
      self.modelAssets.getStatus { promise.resolve($0.dictionary) }
    }

    AsyncFunction("downloadModelAssets") { (promise: Promise) in
      self.modelAssets.download { promise.resolve($0.dictionary) }
    }

    AsyncFunction("pauseModelDownload") { (promise: Promise) in
      self.modelAssets.pause { promise.resolve($0.dictionary) }
    }

    OnAppEntersBackground { self.pauseAssetsForBackground() }

    Function("begin") { () throws -> String in
      self.lock.lock(); defer { self.lock.unlock() }
      guard self.jobs.isEmpty, !self.unloading else { throw self.failure("analysis_busy") }
      let id = UUID().uuidString
      self.jobs[id] = false
      return id
    }

    Function("cancel") { (id: String) in
      self.lock.lock(); defer { self.lock.unlock() }
      if self.jobs[id] != nil { self.jobs[id] = true }
    }

    AsyncFunction("prepareAsync") { () throws -> [String: Bool] in
      try self.prepareEngine(isCancelled: { false })
      return ["ready": true]
    }.runOnQueue(work)

    AsyncFunction("prepareJobAsync") { (id: String) throws -> [String: Bool] in
      defer { self.finish(id) }
      guard !self.cancelled(id) else { throw self.failure("analysis_cancelled") }
      try self.prepareEngine(isCancelled: { [weak self] in self?.cancelled(id) ?? true })
      return ["ready": true]
    }.runOnQueue(work)

    AsyncFunction("generateAsync") { (id: String, uri: String, prompt: String, maxTokens: Int) throws -> [String: Any] in
      defer { self.lock.lock(); self.jobs.removeValue(forKey: id); self.lock.unlock() }
      guard !self.cancelled(id) else { throw self.failure("analysis_cancelled") }
      guard (8...128).contains(maxTokens), (1...1200).contains(prompt.count) else { throw self.failure("analysis_invalid_request") }
      let input = try self.localURL(uri)
      if self.engine == nil { try self.prepareEngine(isCancelled: { [weak self] in self?.cancelled(id) ?? true }) }
      let started = Date()
      do {
        let text = try self.engine!.generate(forImagePath: input.path, prompt: prompt, maxTokens: maxTokens,
          isCancelled: { [weak self] in self?.cancelled(id) ?? true })
        return ["text": text, "durationMs": Int(Date().timeIntervalSince(started) * 1000)]
      } catch {
        if self.invalidatesEngine(error) { self.engine = nil }
        throw error
      }
    }.runOnQueue(work)

    AsyncFunction("unloadAsync") { () throws in
      self.lock.lock()
      guard self.jobs.isEmpty, !self.unloading else { self.lock.unlock(); throw self.failure("analysis_busy") }
      self.unloading = true
      self.lock.unlock()
      self.engine = nil
      self.lock.lock()
      self.unloading = false
      self.lock.unlock()
    }.runOnQueue(work)

    OnDestroy {
      self.modelAssets.close()
      self.lock.lock()
      for id in self.jobs.keys { self.jobs[id] = true }
      self.lock.unlock()
    }
  }

  private func cancelled(_ id: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return jobs[id] != false
  }

  private func finish(_ id: String) {
    lock.lock(); defer { lock.unlock() }
    jobs.removeValue(forKey: id)
  }

  private func prepareEngine(isCancelled: @escaping () -> Bool) throws {
    if engine != nil { _ = try engine!.prepare(); return }
    let paths = try modelPaths(isCancelled: isCancelled)
    let candidate = ChromaAnalysisBridge(modelPath: paths.model.path, visionPath: paths.vision.path)
    do {
      _ = try candidate.prepare(isCancelled: isCancelled)
      guard !isCancelled() else { throw failure("analysis_cancelled") }
      engine = candidate
    } catch {
      engine = nil
      throw error
    }
  }

  private func modelPaths(isCancelled: () -> Bool) throws -> (model: URL, vision: URL) {
    try modelAssets.modelPaths(isCancelled: isCancelled)
  }

  private func pauseAssetsForBackground() {
    DispatchQueue.main.async {
      // Foreground downloads pause on backgrounding. A short system grant saves resume data.
      var identifier = UIBackgroundTaskIdentifier.invalid
      let finish = {
        if identifier != .invalid {
          UIApplication.shared.endBackgroundTask(identifier)
          identifier = .invalid
        }
      }
      identifier = UIApplication.shared.beginBackgroundTask(withName: "chroma.model-resume", expirationHandler: finish)
      self.modelAssets.pause { _ in DispatchQueue.main.async(execute: finish) }
    }
  }

  private func invalidatesEngine(_ error: Error) -> Bool {
    let code = (error as NSError).localizedDescription
    return ["analysis_model_load_failed", "analysis_out_of_memory",
      "analysis_tokenize_failed", "analysis_image_eval_failed", "analysis_decode_failed"].contains(code)
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
