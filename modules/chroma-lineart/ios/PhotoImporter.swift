import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct PhotoImportResult {
    let uri: String
    let width: Int
    let height: Int
    let bytes: Int
    let capturedDate: String?
}

enum PhotoImporterError: String, Error, LocalizedError {
    case invalidInput = "photo_invalid_input"
    case inputTooLarge = "photo_input_too_large"
    case imageTooLarge = "photo_image_too_large"
    case decodeFailed = "photo_decode_failed"
    case invalidOutput = "photo_invalid_output"
    case outputFailed = "photo_output_failed"

    var errorDescription: String? { rawValue }
}

enum PhotoImporter {
    private static let maxInputBytes = 150 * 1024 * 1024
    private static let maxPixels = 250_000_000
    private static let maxEdge = 2048

    static func normalize(inputURL: URL, outputDirectory: URL) throws -> PhotoImportResult {
        try validateInput(inputURL)
        try validateOutputDirectory(outputDirectory)

        let id = UUID().uuidString
        let output = outputDirectory.appendingPathComponent("photo-\(id).jpg")

        do {
            return try autoreleasepool {
                let source = try imageSource(inputURL)
                let dimensions = try sourceDimensions(source)
                let capturedDate = captureDate(source)
                let image = try thumbnail(source, dimensions: dimensions)
                try encodeJPEG(image, to: output)
                let bytes = try output.resourceValues(forKeys: [.fileSizeKey]).fileSize
                guard let bytes, bytes > 0 else { throw PhotoImporterError.outputFailed }
                return PhotoImportResult(uri: output.absoluteString, width: image.width, height: image.height,
                                         bytes: bytes, capturedDate: capturedDate)
            }
        } catch {
            try? FileManager.default.removeItem(at: output)
            throw error
        }
    }

    private static func validateInput(_ url: URL) throws {
        guard url.isFileURL else { throw PhotoImporterError.invalidInput }
        let values: URLResourceValues
        do {
            values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        } catch {
            throw PhotoImporterError.invalidInput
        }
        guard values.isRegularFile == true, FileManager.default.isReadableFile(atPath: url.path),
              let bytes = values.fileSize else { throw PhotoImporterError.invalidInput }
        guard bytes <= maxInputBytes else { throw PhotoImporterError.inputTooLarge }
    }

    private static func validateOutputDirectory(_ url: URL) throws {
        let values: URLResourceValues
        do {
            values = try url.resourceValues(forKeys: [.isDirectoryKey])
        } catch {
            throw PhotoImporterError.invalidOutput
        }
        guard url.isFileURL, values.isDirectory == true,
              FileManager.default.isWritableFile(atPath: url.path) else {
            throw PhotoImporterError.invalidOutput
        }
    }

    private static func imageSource(_ url: URL) throws -> CGImageSource {
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(url as CFURL, options),
              CGImageSourceGetCount(source) == 1,
              let identifier = CGImageSourceGetType(source),
              let type = UTType(identifier as String),
              type.conforms(to: .jpeg) || type.conforms(to: .png) || type.conforms(to: .heic)
        else { throw PhotoImporterError.invalidInput }
        return source
    }

    private static func sourceDimensions(_ source: CGImageSource) throws -> (width: Int, height: Int) {
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, options) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
              width > 0, height > 0 else { throw PhotoImporterError.decodeFailed }
        try validateDimensions(width: width, height: height)
        return (width, height)
    }

    static func validateDimensions(width: Int, height: Int) throws {
        guard width > 0, height > 0 else { throw PhotoImporterError.decodeFailed }
        guard width <= maxPixels / height else { throw PhotoImporterError.imageTooLarge }
    }

    private static func thumbnail(
        _ source: CGImageSource,
        dimensions: (width: Int, height: Int)
    ) throws -> CGImage {
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: min(maxEdge, max(dimensions.width, dimensions.height)),
            kCGImageSourceShouldCache: false,
            kCGImageSourceShouldCacheImmediately: false,
        ] as CFDictionary
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options),
              thumbnail.width > 0, thumbnail.height > 0,
              thumbnail.width <= maxEdge, thumbnail.height <= maxEdge,
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
            throw PhotoImporterError.decodeFailed
        }

        let bytesPerRow = thumbnail.width * 4
        guard let context = CGContext(data: nil, width: thumbnail.width, height: thumbnail.height,
                                      bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: colorSpace,
                                      bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue |
                                        CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw PhotoImporterError.decodeFailed
        }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: thumbnail.width, height: thumbnail.height))
        context.draw(thumbnail, in: CGRect(x: 0, y: 0, width: thumbnail.width, height: thumbnail.height))
        guard let flattened = context.makeImage() else { throw PhotoImporterError.decodeFailed }
        return flattened
    }

    private static func encodeJPEG(_ image: CGImage, to url: URL) throws {
        guard !FileManager.default.fileExists(atPath: url.path),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
        else { throw PhotoImporterError.invalidOutput }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw PhotoImporterError.outputFailed }
    }

    private static func captureDate(_ source: CGImageSource) -> String? {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary) as? [CFString: Any] else {
            return nil
        }
        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        for raw in [exif?[kCGImagePropertyExifDateTimeOriginal], exif?[kCGImagePropertyExifDateTimeDigitized],
                    tiff?[kCGImagePropertyTIFFDateTime]] {
            guard let value = raw as? String else { continue }
            let parts = value.prefix(10).split(separator: ":")
            guard parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { continue }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(secondsFromGMT: 0)!
            let components = DateComponents(year: year, month: month, day: day)
            guard let date = calendar.date(from: components),
                  calendar.dateComponents([.year, .month, .day], from: date) == components else { continue }
            return String(format: "%04d-%02d-%02d", year, month, day)
        }
        return nil
    }
}
