import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
enum PhotoImporterTests {
    static func main() throws {
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("photo-import-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let source = root.appendingPathComponent("transparent.png")
        try makePNG().write(to: source)
        let result = try PhotoImporter.normalize(inputURL: source, outputDirectory: root)
        try expect(FileManager.default.fileExists(atPath: source.path), "source preserved")
        try expect(result.width == 64 && result.height == 32, "dimensions preserved")
        try expect(result.capturedDate == "2024-02-29", "capture date returned")

        let output = URL(string: result.uri)!
        guard let imageSource = CGImageSourceCreateWithURL(output as CFURL, nil),
              CGImageSourceGetType(imageSource) == UTType.png.identifier as CFString,
              let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
              let outputImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
        else { throw TestFailure("PNG output") }
        try expect(properties[kCGImagePropertyGPSDictionary] == nil, "GPS stripped")
        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        try expect(exif?[kCGImagePropertyExifDateTimeOriginal] == nil &&
                   exif?[kCGImagePropertyExifDateTimeDigitized] == nil &&
                   tiff?[kCGImagePropertyTIFFDateTime] == nil, "capture metadata stripped")
        try expect(try firstPixel(outputImage)[3] == 0, "alpha preserved")

        let opaque = root.appendingPathComponent("opaque.png")
        try makePNG(alpha: 255).write(to: opaque)
        let opaqueResult = try PhotoImporter.normalize(inputURL: opaque, outputDirectory: root)
        let opaqueOutput = URL(string: opaqueResult.uri)!
        guard let opaqueSource = CGImageSourceCreateWithURL(opaqueOutput as CFURL, nil),
              CGImageSourceGetType(opaqueSource) == UTType.jpeg.identifier as CFString
        else { throw TestFailure("opaque JPEG output") }

        let oriented = root.appendingPathComponent("oriented.jpg")
        try makeOrientedJPEG().write(to: oriented)
        let orientedResult = try PhotoImporter.normalize(inputURL: oriented, outputDirectory: root)
        try expect(orientedResult.width == 20 && orientedResult.height == 40, "EXIF orientation applied")

        let large = root.appendingPathComponent("large.png")
        try makePNG(width: 2300, height: 100).write(to: large)
        let downsampled = try PhotoImporter.normalize(inputURL: large, outputDirectory: root)
        try expect(max(downsampled.width, downsampled.height) == 2048, "large photo downsampled")

        for (width, height, expectedHeight) in [(8_000, 6_000, 1536), (20_000, 10_000, 1024)] {
            try autoreleasepool {
                let photo = root.appendingPathComponent("phone-\(width).jpg")
                try makeOrientedJPEG(width: width, height: height, orientation: 1).write(to: photo)
                let imported = try PhotoImporter.normalize(inputURL: photo, outputDirectory: root)
                try expect(imported.width == 2048 && imported.height == expectedHeight, "high-resolution JPEG downsampled without crop")
            }
        }

        try PhotoImporter.validateDimensions(width: 8_000, height: 6_000)
        try PhotoImporter.validateDimensions(width: 20_000, height: 10_000)
        try expectError(.imageTooLarge) {
            try PhotoImporter.validateDimensions(width: 25_001, height: 10_000)
        }

        print("PASS photo importer")
    }
}

private struct TestFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

private func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !condition() { throw TestFailure(message) }
}

private func expectError(_ expected: PhotoImporterError, _ body: () throws -> Void) throws {
    do {
        try body()
        throw TestFailure("expected \(expected.rawValue)")
    } catch let error as PhotoImporterError {
        try expect(error == expected, "expected \(expected.rawValue), got \(error.rawValue)")
    }
}

private func firstPixel(_ image: CGImage) throws -> [UInt8] {
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { throw TestFailure("sRGB") }
    var rgba = [UInt8](repeating: 0, count: 4)
    let drew = rgba.withUnsafeMutableBytes { bytes -> Bool in
        guard let context = CGContext(data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
                                      bytesPerRow: 4, space: colorSpace,
                                      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue |
                                        CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        context.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return true
    }
    guard drew else { throw TestFailure("pixel read") }
    return rgba
}

private func makeOrientedJPEG(width: Int = 40, height: Int = 20, orientation: Int = 6) throws -> Data {
    let rgba = [UInt8](repeating: 255, count: width * height * 4)
    guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                              bytesPerRow: width * 4, space: colorSpace,
                              bitmapInfo: CGBitmapInfo.byteOrder32Big.union(.init(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent),
          let data = CFDataCreateMutable(nil, 0),
          let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil)
    else { throw TestFailure("oriented JPEG setup") }
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: orientation] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("oriented JPEG encode") }
    return data as Data
}

private func makePNG(width: Int = 64, height: Int = 32, alpha: UInt8 = 0) throws -> Data {
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    for index in stride(from: 0, to: rgba.count, by: 4) {
        rgba[index] = 40
        rgba[index + 1] = 120
        rgba[index + 2] = 220
        rgba[index + 3] = alpha
    }
    guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                              bytesPerRow: width * 4, space: colorSpace,
                              bitmapInfo: CGBitmapInfo.byteOrder32Big.union(.init(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent),
          let data = CFDataCreateMutable(nil, 0),
          let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)
    else { throw TestFailure("PNG setup") }
    let metadata: [CFString: Any] = [
        kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2024:02:29 12:34:56"],
        kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 37.5],
    ]
    CGImageDestinationAddImage(destination, image, metadata as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("PNG encode") }
    return data as Data
}
