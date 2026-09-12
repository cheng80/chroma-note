import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { patchAppDelegate } = require('./with-private-http-cache');
const { removeGeneratedContents } = require('@expo/config-plugins/build/utils/generateCode');
const project = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, project), 'utf8');
let original = await read('ios/chromanote/AppDelegate.swift');
for (const tag of ['chroma-http-cache-helper', 'chroma-http-cache-startup']) original = removeGeneratedContents(original, tag) ?? original;
const patched = patchAppDelegate(original);
assert.equal(patchAppDelegate(patched), patched, 'prebuild must be idempotent');
assert(patched.indexOf('try ChromaHTTPPrivacy.configure(') < patched.indexOf('let delegate = ReactNativeDelegate()'));
assert.throws(() => patchAppDelegate(original.replace('let delegate = ReactNativeDelegate()', 'let delegate = ChangedTemplate()')));
assert(JSON.parse(await read('app.json')).expo.plugins.includes('./plugins/with-private-http-cache'));

// These installed transports share URLCache, or already disable it explicitly.
for (const path of [
  'node_modules/react-native/Libraries/Network/RCTHTTPRequestHandler.mm',
  'node_modules/expo/ios/Fetch/ExpoFetchModule.swift',
  'node_modules/expo-file-system/ios/FileSystemDownload.swift',
]) {
  const source = await read(path);
  assert.match(source, /defaultSessionConfiguration|URLSessionConfiguration.default|configuration: \.default/);
  assert.doesNotMatch(source, /(?:urlCache\s*=|setURLCache:)/, 'a private transport cache needs a privacy review');
}
assert.match(await read('node_modules/expo-file-system/ios/FileSystemDownload.swift'), /URLSession.shared.downloadTask/);
for (const path of [
  'node_modules/expo-file-system/ios/FileSystemDownloadTask.swift',
  'node_modules/expo-file-system/ios/Legacy/NetworkingHelpers.swift',
]) assert.match(await read(path), /configuration.urlCache = nil/);

