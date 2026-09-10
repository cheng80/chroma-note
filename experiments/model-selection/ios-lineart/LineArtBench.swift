import UIKit
import CoreML
import ImageIO
import UniformTypeIdentifiers

func seconds() -> Double { ProcessInfo.processInfo.systemUptime }
func memory() throws -> [String: UInt64] {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let capacity = Int(count)
    let status = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: capacity) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    let peakEnd = MemoryLayout<task_vm_info_data_t>.offset(of: \.ledger_phys_footprint_peak)! + MemoryLayout<Int64>.size
    try require(status == KERN_SUCCESS && Int(count) * MemoryLayout<integer_t>.size >= peakEnd, "Memory measurement unavailable")
    return ["resident_bytes": info.resident_size, "peak_resident_bytes": info.resident_size_peak,
            "physical_footprint_bytes": info.phys_footprint,
            "peak_physical_footprint_bytes": UInt64(max(0, info.ledger_phys_footprint_peak))]
}
func require(_ ok: Bool, _ message: String) throws {
    if !ok { throw NSError(domain: "LineArtBench", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
func reflected(_ i: Int, _ count: Int) -> Int { i < count ? i : 2 * count - 2 - i }
func alpha(_ gray: UInt8) -> Int { min(255, Int((Double(255 - Int(gray)) * 1.8).rounded(.toNearestOrEven))) }
func blend(_ color: UInt8, _ a: Int) -> UInt8 { UInt8((Int(color) * a + 255 * (255 - a) + 127) / 255) }

struct Photo {
    let width: Int, height: Int, rgba: [UInt8]
}

func decode(_ url: URL, original: Bool, edge: Int = 1024) throws -> Photo {
    let data = try Data(contentsOf: url)
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
        throw NSError(domain: "Decode", code: 1)
    }
    let cg: CGImage?
    if original {
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let w = properties?[kCGImagePropertyPixelWidth] as? Int ?? 0
        let h = properties?[kCGImagePropertyPixelHeight] as? Int ?? 0
        try require(w >= 4 && h >= 4, "Invalid source dimensions")
        cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: min(edge, max(w, h)),
            kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary)
    } else {
        cg = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }
    guard let cg else { throw NSError(domain: "Decode", code: 2) }
    var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
    try bytes.withUnsafeMutableBytes { raw in
        guard let context = CGContext(data: raw.baseAddress, width: cg.width, height: cg.height,
                                      bitsPerComponent: 8, bytesPerRow: cg.width * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw NSError(domain: "Decode", code: 3)
        }
        context.setFillColor(UIColor.white.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    }
    return Photo(width: cg.width, height: cg.height, rgba: bytes)
}

func tensor(_ photo: Photo) throws -> MLMultiArray {
    let h = (photo.height + 3) / 4 * 4, w = (photo.width + 3) / 4 * 4
    // ponytail: only measured shapes; expand supported shapes when accepting arbitrary imports.
    try require((h == 428 && w == 640) || (h == 1024 && w == 832) || (h == 1536 && w == 1244), "Unsupported benchmark shape \(w)x\(h)")
    let result = try MLMultiArray(shape: [1, 3, NSNumber(value: h), NSNumber(value: w)], dataType: .float32)
    let p = result.dataPointer.assumingMemoryBound(to: Float.self)
    let s = result.strides.map(\.intValue)
    for y in 0..<h {
        for x in 0..<w {
            let offset = (reflected(y, photo.height) * photo.width + reflected(x, photo.width)) * 4
            for c in 0..<3 { p[c * s[1] + y * s[2] + x * s[3]] = Float(photo.rgba[offset + c]) / 255 }
        }
    }
    return result
}

func colorize(_ output: MLMultiArray, _ photo: Photo) throws -> (gray: [UInt8], rgba: [UInt8]) {
    try require(output.dataType == .float32, "Output must be float32")
    let shape = output.shape.map(\.intValue), stride = output.strides.map(\.intValue)
    try require(shape == [1, 1, (photo.height + 3) / 4 * 4, (photo.width + 3) / 4 * 4], "Output shape mismatch")
    let p = output.dataPointer.assumingMemoryBound(to: Float.self)
    var gray = [UInt8](repeating: 0, count: photo.width * photo.height)
    var rgba = [UInt8](repeating: 255, count: photo.width * photo.height * 4)
    for y in 0..<photo.height {
        for x in 0..<photo.width {
            let i = y * photo.width + x, value = p[y * stride[2] + x * stride[3]]
            try require(value.isFinite && value >= 0 && value <= 1, "Invalid prediction")
            gray[i] = UInt8((value * 255).rounded(.toNearestOrEven))
            let a = alpha(gray[i])
            for c in 0..<3 { rgba[i * 4 + c] = blend(photo.rgba[i * 4 + c], a) }
        }
    }
    return (gray, rgba)
}

func png(_ bytes: [UInt8], width: Int, height: Int, gray: Bool = false) throws -> Data {
    let channels = gray ? 1 : 4
    let provider = CGDataProvider(data: Data(bytes) as CFData)!
    let colorSpace = gray ? CGColorSpaceCreateDeviceGray() : CGColorSpace(name: CGColorSpace.sRGB)!
    let bitmap: CGBitmapInfo = gray ? CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue)
        : CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
    guard let cg = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: channels * 8,
                           bytesPerRow: width * channels, space: colorSpace, bitmapInfo: bitmap,
                           provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else {
        throw NSError(domain: "PNG", code: 1)
    }
    let data = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "PNG", code: 2)
    }
    CGImageDestinationAddImage(dest, cg, nil)
    try require(CGImageDestinationFinalize(dest), "PNG encoding failed")
    return data as Data
}

