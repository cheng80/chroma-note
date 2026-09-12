import CoreGraphics
import CoreML
import Foundation
import ImageIO
import UniformTypeIdentifiers

public struct LineArtOptions {
    public var maxEdge: Int
    public var lineGain: Double

    public init(maxEdge: Int = 1024, lineGain: Double = 1.8) {
        self.maxEdge = maxEdge
        self.lineGain = lineGain
    }
}

public struct LineArtResult {
    public let width: Int
    public let height: Int
    public let bytes: Int
    public let durationMs: Double
}

public enum LineArtError: String, Error, LocalizedError, Equatable {
    case invalidOptions = "invalid_options"
    case invalidInput = "invalid_input"
    case inputTooLarge = "input_too_large"
    case imageTooLarge = "image_too_large"
    case imageTooSmall = "image_too_small"
    case decodeFailed = "decode_failed"
    case modelFailed = "model_failed"
    case invalidPrediction = "invalid_prediction"
    case invalidOutput = "invalid_output"
    case outputExists = "output_exists"
    case outputTooLarge = "output_too_large"
    case cancelled = "cancelled"

    public var code: String { rawValue }

    public var errorDescription: String? {
        switch self {
        case .invalidOptions: "선화 변환 옵션이 올바르지 않습니다."
        case .invalidInput: "입력 이미지를 읽을 수 없습니다."
        case .inputTooLarge: "입력 이미지는 30MiB 이하여야 합니다."
        case .imageTooLarge: "입력 이미지는 5천만 픽셀 이하여야 합니다."
        case .imageTooSmall: "변환할 이미지의 각 축은 16픽셀 이상이어야 합니다."
        case .decodeFailed: "입력 이미지를 디코딩하지 못했습니다."
        case .modelFailed: "선화 모델을 실행하지 못했습니다."
        case .invalidPrediction: "선화 모델이 올바르지 않은 결과를 반환했습니다."
        case .invalidOutput: "출력 위치를 사용할 수 없습니다."
        case .outputExists: "출력 파일이 이미 존재합니다."
        case .outputTooLarge: "출력 PNG는 5MiB 이하여야 합니다."
        case .cancelled: "선화 변환이 취소되었습니다."
        }
    }
}

public final class LineArtEngine {
    private static let maxInputBytes = 30 * 1024 * 1024
    private static let maxPixels = 50_000_000
    private static let maxOutputBytes = 5 * 1024 * 1024

    private let model: MLModel

    public init(modelURL: URL) throws {
        let configuration = MLModelConfiguration()
        // The range-shaped model fails with .all on A16/iOS 26; CPU/GPU preserves its native aspect ratio.
        configuration.computeUnits = .cpuAndGPU
        do {
            model = try MLModel(contentsOf: modelURL, configuration: configuration)
        } catch {
            throw LineArtError.modelFailed
        }
    }

    public func convert(
        inputURL: URL,
        outputURL: URL,
        options: LineArtOptions = LineArtOptions(),
        isCancelled: () -> Bool = { false }
    ) throws -> LineArtResult {
        let started = ProcessInfo.processInfo.systemUptime
        try validate(options)
        try checkCancellation(isCancelled)
        try validateOutput(inputURL: inputURL, outputURL: outputURL)

        let source = try imageSource(inputURL)
        let dimensions = try sourceDimensions(source)
        try checkCancellation(isCancelled)

        let photo = try decode(source, dimensions: dimensions, maxEdge: options.maxEdge)
        try checkCancellation(isCancelled)

        let input = try tensor(photo)
        try checkCancellation(isCancelled)

        let prediction: MLMultiArray
        do {
            let provider = try MLDictionaryFeatureProvider(dictionary: ["image": input])
            let output = try model.prediction(from: provider)
            guard let line = output.featureValue(for: "line")?.multiArrayValue else {
                throw LineArtError.invalidPrediction
            }
            prediction = line
        } catch let error as LineArtError {
            throw error
        } catch {
            throw LineArtError.modelFailed
        }
        try checkCancellation(isCancelled)

        let rgba = try colorize(prediction, photo: photo, gain: options.lineGain)
        try checkCancellation(isCancelled)

        let data = try png(rgba, width: photo.width, height: photo.height)
        guard data.count <= Self.maxOutputBytes else { throw LineArtError.outputTooLarge }
        try checkCancellation(isCancelled)

        try writeAtomically(data, to: outputURL)
        return LineArtResult(
            width: photo.width,
            height: photo.height,
            bytes: data.count,
            durationMs: (ProcessInfo.processInfo.systemUptime - started) * 1_000
        )
    }

    private func validate(_ options: LineArtOptions) throws {
        guard (16...1536).contains(options.maxEdge),
              options.lineGain.isFinite,
              (0.1...4).contains(options.lineGain)
        else { throw LineArtError.invalidOptions }
    }

    private func checkCancellation(_ isCancelled: () -> Bool) throws {
        if isCancelled() { throw LineArtError.cancelled }
    }

