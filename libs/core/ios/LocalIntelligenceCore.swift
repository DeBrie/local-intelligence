import Foundation
import React
import CommonCrypto
import Metal

@objc(LocalIntelligenceCore)
class LocalIntelligenceCore: RCTEventEmitter {
    
    private var config: CoreConfig?
    private var modelCache: [String: ModelStatus] = [:]
    private var activeDownloads: [String: URLSessionDownloadTask] = [:]
    private var hasListeners = false
    
    override init() {
        super.init()
    }
    
    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override func supportedEvents() -> [String]! {
        return ["LocalIntelligenceDownloadProgress", "LocalIntelligenceModelDownloaded"]
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    @objc(initialize:withResolver:withRejecter:)
    func initialize(configJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        do {
            guard let data = configJson.data(using: .utf8) else {
                reject("INVALID_CONFIG", "Invalid config JSON", nil)
                return
            }
            
            let decoder = JSONDecoder()
            config = try decoder.decode(CoreConfig.self, from: data)
            
            setupCacheDirectory()
            
            resolve(true)
        } catch {
            reject("INIT_ERROR", "Failed to initialize: \(error.localizedDescription)", error)
        }
    }
    
    @objc(getDeviceCapabilities:withRejecter:)
    func getDeviceCapabilities(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let capabilities = DeviceCapabilities(
            platform: "ios",
            osVersion: UIDevice.current.systemVersion,
            hasNPU: checkNPUAvailability(),
            hasGPU: true,
            ramGB: getDeviceRAM(),
            supportsFoundationModels: checkFoundationModelsSupport(),
            supportedDelegates: getSupportedDelegates()
        )
        
        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(capabilities)
            let json = String(data: data, encoding: .utf8)
            resolve(json)
        } catch {
            reject("ENCODE_ERROR", "Failed to encode capabilities", error)
        }
    }
    
