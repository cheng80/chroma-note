import CoreGraphics
import CoreML
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
enum LineArtEngineTests {
    static func main() throws {
        guard CommandLine.arguments.count == 3 else {
            throw TestFailure("usage: LineArtEngineTests MODEL_URL OUTPUT_DIR")
        }
        let modelURL = URL(fileURLWithPath: CommandLine.arguments[1])
        let root = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
        let directory = root.appendingPathComponent("line-art-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let engine = try LineArtEngine(modelURL: modelURL)
        let source = directory.appendingPathComponent("pattern.png")
        try makePattern(width: 48, height: 36).write(to: source)

        var tests = 0
        try run("defaults and exact RGB math", &tests) {
            let output = directory.appendingPathComponent("defaults.png")
            let result = try engine.convert(inputURL: source, outputURL: output)
            try expect(result.width == 48 && result.height == 36, "default dimensions")
            let outputBytes = try Data(contentsOf: output).count
            try expect(result.bytes == outputBytes, "reported byte count")
            let expected = try expectedPixels(modelURL: modelURL, inputURL: source, gain: 1.8)
            try expect(try pixels(output) == expected, "default RGB math")
        }
        try run("gain changes pixels", &tests) {
            let low = directory.appendingPathComponent("gain-low.png")
            let high = directory.appendingPathComponent("gain-high.png")
            _ = try engine.convert(inputURL: source, outputURL: low, options: .init(lineGain: 0.1))
            _ = try engine.convert(inputURL: source, outputURL: high, options: .init(lineGain: 4))
            try expect(try pixels(low) != pixels(high), "gain must affect output")
        }
        try run("max edge contains without upscale", &tests) {
            let small = directory.appendingPathComponent("edge-24.png")
            let original = directory.appendingPathComponent("edge-1024.png")
            let smallResult = try engine.convert(inputURL: source, outputURL: small, options: .init(maxEdge: 24))
            let originalResult = try engine.convert(inputURL: source, outputURL: original)
            try expect(smallResult.width == 24 && smallResult.height == 18, "contained dimensions")
            try expect(originalResult.width == 48 && originalResult.height == 36, "no upscale")
        }
        try run("repeating conversions repeat pixels", &tests) {
            let first = directory.appendingPathComponent("repeat-a.png")
            let second = directory.appendingPathComponent("repeat-b.png")
            _ = try engine.convert(inputURL: source, outputURL: first)
            _ = try engine.convert(inputURL: source, outputURL: second)
            try expect(try pixels(first) == pixels(second), "repeated pixels")
        }
        try run("invalid options", &tests) {
            for options in [
                LineArtOptions(maxEdge: 15),
                LineArtOptions(maxEdge: 1537),
                LineArtOptions(lineGain: 0.09),
                LineArtOptions(lineGain: 4.01),
                LineArtOptions(lineGain: .nan),
                LineArtOptions(lineGain: .infinity),
            ] {
                try expectError(.invalidOptions) {
                    _ = try engine.convert(
                        inputURL: source,
                        outputURL: directory.appendingPathComponent("invalid-\(UUID().uuidString).png"),
                        options: options
                    )
                }
            }
        }
        try run("invalid path", &tests) {
            try expectError(.invalidInput) {
                _ = try engine.convert(
                    inputURL: directory.appendingPathComponent("missing.jpg"),
                    outputURL: directory.appendingPathComponent("missing.png")
                )
            }
        }
        try run("30 MiB input limit", &tests) {
            let oversized = directory.appendingPathComponent("oversized.png")
            FileManager.default.createFile(atPath: oversized.path, contents: nil)
            let handle = try FileHandle(forWritingTo: oversized)
            try handle.truncate(atOffset: UInt64(30 * 1024 * 1024 + 1))
            try handle.close()
            try expectError(.inputTooLarge) {
                _ = try engine.convert(inputURL: oversized, outputURL: directory.appendingPathComponent("oversized-out.png"))
            }
        }
        try run("pixel and minimum-axis limits", &tests) {
            let huge = directory.appendingPathComponent("huge.png")
            try makeHugePNG(width: 10_000, height: 5_001).write(to: huge)
            try expectError(.imageTooLarge) {
                _ = try engine.convert(inputURL: huge, outputURL: directory.appendingPathComponent("huge-out.png"))
            }
            let tiny = directory.appendingPathComponent("tiny.png")
            try makePattern(width: 15, height: 16).write(to: tiny)
            try expectError(.imageTooSmall) {
                _ = try engine.convert(inputURL: tiny, outputURL: directory.appendingPathComponent("tiny-out.png"))
            }
        }
        try run("orientation and sRGB normalization", &tests) {
            let oriented = directory.appendingPathComponent("oriented.jpg")
            try makeOrientedJPEG(width: 32, height: 20).write(to: oriented)
            let output = directory.appendingPathComponent("oriented.png")
            let result = try engine.convert(inputURL: oriented, outputURL: output)
            try expect(result.width == 20 && result.height == 32, "EXIF orientation")
            guard let outputSource = CGImageSourceCreateWithURL(output as CFURL, nil),
                  let outputImage = CGImageSourceCreateImageAtIndex(outputSource, 0, nil)
            else { throw TestFailure("could not inspect normalized output") }
            try expect(outputImage.colorSpace?.name == CGColorSpace.sRGB, "sRGB output")
        }
        try run("animated input rejected", &tests) {
            let animated = directory.appendingPathComponent("animated.png")
            try makeAnimatedPNG().write(to: animated)
            try expectError(.invalidInput) {
                _ = try engine.convert(inputURL: animated, outputURL: directory.appendingPathComponent("animated-out.png"))
            }
        }
        try run("output safety and cancellation", &tests) {
            let existing = directory.appendingPathComponent("existing.png")
            let marker = Data("keep".utf8)
            try marker.write(to: existing)
            try expectError(.outputExists) {
                _ = try engine.convert(inputURL: source, outputURL: existing)
            }
            try expect(try Data(contentsOf: existing) == marker, "existing output preserved")
            try expectError(.invalidOutput) {
                _ = try engine.convert(inputURL: source, outputURL: source)
            }
            try expectError(.cancelled) {
                _ = try engine.convert(
                    inputURL: source,
                    outputURL: directory.appendingPathComponent("cancelled.png"),
                    isCancelled: { true }
                )
            }
            let lateOutput = directory.appendingPathComponent("cancelled-after-infer.png")
            var cancellationChecks = 0
            try expectError(.cancelled) {
                _ = try engine.convert(inputURL: source, outputURL: lateOutput, isCancelled: {
                    cancellationChecks += 1
                    return cancellationChecks == 5
                })
            }
            try expect(cancellationChecks == 5, "cancelled after inference")
            try expect(!FileManager.default.fileExists(atPath: lateOutput.path), "cancelled conversion wrote output")
        }

        print("PASS \(tests) native tests")
    }
}

private struct TestFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

private func run(_ name: String, _ count: inout Int, _ body: () throws -> Void) throws {
    try body()
    count += 1
    print("PASS \(name)")
}

private func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !condition() { throw TestFailure(message) }
}