    private func validateOutput(inputURL: URL, outputURL: URL) throws {
        guard inputURL.isFileURL, outputURL.isFileURL else { throw LineArtError.invalidOutput }
        let input = inputURL.resolvingSymlinksInPath().standardizedFileURL
        let parent = outputURL.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
        let output = parent.appendingPathComponent(outputURL.lastPathComponent).standardizedFileURL
        guard input != output, outputURL.pathExtension.lowercased() == "png" else {
            throw LineArtError.invalidOutput
        }
        guard !FileManager.default.fileExists(atPath: outputURL.path) else {
            throw LineArtError.outputExists
        }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: parent.path, isDirectory: &isDirectory),
              isDirectory.boolValue,
              FileManager.default.isWritableFile(atPath: parent.path)
        else { throw LineArtError.invalidOutput }
    }

    private func imageSource(_ inputURL: URL) throws -> CGImageSource {
        guard inputURL.isFileURL else { throw LineArtError.invalidInput }
        let values: URLResourceValues
        do {
            values = try inputURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        } catch {
            throw LineArtError.invalidInput
        }
        guard values.isRegularFile == true, FileManager.default.isReadableFile(atPath: inputURL.path) else {
            throw LineArtError.invalidInput
        }
        guard let size = values.fileSize else { throw LineArtError.invalidInput }
        guard size <= Self.maxInputBytes else { throw LineArtError.inputTooLarge }
        guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source),
              let imageType = UTType(type as String),
              imageType.conforms(to: .jpeg) || imageType.conforms(to: .png) || imageType.conforms(to: .heic)
        else { throw LineArtError.invalidInput }
        return source
    }

    private func sourceDimensions(_ source: CGImageSource) throws -> (width: Int, height: Int) {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
              width > 0,
              height > 0
        else { throw LineArtError.decodeFailed }
        guard width <= Self.maxPixels / height else { throw LineArtError.imageTooLarge }
        return (width, height)
    }

    private func decode(
        _ source: CGImageSource,
        dimensions: (width: Int, height: Int),
        maxEdge: Int
    ) throws -> Photo {
        let pixelSize = min(maxEdge, max(dimensions.width, dimensions.height))
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: pixelSize,
            kCGImageSourceShouldCacheImmediately: true,
        ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options),
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)
        else { throw LineArtError.decodeFailed }
        guard image.width >= 16, image.height >= 16 else { throw LineArtError.imageTooSmall }

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
            context.setFillColor(CGColor(gray: 1, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: image.width, height: image.height))
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        guard drewImage else { throw LineArtError.decodeFailed }
        return Photo(width: image.width, height: image.height, rgba: rgba)
    }

    private func tensor(_ photo: Photo) throws -> MLMultiArray {
        let height = (photo.height + 3) / 4 * 4
        let width = (photo.width + 3) / 4 * 4
        let result: MLMultiArray
        do {
            result = try MLMultiArray(
                shape: [1, 3, NSNumber(value: height), NSNumber(value: width)],
                dataType: .float32
            )
        } catch {
            throw LineArtError.modelFailed
        }
        let pointer = result.dataPointer.assumingMemoryBound(to: Float.self)
        let strides = result.strides.map(\.intValue)
        for y in 0..<height {
            for x in 0..<width {
                let offset = (reflected(y, photo.height) * photo.width + reflected(x, photo.width)) * 4
                for channel in 0..<3 {
                    pointer[channel * strides[1] + y * strides[2] + x * strides[3]] = Float(photo.rgba[offset + channel]) / 255
                }
            }
        }
        return result
    }

    private func colorize(_ output: MLMultiArray, photo: Photo, gain: Double) throws -> [UInt8] {
        let height = (photo.height + 3) / 4 * 4
        let width = (photo.width + 3) / 4 * 4
        guard output.dataType == .float32,
              output.shape.map(\.intValue) == [1, 1, height, width]
        else { throw LineArtError.invalidPrediction }

        let pointer = output.dataPointer.assumingMemoryBound(to: Float.self)
        let strides = output.strides.map(\.intValue)
        var rgba = [UInt8](repeating: 255, count: photo.width * photo.height * 4)
        for y in 0..<photo.height {
            for x in 0..<photo.width {
                let index = y * photo.width + x
                let value = pointer[y * strides[2] + x * strides[3]]
                guard value.isFinite, value >= 0, value <= 1 else {
                    throw LineArtError.invalidPrediction
                }
                let gray = UInt8((value * 255).rounded(.toNearestOrEven))
                let alpha = min(255, Int((Double(255 - Int(gray)) * gain).rounded(.toNearestOrEven)))
                for channel in 0..<3 {
                    let color = Int(photo.rgba[index * 4 + channel])
                    rgba[index * 4 + channel] = UInt8((color * alpha + 255 * (255 - alpha) + 127) / 255)
                }
            }
        }
        return rgba
    }

    private func png(_ rgba: [UInt8], width: Int, height: Int) throws -> Data {
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let image = CGImage(
                  width: width,
                  height: height,
                  bitsPerComponent: 8,
                  bitsPerPixel: 32,
                  bytesPerRow: width * 4,
                  space: colorSpace,
                  bitmapInfo: CGBitmapInfo(
                      rawValue: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
                  ),
                  provider: provider,
                  decode: nil,
                  shouldInterpolate: false,
                  intent: .defaultIntent
              )
        else { throw LineArtError.invalidOutput }

        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
            throw LineArtError.invalidOutput
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw LineArtError.invalidOutput }
        return data as Data
    }

    private func writeAtomically(_ data: Data, to outputURL: URL) throws {
        let temporaryURL = outputURL.deletingLastPathComponent()
            .appendingPathComponent(".line-art-\(UUID().uuidString).tmp")
        defer { try? FileManager.default.removeItem(at: temporaryURL) }
        do {
            try data.write(to: temporaryURL, options: .withoutOverwriting)
            try FileManager.default.linkItem(at: temporaryURL, to: outputURL)
        } catch {
            if FileManager.default.fileExists(atPath: outputURL.path) {
                throw LineArtError.outputExists
            }
            throw LineArtError.invalidOutput
        }
    }
}

private struct Photo {
    let width: Int
    let height: Int
    let rgba: [UInt8]
}

private func reflected(_ index: Int, _ count: Int) -> Int {
    index < count ? index : 2 * count - 2 - index
}
