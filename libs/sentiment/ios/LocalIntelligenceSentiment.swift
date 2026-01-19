import Foundation
import NaturalLanguage
import React
import onnxruntime_objc
import UIKit

@objc(LocalIntelligenceSentiment)
class LocalIntelligenceSentiment: RCTEventEmitter {
    
    private static let MODEL_ID = "distilbert-sst2"
    private static let SENTIMENT_LABELS = ["negative", "positive"]
    
    private var isInitialized = false
    private var config = SentimentConfig()
    private var stats = SentimentStats()
    private var cache: [String: CachedResult] = [:]
    
    // ONNX Runtime for DistilBERT-SST2 model
    private var ortSession: ORTSession?
    private var ortEnv: ORTEnv?
    private var tokenizer: WordPieceTokenizer?
    private var isModelReady = false
    private let modelLock = NSLock()
    private var memoryWarningObserver: NSObjectProtocol?
    private var lastAccessTime: Date = Date()
    
    struct SentimentConfig {
        var minConfidence: Double = 0.5
        var defaultLabel: String = "neutral"
        var enableCaching: Bool = true
        var maxCacheSize: Int = 100
    }
    
    struct CachedResult {
        let result: SentimentResult
        let timestamp: Date
    }
    
    struct SentimentStats {
        var totalAnalyzed: Int = 0
        var byLabel: [String: Int] = ["positive": 0, "negative": 0, "neutral": 0]
        var totalConfidence: Double = 0
        var totalProcessingTimeMs: Double = 0
    }
    
    struct SentimentResult: Codable {
        let text: String
        let label: String
        let confidence: Double
        let scores: Scores
        let processingTimeMs: Double
        
        struct Scores: Codable {
            let positive: Double
            let negative: Double
            let neutral: Double
        }
    }
    
    struct BatchResult: Codable {
        let results: [SentimentResult]
        let totalProcessingTimeMs: Double
        let averageConfidence: Double
    }
    
    override init() {
        super.init()
        setupMemoryWarningObserver()
    }
    
    deinit {
        if let observer = memoryWarningObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }
    