private func expectError(_ expected: LineArtError, _ body: () throws -> Void) throws {
    do {
        _ = try body()
        throw TestFailure("expected \(expected.code)")
    } catch let error as LineArtError {
        try expect(error == expected, "expected \(expected.code), got \(error.code)")
        try expect(error.localizedDescription.contains("/") == false, "localized error leaked a path")
    }
}

private func makePattern(width: Int, height: Int) throws -> Data {
    var rgba = [UInt8](repeating: 255, count: width * height * 4)
    for y in 0..<height {
        for x in 0..<width {
            let index = (y * width + x) * 4
            rgba[index] = UInt8((x * 37 + y * 11) % 256)
            rgba[index + 1] = UInt8(((x / 6 + y / 6) % 2) * 220 + 20)
            rgba[index + 2] = UInt8((x * 5 + y * 29) % 256)
        }
    }
    return try encodePNG(rgba, width: width, height: height)
}

private func pixels(_ url: URL) throws -> [UInt8] {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)
    else { throw TestFailure("could not decode output") }
    var rgba = [UInt8](repeating: 0, count: image.width * image.height * 4)
    let drewImage = rgba.withUnsafeMutableBytes { raw -> Bool in
        guard let context = CGContext(data: raw.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                                      bytesPerRow: image.width * 4, space: colorSpace,
                                      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return false }
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return true
    }
    guard drewImage else { throw TestFailure("could not create pixel context") }
    return rgba
}

