import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

public struct PaletteTag: Equatable {
    public let hex: String
    public let rgb: [Int]
    public let weight: Double

    public init(hex: String, rgb: [Int], weight: Double) {
        self.hex = hex
        self.rgb = rgb
        self.weight = weight
    }
}

public enum PaletteExtractorError: String, Error, LocalizedError {
    case invalidInput = "palette_invalid_input"
    case inputTooLarge = "palette_input_too_large"
    case imageTooLarge = "palette_image_too_large"
    case decodeFailed = "palette_decode_failed"
    case noVisiblePixels = "palette_no_visible_pixels"

    public var errorDescription: String? { rawValue }
}

/** Deterministic candidate only; final palette quality selection remains separate. */
public enum PaletteExtractor {
    public static let algorithmVersion = "rgb-bin-v1"

    private static let maxInputBytes = 30 * 1024 * 1024
    private static let maxPixels = 50_000_000
    private static let analysisEdge = 256

    public static func extract(inputURL: URL) throws -> [PaletteTag] {
        let source = try imageSource(inputURL)
        let dimensions = try sourceDimensions(source)
        let rgba = try decode(source, dimensions: dimensions)

        var buckets: [Int: Bucket] = [:]
        for offset in stride(from: 0, to: rgba.count, by: 4) {
            let alphaByte = rgba[offset + 3]
            guard alphaByte > 0 else { continue }
            let alpha = Double(alphaByte) / 255
            let rgb = [
                unpremultiply(rgba[offset], alpha: alphaByte),
                unpremultiply(rgba[offset + 1], alpha: alphaByte),
                unpremultiply(rgba[offset + 2], alpha: alphaByte),
            ]
            let key = (rgb[0] >> 4) << 8 | (rgb[1] >> 4) << 4 | (rgb[2] >> 4)
            var bucket = buckets[key] ?? Bucket()
            bucket.add(rgb, weight: alpha)
            buckets[key] = bucket
        }
        guard !buckets.isEmpty else { throw PaletteExtractorError.noVisiblePixels }

        let orderedBuckets = buckets.keys.sorted().compactMap { buckets[$0] }
        let seeds = orderedBuckets.sorted(by: bucketOrder).prefix(5).map { $0.meanRGB }
        var clusters = Array(repeating: Bucket(), count: seeds.count)
        for bucket in orderedBuckets {
            let index = nearestSeed(for: bucket.meanRGB, seeds: seeds)
            clusters[index].merge(bucket)
        }

        let totalWeight = clusters.reduce(0) { $0 + $1.weight }
        let tags = clusters.compactMap { cluster -> PaletteTag? in
            guard cluster.weight > 0 else { return nil }
            let rgb = cluster.meanRGB
            return PaletteTag(hex: hex(rgb), rgb: rgb, weight: cluster.weight / totalWeight)
        }
        return tags.sorted { left, right in
            left.weight == right.weight ? left.hex < right.hex : left.weight > right.weight
        }
    }

    private static func imageSource(_ inputURL: URL) throws -> CGImageSource {
        guard inputURL.isFileURL else { throw PaletteExtractorError.invalidInput }
        let values: URLResourceValues
        do {
            values = try inputURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        } catch {
            throw PaletteExtractorError.invalidInput
        }
        guard values.isRegularFile == true, FileManager.default.isReadableFile(atPath: inputURL.path),
              let size = values.fileSize else { throw PaletteExtractorError.invalidInput }
        guard size <= maxInputBytes else { throw PaletteExtractorError.inputTooLarge }
        guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source),
              let imageType = UTType(type as String),
              imageType.conforms(to: .jpeg) || imageType.conforms(to: .png) || imageType.conforms(to: .heic)
        else { throw PaletteExtractorError.invalidInput }
        return source
    }

    private static func sourceDimensions(_ source: CGImageSource) throws -> (width: Int, height: Int) {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
              width > 0, height > 0
        else { throw PaletteExtractorError.decodeFailed }
        guard width <= maxPixels / height else { throw PaletteExtractorError.imageTooLarge }
        return (width, height)
    }

    private static func decode(_ source: CGImageSource, dimensions: (width: Int, height: Int)) throws -> [UInt8] {
        let pixelSize = min(analysisEdge, max(dimensions.width, dimensions.height))
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: pixelSize,
            kCGImageSourceShouldCacheImmediately: true,
        ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options),
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)
        else { throw PaletteExtractorError.decodeFailed }

        var rgba = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let drewImage = rgba.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(
                data: raw.baseAddress,
                width: image.width,
                height: image.height,
                bitsPerComponent: 8,
                bytesPerRow: image.width * 4,
                space: colorSpace,
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        guard drewImage else { throw PaletteExtractorError.decodeFailed }
        return rgba
    }

    private static func nearestSeed(for rgb: [Int], seeds: [[Int]]) -> Int {
        var winner = 0
        var bestDistance = Int.max
        for (index, seed) in seeds.enumerated() {
            let distance = zip(rgb, seed).reduce(0) { $0 + ($1.0 - $1.1) * ($1.0 - $1.1) }
            if distance < bestDistance {
                winner = index
                bestDistance = distance
            }
        }
        return winner
    }

    private static func bucketOrder(_ left: Bucket, _ right: Bucket) -> Bool {
        left.weight == right.weight ? hex(left.meanRGB) < hex(right.meanRGB) : left.weight > right.weight
    }

    private static func unpremultiply(_ value: UInt8, alpha: UInt8) -> Int {
        min(255, Int((Double(value) * 255 / Double(alpha)).rounded(.toNearestOrEven)))
    }

    private static func hex(_ rgb: [Int]) -> String {
        String(format: "#%02X%02X%02X", rgb[0], rgb[1], rgb[2])
    }
}

private struct Bucket {
    var weight = 0.0
    var red = 0.0
    var green = 0.0
    var blue = 0.0

    mutating func add(_ rgb: [Int], weight: Double) {
        self.weight += weight
        red += Double(rgb[0]) * weight
        green += Double(rgb[1]) * weight
        blue += Double(rgb[2]) * weight
    }

    mutating func merge(_ other: Bucket) {
        weight += other.weight
        red += other.red
        green += other.green
        blue += other.blue
    }

    var meanRGB: [Int] {
        [red, green, blue].map { Int(($0 / weight).rounded(.toNearestOrEven)) }
    }
}