const work = await mkdtemp(join(tmpdir(), 'chroma-http-privacy-check-'));
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' });
  response.end(`synthetic-response-${++requests}`);
});
let requests = 0;
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});
try {
  const native = new URL('./private-http-cache.swift', import.meta.url).pathname;
  await run('xcrun', ['--sdk', 'iphoneos', 'swiftc', '-typecheck', '-parse-as-library', '-target', 'arm64-apple-ios17.0', native]);
  const runner = join(work, 'Check.swift');
  await writeFile(runner, `import Foundation
@main struct Check {
  static func main() async throws {
    let root = URL(fileURLWithPath: CommandLine.arguments[1]).resolvingSymlinksInPath()
    let fm = FileManager.default
    let caches = root.appendingPathComponent("Library/Caches")
    let documents = root.appendingPathComponent("Documents")
    let legacy = caches.appendingPathComponent("com.cheng80.chromanote")
    let names = ["Cache.db", "Cache.db-wal", "Cache.db-shm", "fsCachedData/body"]
    let preserved = ["Documents/chroma-drafts/photo.jpg", "Documents/chroma/legacy.jpg", "Documents/chroma-qa-input/source.jpg", "Documents/chroma-qa-lineart-50/output.png", "Documents/SQLite/drafts.db", "Documents/chroma-record-cache/result.png", "Library/Keychains/session", "Library/Caches/com.cheng80.chromanote/metal/keep", "Library/Caches/other.app/Cache.db"]
    let sentinel = Data("synthetic-private-state".utf8)
    for path in names.map({ "Library/Caches/com.cheng80.chromanote/" + $0 }) + preserved {
      let url = root.appendingPathComponent(path)
      try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try sentinel.write(to: url)
    }
    // Read the direct marker, not an inherited host isExcludedFromBackup Boolean.
    func backupMarker(_ url: URL) throws -> String {
      let process = Process(); let output = Pipe()
      process.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
      process.arguments = ["-px", "com.apple.metadata:com_apple_backup_excludeItem", url.path]
      process.standardOutput = output; process.standardError = FileHandle.nullDevice
      try process.run(); process.waitUntilExit()
      let hex = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
      let data = Data(hex.split(whereSeparator: { $0.isWhitespace }).compactMap { UInt8($0, radix: 16) })
      if data.isEmpty { return "" }
      let value = try PropertyListSerialization.propertyList(from: data, format: nil)
      return String(describing: value)
    }
    precondition(try! backupMarker(documents).isEmpty)
    let previous = URLCache(memoryCapacity: 1048576, diskCapacity: 1048576, directory: root.appendingPathComponent("test-session-cache"))
    URLCache.shared = previous
    let earlySession = URLSession(configuration: .default)
    let request = URLRequest(url: URL(string: CommandLine.arguments[2])!)
    previous.storeCachedResponse(CachedURLResponse(response: URLResponse(url: request.url!, mimeType: "text/plain", expectedContentLength: sentinel.count, textEncodingName: nil), data: sentinel), for: request)
    precondition(previous.cachedResponse(for: request) != nil, "reproduce ordinary response caching")
    try ChromaHTTPPrivacy.configure(cachesDirectory: caches, documentsDirectory: documents, bundleIdentifier: "com.cheng80.chromanote")
    precondition(try! backupMarker(documents).contains("com.apple.backupd"))
    precondition(previous.memoryCapacity == 0 && previous.diskCapacity == 0)
    precondition(previous.cachedResponse(for: request) == nil)
    precondition(URLCache.shared.memoryCapacity == 0 && URLCache.shared.diskCapacity == 0)
    precondition(URLSessionConfiguration.default.urlCache === URLCache.shared)
    precondition(URLSession.shared.configuration.urlCache === URLCache.shared)
    let session = URLSession(configuration: .default)
    precondition(session.configuration.urlCache === URLCache.shared)
    var responses = Set<Data>()
    for _ in 0..<2 { let (data, _) = try await earlySession.data(for: request); responses.insert(data) }
    for _ in 0..<2 { let (data, _) = try await URLSession.shared.data(for: request); responses.insert(data) }
    for _ in 0..<2 { let (data, _) = try await session.data(for: request); responses.insert(data) }
    for _ in 0..<2 {
      let (url, _) = try await session.download(for: request)
      responses.insert(try Data(contentsOf: url)); try fm.removeItem(at: url)
    }
    precondition(responses.count == 8, "existing/shared/default/download must each reach the server")
    precondition(URLCache.shared.cachedResponse(for: request) == nil)
    precondition(URLCache.shared.currentDiskUsage == 0 && URLCache.shared.currentMemoryUsage == 0)
    for name in names { precondition(!fm.fileExists(atPath: legacy.appendingPathComponent(name).path)) }
    for path in preserved { precondition(try! Data(contentsOf: root.appendingPathComponent(path)) == sentinel) }
    try ChromaHTTPPrivacy.configure(cachesDirectory: caches, documentsDirectory: documents, bundleIdentifier: "com.cheng80.chromanote")
    let future = documents.appendingPathComponent("future/subfolder/original.jpg")
    try fm.createDirectory(at: future.deletingLastPathComponent(), withIntermediateDirectories: true)
    try sentinel.write(to: future)
    precondition(try! backupMarker(documents).contains("com.apple.backupd"))
    precondition(try! Data(contentsOf: future) == sentinel)
    // Existing data and future children share a directly excluded ancestor.
    let outside = root.appendingPathComponent("other-container/Documents")
    try fm.createDirectory(at: outside, withIntermediateDirectories: true)
    let linkedDocuments = root.appendingPathComponent("linked-container/Documents")
    try fm.createDirectory(at: linkedDocuments.deletingLastPathComponent(), withIntermediateDirectories: true)
    try fm.createSymbolicLink(at: linkedDocuments, withDestinationURL: documents)
    for bad in [outside, linkedDocuments, root, documents.appendingPathComponent("../Documents"), URL(string: "https://example.invalid/Documents")!] {
      do { try ChromaHTTPPrivacy.configure(cachesDirectory: caches, documentsDirectory: bad, bundleIdentifier: "com.cheng80.chromanote"); preconditionFailure("invalid Documents accepted") } catch {}
    }
    // A trusted-path Documents symlink, missing directory and ordinary file must fail.
    let invalidRoot = root.appendingPathComponent("invalid-container")
    let invalidCaches = invalidRoot.appendingPathComponent("Library/Caches")
    let invalidDocuments = invalidRoot.appendingPathComponent("Documents")
    try fm.createDirectory(at: invalidCaches, withIntermediateDirectories: true)
    for kind in ["missing", "symlink", "file", "read-only"] {
      if kind == "symlink" { try fm.createSymbolicLink(at: invalidDocuments, withDestinationURL: outside) }
      if kind == "file" { try sentinel.write(to: invalidDocuments) }
      if kind == "read-only" {
        try fm.createDirectory(at: invalidDocuments, withIntermediateDirectories: false)
        try fm.setAttributes([.immutable: true], ofItemAtPath: invalidDocuments.path)
      }
      do { try ChromaHTTPPrivacy.configure(cachesDirectory: invalidCaches, documentsDirectory: invalidDocuments, bundleIdentifier: "com.cheng80.chromanote"); preconditionFailure("invalid or unwritable Documents accepted") } catch {}
      if kind == "read-only" { try fm.setAttributes([.immutable: false], ofItemAtPath: invalidDocuments.path) }
      if kind != "missing" { try fm.removeItem(at: invalidDocuments) }
    }
    precondition(try! backupMarker(outside).isEmpty)
    do { try ChromaHTTPPrivacy.configure(cachesDirectory: caches, documentsDirectory: documents, bundleIdentifier: "../Documents"); preconditionFailure("traversal accepted") } catch {}
    let linked = caches.appendingPathComponent("linked.app")
    try fm.createSymbolicLink(at: linked, withDestinationURL: root.appendingPathComponent("Documents"))
    do { try ChromaHTTPPrivacy.configure(cachesDirectory: caches, documentsDirectory: documents, bundleIdentifier: "linked.app"); preconditionFailure("symlink accepted") } catch {}
    let target = legacy.appendingPathComponent("Cache.db")
    try fm.createSymbolicLink(at: target, withDestinationURL: root.appendingPathComponent(preserved[1]))
    do { try ChromaHTTPPrivacy.configure(cachesDirectory: caches, documentsDirectory: documents, bundleIdentifier: "com.cheng80.chromanote"); preconditionFailure("cache symlink accepted") } catch {}
    for path in preserved { precondition(try! Data(contentsOf: root.appendingPathComponent(path)) == sentinel) }
    print("PASS direct Documents backup marker, future descendants, invalid paths and write failure, native cache denial, exact legacy cleanup, retry, traversal/symlink rejection, sibling data preservation")
  }
}
`);
  await mkdir(join(work, 'fixture'));
  const executable = join(work, 'Check');
  await run('xcrun', ['--sdk', 'macosx', 'swiftc', '-parse-as-library', native, runner, '-o', executable]);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await run(executable, [join(work, 'fixture'), `http://127.0.0.1:${server.address().port}/synthetic-cacheable-response`]);
  assert.equal(requests, 8);
  console.log('PASS Expo plugin idempotence/startup ordering, installed RN/Expo transport contract, iOS 17 typecheck, macOS native HTTP reproduction');
} finally {
  server.close();
  await rm(work, { recursive: true, force: true });
}