func checks() throws {
    try require((0..<8).map { reflected($0, 5) } == [0,1,2,3,4,3,2,1], "Reflection check")
    try require([UInt8(0), 200, 255].map(alpha) == [255,99,0], "Alpha check")
    try require(blend(14, 99) == 161 && blend(10, 0) == 255 && blend(235, 255) == 235, "Blend check")
    try require(Int(Float(2.5).rounded(.toNearestOrEven)) == 2, "Rounding check")
}

func benchmark(info: [String: Any], update: @escaping (String, Data?) -> Void) throws {
    try checks()
    let environment = ProcessInfo.processInfo.environment
    let edge = Int(environment["BENCH_EDGE"] ?? "1024") ?? 0
    let resolutionComparison = environment["BENCH_CASE"] == "L02"
    try require([1024, 1536].contains(edge), "Unsupported edge")
    let modes = resolutionComparison ? ["original"] : ["original", "normalized"]
    let cases = resolutionComparison ? [2] : Array(1...5)
    let rounds = resolutionComparison ? 6 : 4
    let fm = FileManager.default
    var documents = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try documents.setResourceValues(values)
    let folder = documents.appendingPathComponent("run-\(Int(Date().timeIntervalSince1970))")
    try fm.createDirectory(at: folder, withIntermediateDirectories: true)
    var report = info
    report["started_at"] = ISO8601DateFormatter().string(from: Date())
    report["compute_units_requested"] = "all"
    report["line_gain"] = 1.8
    report["edge"] = edge
    report["memory_scope"] = "OS process lifetime peak footprint/RSS; includes model, diagnostics and preview; queried outside timed stages"
    report["memory_before_model"] = try memory()
    report["timing_scope"] = "file decode / native original resize + tensor / model prediction + color mask / final PNG encode and write; excludes diagnostic PNGs, UI render, picker, model offline compilation"
    report["self_checks"] = "passed"
    report["rows"] = [[String: Any]]()
    func save() throws { try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: folder.appendingPathComponent("run.json"), options: .atomic) }
    try save()
    do {
        let configuration = MLModelConfiguration(); configuration.computeUnits = .all
        let load = seconds()
        guard let modelURL = Bundle.main.url(forResource: "LineArt", withExtension: "mlmodelc") else {
            throw NSError(domain: "Model resource missing", code: 1)
        }
        let model = try MLModel(contentsOf: modelURL, configuration: configuration)
        report["model_load_seconds"] = seconds() - load
        report["memory_after_model"] = try memory()
        try save()
        // Original photos run first so the first device prediction includes native input preparation.
        for mode in modes {
            for round in 0..<rounds {
                for index in cases {
                    try autoreleasepool {
                        let id = String(format: "L%02d", index)
                        let name = mode == "original" ? id : "\(id)-input"
                        let ext = mode == "original" && index != 2 ? "jpg" : "png"
                        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
                            throw NSError(domain: "Missing image \(name)", code: 1)
                        }
                        update("\(edge)px · \(id) · \(round + 1)/\(rounds) 변환 중", nil)
                        let thermalBefore = ProcessInfo.processInfo.thermalState.rawValue
                        let start = seconds()
                        let photo = try decode(url, original: mode == "original", edge: edge)
                        let decoded = seconds()
                        let input = try tensor(photo)
                        let provider = try MLDictionaryFeatureProvider(dictionary: ["image": input])
                        let prepared = seconds()
                        let prediction = try model.prediction(from: provider)
                        guard let line = prediction.featureValue(for: "line")?.multiArrayValue else { throw NSError(domain: "Missing line output", code: 1) }
                        let inferred = seconds()
                        let result = try colorize(line, photo)
                        let colored = seconds()
                        let encoded = try png(result.rgba, width: photo.width, height: photo.height)
                        let stem = "\(mode)-r\(round)-\(id)"
                        try encoded.write(to: folder.appendingPathComponent("\(stem).png"), options: .atomic)
                        let end = seconds()
                        let row: [String: Any] = ["id": id, "mode": mode, "round": round,
                            "width": photo.width, "height": photo.height,
                            "decode_seconds": decoded - start, "prepare_seconds": prepared - decoded,
                            "inference_seconds": inferred - prepared, "color_seconds": colored - inferred,
                            "png_write_seconds": end - colored, "total_seconds": end - start,
                            "thermal_before": thermalBefore, "thermal_after": ProcessInfo.processInfo.thermalState.rawValue,
                            "memory_after": try memory()]
                        var rows = report["rows"] as! [[String: Any]]; rows.append(row); report["rows"] = rows
                        try save()
                        if round == 0 {
                            try png(photo.rgba, width: photo.width, height: photo.height).write(to: folder.appendingPathComponent("\(mode)-\(id)-input.png"))
                            try png(result.gray, width: photo.width, height: photo.height, gray: true).write(to: folder.appendingPathComponent("\(mode)-\(id)-gray.png"))
                        }
                        print("BENCH \(mode) \(id) round=\(round) total=\(end - start) infer=\(inferred - prepared)"); fflush(stdout)
                        update(String(format: "%@ · %@ · %.3f초", mode, id, end - start), round == 0 ? encoded : nil)
                    }
                }
            }
        }
        report["completed"] = true
        report["memory_finished"] = try memory()
        try save()
        print("BENCH_DONE \(folder.lastPathComponent)"); fflush(stdout)
        update("측정 완료 · \(modes.count * cases.count * rounds)회\n\(folder.lastPathComponent)", nil)
    } catch {
        report["error"] = String(describing: error); try? save(); throw error
    }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let view = UIViewController(); view.view.backgroundColor = .systemBackground
        let label = UILabel(); label.numberOfLines = 0; label.text = "선화 변환 시간 측정 준비 중"; label.font = .preferredFont(forTextStyle: .headline)
        let image = UIImageView(); image.contentMode = .scaleAspectFit; image.accessibilityLabel = "실폰에서 변환한 원본색 선화"
        let stack = UIStackView(arrangedSubviews: [label, image]); stack.axis = .vertical; stack.spacing = 16; stack.translatesAutoresizingMaskIntoConstraints = false
        view.view.addSubview(stack)
        NSLayoutConstraint.activate([stack.topAnchor.constraint(equalTo: view.view.safeAreaLayoutGuide.topAnchor, constant: 24), stack.leadingAnchor.constraint(equalTo: view.view.leadingAnchor, constant: 20), stack.trailingAnchor.constraint(equalTo: view.view.trailingAnchor, constant: -20), stack.bottomAnchor.constraint(equalTo: view.view.safeAreaLayoutGuide.bottomAnchor, constant: -24)])
        window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = view; window?.makeKeyAndVisible()
        UIDevice.current.isBatteryMonitoringEnabled = true
        application.isIdleTimerDisabled = true
        var hardware = utsname(); uname(&hardware)
        let machine = withUnsafePointer(to: &hardware.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }
        #if targetEnvironment(simulator)
        let physical = false
        #else
        let physical = true
        #endif
        let info: [String: Any] = ["hardware": machine, "os": UIDevice.current.systemVersion,
            "physical_device": physical, "low_power_mode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "battery_level": UIDevice.current.batteryLevel, "battery_state": UIDevice.current.batteryState.rawValue,
            "thermal_start": ProcessInfo.processInfo.thermalState.rawValue, "build": "swiftc -O, iOS17+; FP16 CoreML"]
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try benchmark(info: info) { text, data in DispatchQueue.main.async { label.text = text; if let data { image.image = UIImage(data: data) } } }
            } catch {
                print("BENCH_ERROR \(error)"); fflush(stdout)
                DispatchQueue.main.async { label.text = "측정 실패: \(error.localizedDescription)" }
            }
            DispatchQueue.main.async { application.isIdleTimerDisabled = false }
        }
        return true
    }
}
