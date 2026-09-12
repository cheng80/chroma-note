import Foundation

@main
enum PrivateDirectoryBackupTests {
  static func main() throws {
    let fm = FileManager.default
    let work = fm.temporaryDirectory.appendingPathComponent("chroma-backup-policy-\(UUID().uuidString)")
    try fm.createDirectory(at: work, withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: work) }
    func folder(_ name: String) throws -> URL {
      let url = work.appendingPathComponent(name)
      try fm.createDirectory(at: url, withIntermediateDirectories: true)
      return url
    }
    // Read-only direct markers distinguish a skipped setter from the host's inherited flag.
    func marker(_ url: URL) throws -> Data {
      let process = Process(), output = Pipe()
      process.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
      process.arguments = ["-px", "com.apple.metadata:com_apple_backup_excludeItem", url.path]
      process.standardOutput = output
      process.standardError = FileHandle.nullDevice
      try process.run()
      let data = output.fileHandleForReading.readDataToEndOfFile()
      process.waitUntilExit()
      return data
    }
    let root = try folder("Documents")
    try excludePrivateDirectoryFromBackup(root, coveredBy: nil)
    precondition(try! !marker(root).isEmpty)
    let child = try folder("Documents/account")
    let photo = child.appendingPathComponent("photo")
    let original = Data("synthetic-original".utf8)
    try original.write(to: photo)
    for _ in 0..<2 {
      try excludePrivateDirectoryFromBackup(child, coveredBy: root)
      precondition(try! marker(child).isEmpty, "excluded ancestor must avoid the child setter")
    }
    precondition(try! Data(contentsOf: photo) == original)

    // Root absence, a missing root and a sibling sharing the prefix must use fallback.
    for (name, ancestor) in [("standalone", nil), ("missing-root", work.appendingPathComponent("absent")),
                              ("Documents-other", root)] as [(String, URL?)] {
      let target = try folder(name)
      precondition(try! marker(target).isEmpty)
      try excludePrivateDirectoryFromBackup(target, coveredBy: ancestor)
      precondition(try! !marker(target).isEmpty, "fallback must set a direct exclusion")
    }
    let outside = try folder("outside")
    let escape = root.appendingPathComponent("escape")
    try fm.createSymbolicLink(at: escape, withDestinationURL: outside)
    try excludePrivateDirectoryFromBackup(escape, coveredBy: root)
    precondition(try! !marker(outside).isEmpty, "escaping symlink must not be covered by root")

    let blocked = try folder("blocked")
    try fm.setAttributes([.immutable: true], ofItemAtPath: blocked.path)
    defer { try? fm.setAttributes([.immutable: false], ofItemAtPath: blocked.path) }
    do {
      try excludePrivateDirectoryFromBackup(blocked, coveredBy: nil)
      preconditionFailure("fallback write failure must propagate")
    } catch { }
    print("PASS backup policy: covered/repeated, preservation, fallback, boundary, symlink, write failure")
  }
}