    @objc(getModelStatus:withResolver:withRejecter:)
    func getModelStatus(modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let status: ModelStatus
        
        if let cachedStatus = modelCache[modelId] {
            status = cachedStatus
        } else if let path = getModelPath(modelId: modelId), FileManager.default.fileExists(atPath: path) {
            let fileSize = getFileSize(path: path)
            status = ModelStatus(state: "ready", progress: nil, sizeBytes: fileSize, path: path, message: nil)
            modelCache[modelId] = status
        } else if activeDownloads[modelId] != nil {
            status = ModelStatus(state: "downloading", progress: 0, sizeBytes: nil, path: nil, message: nil)
        } else {
            status = ModelStatus(state: "not_downloaded", progress: nil, sizeBytes: nil, path: nil, message: nil)
        }
        
        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(status)
            let json = String(data: data, encoding: .utf8)
            resolve(json)
        } catch {
            reject("ENCODE_ERROR", "Failed to encode status", error)
        }
    }
    
    @objc(downloadModel:withResolver:withRejecter:)
    func downloadModel(modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let config = config else {
            reject("NOT_INITIALIZED", "Core not initialized", nil)
            return
        }
        
        let cdnBaseUrl = config.cdnBaseUrl ?? "https://cdn.localintelligence.dev/models"
        
        // First fetch metadata to determine model format
        let metadataUrlString = "\(cdnBaseUrl)/\(modelId)/latest/metadata.json"
        guard let metadataUrl = URL(string: metadataUrlString) else {
            reject("INVALID_URL", "Invalid metadata URL", nil)
            return
        }
        
        URLSession.shared.dataTask(with: metadataUrl) { [weak self] data, response, error in
            guard let self = self else { return }
            
            if let error = error {
                reject("METADATA_ERROR", "Failed to fetch metadata: \(error.localizedDescription)", error)
                return
            }
            
            guard let data = data,
                  let metadata = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                reject("METADATA_ERROR", "Failed to parse metadata", nil)
                return
            }
            
            // Determine file name based on format - iOS uses ONNX via CoreML or direct ONNX
            let format = metadata["format"] as? String ?? "onnx"
            let fileName: String
            let fileExtension: String
            
            switch format {
            case "coreml":
                fileName = "ios.mlmodelc.zip"
                fileExtension = ".mlmodelc"
            case "onnx":
                fileName = "model.onnx"
                fileExtension = ".onnx"
            default:
                fileName = "model.onnx"
                fileExtension = ".onnx"
            }
            
            let urlString = "\(cdnBaseUrl)/\(modelId)/latest/\(fileName)"
            guard let url = URL(string: urlString) else {
                reject("INVALID_URL", "Invalid download URL", nil)
                return
            }
            
            let expectedSize = metadata["size_bytes"] as? Int64 ?? 0
            let expectedChecksum = metadata["sha256"] as? String
            let delegate = DownloadDelegate(
                core: self,
                modelId: modelId,
                format: format,
                fileExtension: fileExtension,
                expectedSize: expectedSize,
                expectedChecksum: expectedChecksum,
                metadata: metadata,
                resolve: resolve,
                reject: reject
            )
            
            let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
            let task = session.downloadTask(with: url)
            
            self.activeDownloads[modelId] = task
            task.resume()
            
            // Also download vocab.txt if available
            let vocabUrlString = "\(cdnBaseUrl)/\(modelId)/latest/vocab.txt"
            if let vocabUrl = URL(string: vocabUrlString) {
                URLSession.shared.dataTask(with: vocabUrl) { vocabData, _, _ in
                    if let vocabData = vocabData,
                       let cacheDir = self.getCacheDirectory() {
                        let vocabPath = (cacheDir as NSString).appendingPathComponent("\(modelId).vocab.txt")
                        try? vocabData.write(to: URL(fileURLWithPath: vocabPath))
                    }
                }.resume()
            }
        }.resume()
    }
    
    @objc(cancelDownload:withResolver:withRejecter:)
    func cancelDownload(modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if let task = activeDownloads[modelId] {
            task.cancel()
            activeDownloads.removeValue(forKey: modelId)
            resolve(true)
        } else {
            resolve(false)
        }
    }
    
    @objc(deleteModel:withResolver:withRejecter:)
    func deleteModel(modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let path = getModelPath(modelId: modelId) else {
            resolve(false)
            return
        }
        
        do {
            try FileManager.default.removeItem(atPath: path)
            modelCache.removeValue(forKey: modelId)
            resolve(true)
        } catch {
            reject("DELETE_ERROR", "Failed to delete model", error)
        }
    }
    
    @objc(clearModelCache:withRejecter:)
    func clearModelCache(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let cacheDir = getCacheDirectory() else {
            reject("CACHE_ERROR", "Cache directory not found", nil)
            return
        }
        
        do {
            let contents = try FileManager.default.contentsOfDirectory(atPath: cacheDir)
            for item in contents {
                let itemPath = (cacheDir as NSString).appendingPathComponent(item)
                try FileManager.default.removeItem(atPath: itemPath)
            }
            modelCache.removeAll()
            resolve(true)
        } catch {
            reject("CLEAR_ERROR", "Failed to clear cache", error)
        }
    }
    
    @objc(getCacheSize:withRejecter:)
    func getCacheSize(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let cacheDir = getCacheDirectory() else {
            resolve(0)
            return
        }
        
        var totalSize: Int64 = 0
        
        if let enumerator = FileManager.default.enumerator(atPath: cacheDir) {
            while let file = enumerator.nextObject() as? String {
                let filePath = (cacheDir as NSString).appendingPathComponent(file)
                if let attrs = try? FileManager.default.attributesOfItem(atPath: filePath),
                   let size = attrs[.size] as? Int64 {
                    totalSize += size
                }
            }
        }
        
        resolve(NSNumber(value: totalSize))
    }
    
    func sendDownloadProgress(modelId: String, bytesDownloaded: Int64, totalBytes: Int64) {
        guard hasListeners else { return }
        
        let progress = totalBytes > 0 ? Double(bytesDownloaded) / Double(totalBytes) : 0
        
        sendEvent(withName: "LocalIntelligenceDownloadProgress", body: [
            "modelId": modelId,
            "bytesDownloaded": bytesDownloaded,
            "totalBytes": totalBytes,
            "progress": progress
        ])
    }
    
    func handleDownloadComplete(modelId: String, location: URL, format: String, fileExtension: String, expectedSize: Int64, expectedChecksum: String?, metadata: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        activeDownloads.removeValue(forKey: modelId)
        
        guard let cacheDir = getCacheDirectory() else {
            reject("DOWNLOAD_ERROR", "Failed to get cache directory", nil)
            return
        }
        
        let destPath = (cacheDir as NSString).appendingPathComponent("\(modelId)\(fileExtension)")
        
        do {
            let destURL = URL(fileURLWithPath: destPath)
            let destDir = destURL.deletingLastPathComponent()
            
            if !FileManager.default.fileExists(atPath: destDir.path) {
                try FileManager.default.createDirectory(at: destDir, withIntermediateDirectories: true)
            }
            
            if FileManager.default.fileExists(atPath: destPath) {
                try FileManager.default.removeItem(atPath: destPath)
            }
            
            try FileManager.default.moveItem(at: location, to: destURL)
            
            // Validate file size
            let actualSize = getFileSize(path: destPath)
            if expectedSize > 0 && actualSize != expectedSize {
                try FileManager.default.removeItem(atPath: destPath)
                reject("DOWNLOAD_ERROR", "Model file size mismatch: expected \(expectedSize) bytes, got \(actualSize) bytes", nil)
                return
            }
            
            if actualSize < 1024 {
                try FileManager.default.removeItem(atPath: destPath)
                reject("DOWNLOAD_ERROR", "Downloaded model file is too small: \(actualSize) bytes", nil)
                return
            }
            
            // Verify checksum if provided
            if let expected = expectedChecksum {
                let actualChecksum = sha256Hash(fileAt: destURL)
                if actualChecksum != expected.lowercased() {
                    try FileManager.default.removeItem(atPath: destPath)
                    reject("DOWNLOAD_ERROR", "Checksum verification failed: expected \(expected), got \(actualChecksum ?? "nil")", nil)
                    return
                }
            }
            
            // Save metadata locally
            let metadataPath = (cacheDir as NSString).appendingPathComponent("\(modelId).metadata.json")
            if let metadataData = try? JSONSerialization.data(withJSONObject: metadata) {
                try metadataData.write(to: URL(fileURLWithPath: metadataPath))
            }
            
            let status = ModelStatus(state: "ready", progress: nil, sizeBytes: actualSize, path: destPath, message: nil)
            modelCache[modelId] = status
            
            // Emit model downloaded event
            if hasListeners {
                sendEvent(withName: "LocalIntelligenceModelDownloaded", body: [
                    "modelId": modelId,
                    "path": destPath,
                    "format": format
                ])
            }
            
            resolve("{\"path\": \"\(destPath)\", \"format\": \"\(format)\"}")
        } catch {
            reject("DOWNLOAD_ERROR", error.localizedDescription, error)
        }
    }
    
    private func sha256Hash(fileAt url: URL) -> String? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return hash.map { String(format: "%02x", $0) }.joined()
    }
    
    func handleDownloadError(modelId: String, error: Error, reject: @escaping RCTPromiseRejectBlock) {
        activeDownloads.removeValue(forKey: modelId)
        reject("DOWNLOAD_ERROR", error.localizedDescription, error)
    }
    
    private func setupCacheDirectory() {
        guard let cacheDir = getCacheDirectory() else { return }
        
        if !FileManager.default.fileExists(atPath: cacheDir) {
            try? FileManager.default.createDirectory(atPath: cacheDir, withIntermediateDirectories: true)
        }
    }
    
    private func getCacheDirectory() -> String? {
        if let customDir = config?.modelCacheDir {
            return customDir
        }
        
        guard let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        
        return documentsDir.appendingPathComponent("local_intelligence_models").path
    }
    
    private func getModelPath(modelId: String) -> String? {
        guard let cacheDir = getCacheDirectory() else { return nil }
        
        // Check for different formats in cache
        let onnxPath = (cacheDir as NSString).appendingPathComponent("\(modelId).onnx")
        if FileManager.default.fileExists(atPath: onnxPath) {
            return onnxPath
        }
        
        let mlmodelPath = (cacheDir as NSString).appendingPathComponent("\(modelId).mlmodel")
        if FileManager.default.fileExists(atPath: mlmodelPath) {
            return mlmodelPath
        }
        
        // Check for bundled model and extract if available
        if let bundledPath = extractBundledModelIfExists(modelId: modelId) {
            return bundledPath
        }
        
        // Default to onnx for new downloads
        return onnxPath
    }
    
    private func extractBundledModelIfExists(modelId: String) -> String? {
        guard let cacheDir = getCacheDirectory() else { return nil }
        
        let extensions = ["onnx", "mlmodel"]
        for ext in extensions {
            if let bundledURL = Bundle.main.url(forResource: modelId, withExtension: ext, subdirectory: "models") {
                let destPath = (cacheDir as NSString).appendingPathComponent("\(modelId).\(ext)")
                let destURL = URL(fileURLWithPath: destPath)
                
                do {
                    if FileManager.default.fileExists(atPath: destPath) {
                        try FileManager.default.removeItem(atPath: destPath)
                    }
                    try FileManager.default.copyItem(at: bundledURL, to: destURL)
                    
                    // Also try to extract vocab if bundled
                    if let vocabURL = Bundle.main.url(forResource: "\(modelId).vocab", withExtension: "txt", subdirectory: "models") {
                        let vocabDestPath = (cacheDir as NSString).appendingPathComponent("\(modelId).vocab.txt")
                        if FileManager.default.fileExists(atPath: vocabDestPath) {
                            try FileManager.default.removeItem(atPath: vocabDestPath)
                        }
                        try FileManager.default.copyItem(at: vocabURL, to: URL(fileURLWithPath: vocabDestPath))
                    }
                    
                    return destPath
                } catch {
                    // Failed to extract, continue
                }
            }
        }
        return nil
    }
    
    @objc(hasBundledModel:withResolver:withRejecter:)
    func hasBundledModel(modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let extensions = ["onnx", "mlmodel"]
        for ext in extensions {
            if Bundle.main.url(forResource: modelId, withExtension: ext, subdirectory: "models") != nil {
                resolve(true)
                return
            }
        }
        resolve(false)
    }
    
    @objc(getLocalModelMetadata:withResolver:withRejecter:)
    func getLocalModelMetadata(modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let cacheDir = getCacheDirectory() else {
            reject("METADATA_ERROR", "Failed to get cache directory", nil)
            return
        }
        
        let metadataPath = (cacheDir as NSString).appendingPathComponent("\(modelId).metadata.json")
        
        guard FileManager.default.fileExists(atPath: metadataPath) else {
            reject("METADATA_NOT_FOUND", "No local metadata found for model \(modelId)", nil)
            return
        }
        
        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: metadataPath))
            let jsonString = String(data: data, encoding: .utf8) ?? "{}"
            resolve(jsonString)
        } catch {
            reject("METADATA_ERROR", "Failed to read metadata: \(error.localizedDescription)", error)
        }
    }
    
    private func getFileSize(path: String) -> Int64 {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let size = attrs[.size] as? Int64 else {
            return 0
        }
        return size
    }
    
    private func checkNPUAvailability() -> Bool {
        // Check for actual Neural Engine presence using Metal device capabilities
        // Neural Engine (ANE) is available on A11+ chips (iPhone 8/X and later)
        if #available(iOS 15.0, *) {
            // Check if device supports Neural Engine via Core ML
            // A11 Bionic and later have Neural Engine
            let processInfo = ProcessInfo.processInfo
            
            // Check for specific device capabilities that indicate ANE presence
            // Devices with A11+ chips have at least 3GB RAM and support Metal 2
            let ramGB = Double(processInfo.physicalMemory) / (1024 * 1024 * 1024)
            
            // A11 Bionic (iPhone 8/X) and later have Neural Engine
            // These devices have iOS 15+ support and sufficient RAM
            // We also verify Metal GPU family support as a proxy for modern chips
            if let device = MTLCreateSystemDefaultDevice() {
                // Metal GPU Family Apple 4+ indicates A11 or later chip with Neural Engine
                if device.supportsFamily(.apple4) {
                    return true
                }
            }
            
            // Fallback: devices with 3GB+ RAM running iOS 15+ likely have ANE
            return ramGB >= 3.0
        }
        return false
    }
    
    private func checkFoundationModelsSupport() -> Bool {
        if #available(iOS 26.0, *) {
            return true
        }
        return false
    }
    
    private func getDeviceRAM() -> Double {
        return Double(ProcessInfo.processInfo.physicalMemory) / (1024 * 1024 * 1024)
    }
    
    private func getSupportedDelegates() -> [String] {
        var delegates = ["cpu"]
        delegates.append("gpu")
        if checkNPUAvailability() {
            delegates.append("coreml")  // iOS uses Core ML for Neural Engine, not NNAPI
            delegates.append("ane")     // Apple Neural Engine
        }
        return delegates
    }
}

