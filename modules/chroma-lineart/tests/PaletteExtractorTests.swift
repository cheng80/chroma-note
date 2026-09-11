import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
enum PaletteExtractorTests {
    static func main() throws {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("chroma-palette-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        var tests = 0
        try run("solid color", &tests) {
            let url = directory.appendingPathComponent("solid.png")
            try png([255, 0, 0, 255], width: 1, height: 1).write(to: url)
            let tags = try PaletteExtractor.extract(inputURL: url)
            try expect(tags == [PaletteTag(hex: "#FF0000", rgb: [255, 0, 0], weight: 1)], "solid palette")
        }
        try run("two colors and normalized weights", &tests) {
            let url = directory.appendingPathComponent("two.png")
            try png([255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255], width: 3, height: 1).write(to: url)
            let tags = try PaletteExtractor.extract(inputURL: url)
            try expect(tags.count == 2, "two tags")
            try expect(tags[0].hex == "#0000FF" && tags[0].weight == 2.0 / 3.0, "blue first")
            try expect(tags[1].hex == "#FF0000" && tags[1].weight == 1.0 / 3.0, "red second")
            try expect(abs(tags.reduce(0) { $0 + $1.weight } - 1) < 0.001, "weights sum")
        }
        try run("transparent pixels excluded and alpha weighted", &tests) {
            let url = directory.appendingPathComponent("transparent.png")
            try png([0, 0, 0, 0, 0, 0, 255, 255, 128, 0, 0, 128], width: 3, height: 1).write(to: url)
            let tags = try PaletteExtractor.extract(inputURL: url)
            try expect(tags.count == 2, "transparent pixel excluded")
            try expect(tags[0].hex == "#0000FF" && abs(tags[0].weight - 2.0 / 3.0) < 0.01, "opaque blue weight: \(tags)")
            try expect(tags[1].hex == "#FF0000" && abs(tags[1].weight - 1.0 / 3.0) < 0.01, "half-transparent red weight: \(tags)")
        }
        try run("EXIF orientation and sRGB decode", &tests) {
            let url = directory.appendingPathComponent("oriented.jpg")
            try orientedJPEG(width: 32, height: 20).write(to: url)
            let tags = try PaletteExtractor.extract(inputURL: url)
            try expect(!tags.isEmpty && tags.allSatisfy { $0.hex.hasPrefix("#") }, "oriented image decoded")
        }
        try run("repeatability and bounds", &tests) {
            let url = directory.appendingPathComponent("pattern.png")
            try png(pattern(width: 320, height: 160), width: 320, height: 160).write(to: url)
            let first = try PaletteExtractor.extract(inputURL: url)
            let second = try PaletteExtractor.extract(inputURL: url)
            try expect(first == second, "repeatable")
            try expect((1...5).contains(first.count), "tag count")
            try expect(first.allSatisfy { $0.rgb.count == 3 && $0.rgb.allSatisfy { (0...255).contains($0) } && $0.weight > 0 && $0.weight <= 1 }, "tag range")
            try expect(abs(first.reduce(0) { $0 + $1.weight } - 1) < 0.001, "repeat weights sum")
        }
        print("PASS \(tests) palette tests")
    }
}

private struct TestFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

private func run(_ name: String, _ count: inout Int, _ body: () throws -> Void) throws {
    try body(); count += 1; print("PASS \(name)")
}

private func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !condition() { throw TestFailure(message) }
}

private func png(_ rgba: [UInt8], width: Int, height: Int) throws -> Data {
    guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let space = CGColorSpace(name: CGColorSpace.sRGB),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                              bytesPerRow: width * 4, space: space,
                              bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    else { throw TestFailure("could not make image") }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
        throw TestFailure("could not make PNG")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("could not write PNG") }
    return data as Data
}

private func orientedJPEG(width: Int, height: Int) throws -> Data {
    let rgba = pattern(width: width, height: height)
    guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let space = CGColorSpace(name: CGColorSpace.sRGB),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                              bytesPerRow: width * 4, space: space,
                              bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    else { throw TestFailure("could not make JPEG image") }
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw TestFailure("could not make JPEG")
    }
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: 6] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw TestFailure("could not write JPEG") }
    return data as Data
}

private func pattern(width: Int, height: Int) -> [UInt8] {
    var rgba = [UInt8](repeating: 255, count: width * height * 4)
    for y in 0..<height {
        for x in 0..<width {
            let index = (y * width + x) * 4
            rgba[index] = UInt8((x * 19 + y * 3) % 256)
            rgba[index + 1] = UInt8((x * 7 + y * 17) % 256)
            rgba[index + 2] = UInt8((x * 11 + y * 13) % 256)
        }
    }
    return rgba
}
