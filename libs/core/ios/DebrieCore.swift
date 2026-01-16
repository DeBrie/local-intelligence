import Foundation
import React

@objc(DebrieCore)
class DebrieCore: RCTEventEmitter {
    
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
        return ["DebrieDownloadProgress"]
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
        
        let cdnBaseUrl = config.cdnBaseUrl ?? "https://cdn.debrie.dev/models"
        let urlString = "\(cdnBaseUrl)/\(modelId)/latest/ios.mlmodel"
        
        guard let url = URL(string: urlString) else {
            reject("INVALID_URL", "Invalid download URL", nil)
            return
        }
        
        let session = URLSession(configuration: .default, delegate: DownloadDelegate(core: self, modelId: modelId, resolve: resolve, reject: reject), delegateQueue: nil)
        let task = session.downloadTask(with: url)
        
        activeDownloads[modelId] = task
        task.resume()
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
        
        sendEvent(withName: "DebrieDownloadProgress", body: [
            "modelId": modelId,
            "bytesDownloaded": bytesDownloaded,
            "totalBytes": totalBytes,
            "progress": progress
        ])
    }
    
    func handleDownloadComplete(modelId: String, location: URL, resolve: @escaping RCTPromiseResolveBlock) {
        activeDownloads.removeValue(forKey: modelId)
        
        guard let destPath = getModelPath(modelId: modelId) else {
            resolve("{\"error\": \"Failed to get destination path\"}")
            return
        }
        
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
            
            let fileSize = getFileSize(path: destPath)
            let status = ModelStatus(state: "ready", progress: nil, sizeBytes: fileSize, path: destPath, message: nil)
            modelCache[modelId] = status
            
            resolve("{\"path\": \"\(destPath)\"}")
        } catch {
            resolve("{\"error\": \"\(error.localizedDescription)\"}")
        }
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
        
        return documentsDir.appendingPathComponent("debrie_models").path
    }
    
    private func getModelPath(modelId: String) -> String? {
        guard let cacheDir = getCacheDirectory() else { return nil }
        return (cacheDir as NSString).appendingPathComponent("\(modelId).mlmodel")
    }
    
    private func getFileSize(path: String) -> Int64 {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let size = attrs[.size] as? Int64 else {
            return 0
        }
        return size
    }
    
    private func checkNPUAvailability() -> Bool {
        if #available(iOS 15.0, *) {
            return true
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
            delegates.append("nnapi")
        }
        return delegates
    }
}

class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    weak var core: DebrieCore?
    let modelId: String
    let resolve: RCTPromiseResolveBlock
    let reject: RCTPromiseRejectBlock
    
    init(core: DebrieCore, modelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        self.core = core
        self.modelId = modelId
        self.resolve = resolve
        self.reject = reject
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        core?.handleDownloadComplete(modelId: modelId, location: location, resolve: resolve)
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
