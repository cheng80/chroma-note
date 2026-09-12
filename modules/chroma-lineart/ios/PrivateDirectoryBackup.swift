import Foundation

// Callers validate that directory is an existing, app-owned directory first.
func excludePrivateDirectoryFromBackup(_ directory: URL, coveredBy root: URL?) throws {
  if let root, root.isFileURL {
    // Resolve both sides so a sibling prefix or an escaping symlink cannot inherit trust.
    let ancestor = root.standardizedFileURL.resolvingSymlinksInPath()
    let target = directory.standardizedFileURL.resolvingSymlinksInPath()
    if target.path.hasPrefix(ancestor.path + "/"),
      let values = try? ancestor.resourceValues(forKeys: [.isDirectoryKey, .isExcludedFromBackupKey]),
      values.isDirectory == true, values.isExcludedFromBackup == true {
      return
    }
  }
  // Standalone hosts may not install the Documents privacy policy. Preserve exclusion,
  // including when the ancestor cannot be checked; failures of this write still propagate.
  var target = directory
  var backup = URLResourceValues()
  backup.isExcludedFromBackup = true
  try target.setResourceValues(backup)
}
