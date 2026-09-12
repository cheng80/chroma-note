import Foundation

enum ChromaHTTPPrivacy {
  static func configure(cachesDirectory: URL, documentsDirectory: URL, bundleIdentifier: String) throws {
    // Existing sessions may retain this object; disable it before replacing it.
    let previous = URLCache.shared
    previous.memoryCapacity = 0
    previous.diskCapacity = 0
    previous.removeAllCachedResponses()
    URLCache.shared = URLCache(memoryCapacity: 0, diskCapacity: 0, diskPath: nil)

    guard bundleIdentifier.range(of: "^[A-Za-z0-9][A-Za-z0-9.-]*$", options: .regularExpression) != nil else {
      throw CocoaError(.fileWriteInvalidFileName)
    }
    let root = cachesDirectory.standardizedFileURL.resolvingSymlinksInPath()
    // Exclude app-owned originals from backup, including legacy files. Excluding the
    // existing directory also covers future children without touching their contents.
    var documents = root.deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent("Documents", isDirectory: true)
    guard cachesDirectory.isFileURL, documentsDirectory.isFileURL,
      root.lastPathComponent == "Caches", root.deletingLastPathComponent().lastPathComponent == "Library",
      documentsDirectory.lastPathComponent == "Documents",
      documentsDirectory.standardizedFileURL.path == documentsDirectory.path,
      documentsDirectory.deletingLastPathComponent().resolvingSymlinksInPath().path == documents.deletingLastPathComponent().path,
      documentsDirectory.resolvingSymlinksInPath().path == documents.path else {
      throw CocoaError(.fileWriteInvalidFileName)
    }
    let attributes = try documents.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard attributes.isDirectory == true, attributes.isSymbolicLink != true else {
      throw CocoaError(.fileWriteInvalidFileName)
    }
    var backup = URLResourceValues()
    backup.isExcludedFromBackup = true
    try documents.setResourceValues(backup)

    let directory = root.appendingPathComponent(bundleIdentifier, isDirectory: true)
    guard directory.resolvingSymlinksInPath().path == directory.path else {
      throw CocoaError(.fileWriteInvalidFileName)
    }

    // Observed CFURLCache layout in the installed app. Other bundle caches stay intact.
    let names = ["Cache.db", "Cache.db-wal", "Cache.db-shm", "fsCachedData"]
    let manager = FileManager.default
    for name in names {
      let target = directory.appendingPathComponent(name)
      do {
        let values = try target.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])
        guard values.isSymbolicLink != true, values.isDirectory == (name == "fsCachedData") else {
          throw CocoaError(.fileWriteInvalidFileName)
        }
        try manager.removeItem(at: target)
      } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
        continue
      }
    }
  }
}
