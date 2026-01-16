import Foundation
import NaturalLanguage
import CoreML

@objc(DebrieSemanticSearch)
class DebrieSemanticSearch: NSObject {
    
    private var isInitialized = false
    private var config = SemanticSearchConfig()
    private var embeddingModel: NLEmbedding?
    private var stats = EmbeddingStats()
    
    struct SemanticSearchConfig {
        var databasePath: String = ""
        var tableName: String = "semantic_index"
        var embeddingDimensions: Int = 384
        var modelId: String = "minilm-l6-v2"
    }
    
    struct EmbeddingStats {
        var totalGenerated: Int = 0
        var totalProcessingTimeMs: Double = 0
        var processCount: Int = 0
    }
    
    override init() {
        super.init()
    }
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc func initialize(_ configJson: String,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        do {
            if let data = configJson.data(using: .utf8),
               let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                if let databasePath = json["databasePath"] as? String {
                    config.databasePath = databasePath
                }
                if let tableName = json["tableName"] as? String {
                    config.tableName = tableName
                }
                if let dimensions = json["embeddingDimensions"] as? Int {
                    config.embeddingDimensions = dimensions
                }
                if let modelId = json["modelId"] as? String {
                    config.modelId = modelId
                }
            }
            
            // Initialize NLEmbedding for sentence embeddings
            // Using the built-in sentence embedding which provides semantic similarity
            if #available(iOS 13.0, *) {
                embeddingModel = NLEmbedding.sentenceEmbedding(for: .english)
            }
            
            isInitialized = true
            resolve(true)
        } catch {
            reject("INIT_ERROR", "Failed to initialize semantic search: \(error.localizedDescription)", error)
        }
    }
    
    @objc func generateEmbedding(_ text: String,
                                  resolve: @escaping RCTPromiseResolveBlock,
                                  reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "Semantic search not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            do {
                let embedding = try self.generateEmbeddingInternal(text: text)
                let processingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
                
                self.updateStats(processingTime: processingTime)
                
                let result: [String: Any] = [
                    "text": text,
                    "embedding": embedding,
                    "processingTimeMs": processingTime
                ]
                
                let jsonData = try JSONSerialization.data(withJSONObject: result)
                let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
                
                resolve(jsonString)
            } catch {
                reject("EMBEDDING_ERROR", "Failed to generate embedding: \(error.localizedDescription)", error)
            }
        }
    }
    
    @objc func generateEmbeddingBatch(_ texts: [String],
                                       resolve: @escaping RCTPromiseResolveBlock,
                                       reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "Semantic search not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            var embeddings: [[String: Any]] = []
            
            do {
                for text in texts {
                    let textStartTime = CFAbsoluteTimeGetCurrent()
                    let embedding = try self.generateEmbeddingInternal(text: text)
                    let textProcessingTime = (CFAbsoluteTimeGetCurrent() - textStartTime) * 1000
                    
                    embeddings.append([
                        "text": text,
                        "embedding": embedding,
                        "processingTimeMs": textProcessingTime
                    ])
                }
                
                let totalProcessingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
                self.updateStats(processingTime: totalProcessingTime, count: texts.count)
                
                let result: [String: Any] = [
                    "embeddings": embeddings,
                    "totalProcessingTimeMs": totalProcessingTime
                ]
                
                let jsonData = try JSONSerialization.data(withJSONObject: result)
                let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
                
                resolve(jsonString)
            } catch {
                reject("BATCH_ERROR", "Failed to generate batch embeddings: \(error.localizedDescription)", error)
            }
        }
    }
    
    @objc func getModelStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                               reject: @escaping RCTPromiseRejectBlock) {
        // iOS uses built-in NLEmbedding, always ready
        let result: [String: Any] = [
            "status": "ready",
            "progress": 100
        ]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: result)
            let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
            resolve(jsonString)
        } catch {
            reject("STATUS_ERROR", "Failed to get model status", error)
        }
    }
    
    @objc func preloadModel(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        // iOS uses built-in NLEmbedding, no preload needed
        if #available(iOS 13.0, *) {
            embeddingModel = NLEmbedding.sentenceEmbedding(for: .english)
        }
        resolve(true)
    }
    
    @objc func unloadModel(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        embeddingModel = nil
        resolve(true)
    }
    
    @objc func addListener(_ eventName: String) {
        // Required for RCTEventEmitter
    }
    
    @objc func removeListeners(_ count: Int) {
        // Required for RCTEventEmitter
    }
    
    // MARK: - Private Methods
    
    private func generateEmbeddingInternal(text: String) throws -> [Double] {
        // Use NLEmbedding for sentence-level embeddings on iOS 13+
        if #available(iOS 13.0, *), let embedding = embeddingModel {
            if let vector = embedding.vector(for: text) {
                // NLEmbedding returns 512-dimensional vectors
                // We'll use these directly or pad/truncate to match config
                return vector
            }
        }
        
        // Fallback: Generate a simple hash-based embedding for older iOS
        // This is a placeholder - production would use Core ML model
        return generateFallbackEmbedding(text: text)
    }
    
    private func generateFallbackEmbedding(text: String) -> [Double] {
        // Simple fallback embedding using character-level features
        // This is NOT semantic - just a placeholder for older iOS versions
        var embedding = [Double](repeating: 0.0, count: config.embeddingDimensions)
        
        let words = text.lowercased().split(separator: " ")
        for (index, word) in words.enumerated() {
            let hash = word.hashValue
            let position = abs(hash) % config.embeddingDimensions
            embedding[position] += 1.0 / Double(words.count)
            
            // Add positional encoding
            let positionFactor = Double(index) / Double(max(words.count, 1))
            embedding[(position + 1) % config.embeddingDimensions] += positionFactor * 0.1
        }
        
        // Normalize
        let magnitude = sqrt(embedding.reduce(0) { $0 + $1 * $1 })
        if magnitude > 0 {
            embedding = embedding.map { $0 / magnitude }
        }
        
        return embedding
    }
    
    private func updateStats(processingTime: Double, count: Int = 1) {
        stats.totalGenerated += count
        stats.totalProcessingTimeMs += processingTime
        stats.processCount += 1
    }
}