    private func setupMemoryWarningObserver() {
        memoryWarningObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleMemoryWarning()
        }
    }
    
    private func handleMemoryWarning() {
        let timeSinceLastAccess = Date().timeIntervalSince(lastAccessTime)
        if timeSinceLastAccess > 30 {
            unloadModelInternal()
        }
    }
    
    private func unloadModelInternal() {
        modelLock.lock()
        defer { modelLock.unlock() }
        ortSession = nil
        tokenizer = nil
        isModelReady = false
    }
    
    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override func supportedEvents() -> [String]! {
        return ["onSentimentAnalysis"]
    }
    
    @objc(initialize:withResolver:withRejecter:)
    func initialize(_ configJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        do {
            if let data = configJson.data(using: .utf8),
               let configDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                if let minConf = configDict["minConfidence"] as? Double {
                    config.minConfidence = minConf
                }
                if let defaultLbl = configDict["defaultLabel"] as? String {
                    config.defaultLabel = defaultLbl
                }
                if let caching = configDict["enableCaching"] as? Bool {
                    config.enableCaching = caching
                }
                if let maxCache = configDict["maxCacheSize"] as? Int {
                    config.maxCacheSize = maxCache
                }
            }
            
            isInitialized = true
            resolve(true)
        } catch {
            reject("INIT_ERROR", "Failed to initialize sentiment module", error)
        }
    }
    
    @objc(analyze:withResolver:withRejecter:)
    func analyze(_ text: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "Sentiment module not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            // Check cache
            if self.config.enableCaching, let cached = self.cache[text] {
                do {
                    let jsonData = try JSONEncoder().encode(cached.result)
                    let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
                    resolve(jsonString)
                    return
                } catch {
                    // Continue with analysis if cache read fails
                }
            }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            let result = self.analyzeSentiment(text: text, startTime: startTime)
            
            // Update stats
            self.stats.totalAnalyzed += 1
            self.stats.byLabel[result.label, default: 0] += 1
            self.stats.totalConfidence += result.confidence
            self.stats.totalProcessingTimeMs += result.processingTimeMs
            
            // Cache result
            if self.config.enableCaching {
                self.cacheResult(text: text, result: result)
            }
            
            // Emit event
            self.sendEvent(withName: "onSentimentAnalysis", body: [
                "result": try? JSONEncoder().encode(result)
            ])
            
            do {
                let jsonData = try JSONEncoder().encode(result)
                let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
                resolve(jsonString)
            } catch {
                reject("ENCODE_ERROR", "Failed to encode result", error)
            }
        }
    }
    
    @objc(analyzeBatch:withResolver:withRejecter:)
    func analyzeBatch(_ texts: [String], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "Sentiment module not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let batchStartTime = CFAbsoluteTimeGetCurrent()
            var results: [SentimentResult] = []
            var totalConfidence: Double = 0
            
            for text in texts {
                let startTime = CFAbsoluteTimeGetCurrent()
                let result = self.analyzeSentiment(text: text, startTime: startTime)
                results.append(result)
                totalConfidence += result.confidence
                
                // Update stats
                self.stats.totalAnalyzed += 1
                self.stats.byLabel[result.label, default: 0] += 1
                self.stats.totalConfidence += result.confidence
                self.stats.totalProcessingTimeMs += result.processingTimeMs
            }
            
            let totalTime = (CFAbsoluteTimeGetCurrent() - batchStartTime) * 1000
            let avgConfidence = results.isEmpty ? 0 : totalConfidence / Double(results.count)
            
            let batchResult = BatchResult(
                results: results,
                totalProcessingTimeMs: totalTime,
                averageConfidence: avgConfidence
            )
            
            do {
                let jsonData = try JSONEncoder().encode(batchResult)
                let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
                resolve(jsonString)
            } catch {
                reject("ENCODE_ERROR", "Failed to encode batch result", error)
            }
        }
    }
    
    @objc(getStats:withRejecter:)
    func getStats(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let avgConfidence = stats.totalAnalyzed > 0 ? stats.totalConfidence / Double(stats.totalAnalyzed) : 0
        let avgTime = stats.totalAnalyzed > 0 ? stats.totalProcessingTimeMs / Double(stats.totalAnalyzed) : 0
        
        let statsDict: [String: Any] = [
            "totalAnalyzed": stats.totalAnalyzed,
            "byLabel": stats.byLabel,
            "averageConfidence": avgConfidence,
            "averageProcessingTimeMs": avgTime
        ]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: statsDict)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
            resolve(jsonString)
        } catch {
            reject("ENCODE_ERROR", "Failed to encode stats", error)
        }
    }
    
    @objc(resetStats:withRejecter:)
    func resetStats(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        stats = SentimentStats()
        resolve(true)
    }
    
    @objc(clearCache:withRejecter:)
    func clearCache(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        cache.removeAll()
        resolve(true)
    }
    
    private func analyzeSentiment(text: String, startTime: CFAbsoluteTime) -> SentimentResult {
        lastAccessTime = Date()
        
        // Use ONNX model if available
        if isModelReady {
            if let result = analyzeWithONNX(text: text, startTime: startTime) {
                return result
            }
        }
        
        // Fallback to NLTagger
        return analyzeWithNLTagger(text: text, startTime: startTime)
    }
    
    private func analyzeWithONNX(text: String, startTime: CFAbsoluteTime) -> SentimentResult? {
        modelLock.lock()
        guard let session = ortSession,
              let tok = tokenizer,
              isModelReady else {
            modelLock.unlock()
            return nil
        }
        modelLock.unlock()
        
        do {
            let maxLength = 512
            let tokenized = tok.tokenize(text: text, maxLength: maxLength)
            
            // Create input tensors
            let inputIdsData = Data(bytes: tokenized.inputIds.map { Int64($0) }, count: maxLength * MemoryLayout<Int64>.size)
            let attentionMaskData = Data(bytes: tokenized.attentionMask.map { Int64($0) }, count: maxLength * MemoryLayout<Int64>.size)
            
            let inputShape: [NSNumber] = [1, NSNumber(value: maxLength)]
            
            let inputIdsTensor = try ORTValue(tensorData: NSMutableData(data: inputIdsData),
                                               elementType: .int64,
                                               shape: inputShape)
            let attentionMaskTensor = try ORTValue(tensorData: NSMutableData(data: attentionMaskData),
                                                    elementType: .int64,
                                                    shape: inputShape)
            
            // Run inference
            let outputs = try session.run(withInputs: [
                "input_ids": inputIdsTensor,
                "attention_mask": attentionMaskTensor
            ], outputNames: ["logits"], runOptions: nil)
            
            guard let logitsValue = outputs["logits"] else { return nil }
            
            // Get logits data
            let logitsData = try logitsValue.tensorData() as Data
            var logits = [Float](repeating: 0, count: 2)
            logitsData.withUnsafeBytes { rawBuffer in
                let floatBuffer = rawBuffer.bindMemory(to: Float.self)
                for i in 0..<min(2, floatBuffer.count) {
                    logits[i] = floatBuffer[i]
                }
            }
            
            // Apply softmax
            let probs = softmax(logits)
            let negativeProb = Double(probs[0])
            let positiveProb = Double(probs[1])
            
            // Determine label and confidence
            let label: String
            let confidence: Double
            
            if positiveProb > negativeProb {
                label = "positive"
                confidence = positiveProb
            } else {
                label = "negative"
                confidence = negativeProb
            }
            
            // Calculate neutral as inverse of max confidence (SST-2 is binary)
            let neutralScore = 1.0 - confidence
            
            let processingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            
            return SentimentResult(
                text: text,
                label: label,
                confidence: confidence,
                scores: SentimentResult.Scores(
                    positive: positiveProb,
                    negative: negativeProb,
                    neutral: neutralScore
                ),
                processingTimeMs: processingTime
            )
        } catch {
            return nil
        }
    }
    
    private func softmax(_ logits: [Float]) -> [Float] {
        let maxLogit = logits.max() ?? 0
        let expValues = logits.map { exp($0 - maxLogit) }
        let sumExp = expValues.reduce(0, +)
        return expValues.map { $0 / sumExp }
    }
    
    private func analyzeWithNLTagger(text: String, startTime: CFAbsoluteTime) -> SentimentResult {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        tagger.string = text
        
        var positiveScore: Double = 0
        var negativeScore: Double = 0
        var neutralScore: Double = 0
        var wordCount: Int = 0
        
        let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation]
        
        tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .paragraph, scheme: .sentimentScore, options: options) { tag, _ in
            if let tag = tag, let score = Double(tag.rawValue) {
                // NLTagger returns score from -1 (negative) to 1 (positive)
                if score > 0.1 {
                    positiveScore += score
                } else if score < -0.1 {
                    negativeScore += abs(score)
                } else {
                    neutralScore += 1 - abs(score)
                }
                wordCount += 1
            }
            return true
        }
        
        // Normalize scores
        let total = positiveScore + negativeScore + neutralScore
        if total > 0 {
            positiveScore /= total
            negativeScore /= total
            neutralScore /= total
        } else {
            // Default to neutral if no sentiment detected
            neutralScore = 1.0
        }
        
        // Determine label and confidence
        let label: String
        let confidence: Double
        
        if positiveScore >= negativeScore && positiveScore >= neutralScore {
            label = "positive"
            confidence = positiveScore
        } else if negativeScore >= positiveScore && negativeScore >= neutralScore {
            label = "negative"
            confidence = negativeScore
        } else {
            label = "neutral"
            confidence = neutralScore
        }
        
        let processingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        
        return SentimentResult(
            text: text,
            label: label,
            confidence: confidence,
            scores: SentimentResult.Scores(
                positive: positiveScore,
                negative: negativeScore,
                neutral: neutralScore
            ),
            processingTimeMs: processingTime
        )
    }
    
    private func cacheResult(text: String, result: SentimentResult) {
        // Evict oldest entries if cache is full
        if cache.count >= config.maxCacheSize {
            let sortedKeys = cache.sorted { $0.value.timestamp < $1.value.timestamp }
            let keysToRemove = sortedKeys.prefix(cache.count - config.maxCacheSize + 1)
            for (key, _) in keysToRemove {
                cache.removeValue(forKey: key)
            }
        }
        
        cache[text] = CachedResult(result: result, timestamp: Date())
    }
    
    // MARK: - ONNX Model Support
    
    @objc(notifyModelDownloaded:withPath:)
    func notifyModelDownloaded(_ modelId: String, path: String) {
        if modelId == LocalIntelligenceSentiment.MODEL_ID {
            let modelFile = URL(fileURLWithPath: path)
            let vocabFile = modelFile.deletingLastPathComponent().appendingPathComponent("\(LocalIntelligenceSentiment.MODEL_ID).vocab.txt")
            if FileManager.default.fileExists(atPath: modelFile.path) &&
               FileManager.default.fileExists(atPath: vocabFile.path) {
                DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                    self?.loadOnnxModel(modelFile: modelFile, vocabFile: vocabFile)
                }
            }
        }
    }
    
    @objc(getModelStatus:withRejecter:)
    func getModelStatus(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let status = isModelReady ? "ready" : "not_ready"
        let result: [String: Any] = [
            "status": status,
            "modelId": LocalIntelligenceSentiment.MODEL_ID,
            "isModelReady": isModelReady
        ]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: result)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
            resolve(jsonString)
        } catch {
            reject("STATUS_ERROR", "Failed to get model status", error)
        }
    }
    
    private func loadOnnxModel(modelFile: URL, vocabFile: URL) {
        modelLock.lock()
        defer { modelLock.unlock() }
        
        do {
            // Load tokenizer first
            tokenizer = try WordPieceTokenizer(vocabFile: vocabFile)
            
            // Initialize ONNX Runtime environment
            ortEnv = try ORTEnv(loggingLevel: .warning)
            
            // Create session options
            let sessionOptions = try ORTSessionOptions()
            try sessionOptions.setGraphOptimizationLevel(.all)
            
            // Create session
            ortSession = try ORTSession(env: ortEnv!, modelPath: modelFile.path, sessionOptions: sessionOptions)
            
            isModelReady = true
        } catch {
            tokenizer = nil
            ortSession = nil
            ortEnv = nil
            isModelReady = false
        }
    }
}