private func expectedPixels(modelURL: URL, inputURL: URL, gain: Double) throws -> [UInt8] {
    let sourcePixels = try pixels(inputURL)
    guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { throw TestFailure("could not inspect input") }
    let width = image.width
    let height = image.height
    let paddedWidth = (width + 3) / 4 * 4
    let paddedHeight = (height + 3) / 4 * 4
    let input = try MLMultiArray(shape: [1, 3, NSNumber(value: paddedHeight), NSNumber(value: paddedWidth)], dataType: .float32)
    let inputPointer = input.dataPointer.assumingMemoryBound(to: Float.self)
    let inputStrides = input.strides.map(\.intValue)
    for y in 0..<paddedHeight {
        for x in 0..<paddedWidth {
            let sourceY = y < height ? y : 2 * height - 2 - y
            let sourceX = x < width ? x : 2 * width - 2 - x
            let offset = (sourceY * width + sourceX) * 4
            for channel in 0..<3 {
                inputPointer[channel * inputStrides[1] + y * inputStrides[2] + x * inputStrides[3]] = Float(sourcePixels[offset + channel]) / 255
            }
        }
    }
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    let model = try MLModel(contentsOf: modelURL, configuration: configuration)
    let provider = try MLDictionaryFeatureProvider(dictionary: ["image": input])
    let prediction = try model.prediction(from: provider)
    guard let line = prediction.featureValue(for: "line")?.multiArrayValue else {
        throw TestFailure("missing line output")
    }
    let pointer = line.dataPointer.assumingMemoryBound(to: Float.self)
    let strides = line.strides.map(\.intValue)
    var expected = [UInt8](repeating: 255, count: sourcePixels.count)
    for y in 0..<height {
        for x in 0..<width {
            let index = y * width + x
            let gray = UInt8((pointer[y * strides[2] + x * strides[3]] * 255).rounded(.toNearestOrEven))
            let alpha = min(255, Int((Double(255 - Int(gray)) * gain).rounded(.toNearestOrEven)))
            for channel in 0..<3 {
                let color = Int(sourcePixels[index * 4 + channel])
                expected[index * 4 + channel] = UInt8((color * alpha + 255 * (255 - alpha) + 127) / 255)
            }
        }
    }
    return expected
}

private func encodePNG(_ rgba: [UInt8], width: Int, height: Int) throws -> Data {
    guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                              bytesPerRow: width * 4, space: colorSpace,
                              bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    else { throw TestFailure("could not create fixture") }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
        throw TestFailure("could not encode fixture")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("could not finish fixture") }
    return data as Data
}

private func makeOrientedJPEG(width: Int, height: Int) throws -> Data {
    let rgba = [UInt8](try makePattern(width: width, height: height))
    guard let source = CGImageSourceCreateWithData(Data(rgba) as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { throw TestFailure("could not create oriented fixture") }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw TestFailure("could not encode oriented fixture")
    }
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: 6] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("could not finish oriented fixture") }
    return data as Data
}

private func makeAnimatedPNG() throws -> Data {
    guard let source = CGImageSourceCreateWithData(try makePattern(width: 16, height: 16) as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { throw TestFailure("could not create animated fixture") }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 2, nil) else {
        throw TestFailure("could not encode animated fixture")
    }
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("could not finish animated fixture") }
    return data as Data
}

private func makeHugePNG(width: Int, height: Int) throws -> Data {
    let gray = Data(repeating: 255, count: width * height)
    guard let provider = CGDataProvider(data: gray as CFData),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8,
                              bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                              bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    else { throw TestFailure("could not create large fixture") }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
        throw TestFailure("could not encode large fixture")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("could not finish large fixture") }
    return data as Data
}