class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    weak var core: LocalIntelligenceCore?
    let modelId: String
    let format: String
    let fileExtension: String
    let expectedSize: Int64
    let expectedChecksum: String?
    let metadata: [String: Any]
    let resolve: RCTPromiseResolveBlock
    let reject: RCTPromiseRejectBlock
    
    init(core: LocalIntelligenceCore, modelId: String, format: String, fileExtension: String, expectedSize: Int64, expectedChecksum: String?, metadata: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        self.core = core
        self.modelId = modelId
        self.format = format
        self.fileExtension = fileExtension
        self.expectedSize = expectedSize
        self.expectedChecksum = expectedChecksum
        self.metadata = metadata
        self.resolve = resolve
        self.reject = reject
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        core?.handleDownloadComplete(modelId: modelId, location: location, format: format, fileExtension: fileExtension, expectedSize: expectedSize, expectedChecksum: expectedChecksum, metadata: metadata, resolve: resolve, reject: reject)
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        core?.sendDownloadProgress(modelId: modelId, bytesDownloaded: totalBytesWritten, totalBytes: totalBytesExpectedToWrite)
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            core?.handleDownloadError(modelId: modelId, error: error, reject: reject)
        }
    }
}

struct CoreConfig: Codable {
    let modelCacheDir: String?
    let cdnBaseUrl: String?
    let maxConcurrentDownloads: Int?
    let enableLogging: Bool?
}

struct DeviceCapabilities: Codable {
    let platform: String
    let osVersion: String
    let hasNPU: Bool
    let hasGPU: Bool
    let ramGB: Double
    let supportsFoundationModels: Bool
    let supportedDelegates: [String]
}

struct ModelStatus: Codable {
    let state: String
    let progress: Double?
    let sizeBytes: Int64?
    let path: String?
    let message: String?
}
