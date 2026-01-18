import Foundation
import NaturalLanguage
import React

@objc(LocalIntelligencePII)
class LocalIntelligencePII: RCTEventEmitter {
    
    private var isInitialized = false
    private var config: PIIConfig = PIIConfig()
    private var customPatterns: [String: CustomPattern] = [:]
    private var stats = PIIStats()
    
    private let regexPatterns: [String: (pattern: String, type: String)] = [
        "email": ("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "email"),
        "phone": ("\\b(?:\\+1[-.]?)?\\(?[0-9]{3}\\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\\b", "phone"),
        "ssn": ("\\b[0-9]{3}[-]?[0-9]{2}[-]?[0-9]{4}\\b", "ssn"),
        "credit_card": ("\\b(?:[0-9]{4}[-\\s]?){3}[0-9]{4}\\b", "credit_card"),
        "ip_address": ("\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b", "ip_address"),
        "url": ("https?://[^\\s]+", "url"),
        "address": ("\\b\\d+\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\\b", "address"),
    ]
    
    struct PIIConfig {
        var enabledTypes: [String] = ["person", "organization", "location", "email", "phone", "ssn", "credit_card"]
        var redactionChar: String = "*"
        var minConfidence: Double = 0.7
        var preserveLength: Bool = true
    }
    
    struct CustomPattern {
        let name: String
        let pattern: String
        let type: String
    }
    
    struct PIIStats {
        var totalScanned: Int = 0
        var totalRedacted: Int = 0
        var byType: [String: Int] = [:]
        var totalProcessingTimeMs: Double = 0
        var processCount: Int = 0
    }
    
    struct PIIEntity: Codable {
        let type: String
        let text: String
        let startIndex: Int
        let endIndex: Int
        let confidence: Double
    }
    
    struct RedactionResult: Codable {
        let originalText: String
        let redactedText: String
        let entities: [PIIEntity]
        let processingTimeMs: Double
    }
    
    override init() {
        super.init()
    }
    
    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override func supportedEvents() -> [String]! {
        return ["onPIIRedaction"]
    }
    
    @objc(initialize:withResolver:withRejecter:)
    func initialize(_ configJson: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        do {
            if let data = configJson.data(using: .utf8),
               let configDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                if let types = configDict["enabledTypes"] as? [String] {
                    config.enabledTypes = types
                }
                if let char = configDict["redactionChar"] as? String {
                    config.redactionChar = char
                }
                if let confidence = configDict["minConfidence"] as? Double {
                    config.minConfidence = confidence
                }
                if let preserve = configDict["preserveLength"] as? Bool {
                    config.preserveLength = preserve
                }
            }
            
            isInitialized = true
            resolve(true)
        } catch {
            reject("INIT_ERROR", "Failed to initialize PII module", error)
        }
    }
    
    @objc(detectEntities:withResolver:withRejecter:)
    func detectEntities(_ text: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "PII module not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            var entities: [PIIEntity] = []
            
            // NLTagger for named entities
            if self.config.enabledTypes.contains(where: { ["person", "organization", "location"].contains($0) }) {
                let tagger = NLTagger(tagSchemes: [.nameType])
                tagger.string = text
                
                let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation, .joinNames]
                
                tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: options) { tag, range in
                    guard let tag = tag else { return true }
                    
                    let entityType: String?
                    switch tag {
                    case .personalName:
                        entityType = self.config.enabledTypes.contains("person") ? "person" : nil
                    case .organizationName:
                        entityType = self.config.enabledTypes.contains("organization") ? "organization" : nil
                    case .placeName:
                        entityType = self.config.enabledTypes.contains("location") ? "location" : nil
                    default:
                        entityType = nil
                    }
                    
                    if let type = entityType {
                        let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                        let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                        
                        entities.append(PIIEntity(
                            type: type,
                            text: String(text[range]),
                            startIndex: startIdx,
                            endIndex: endIdx,
                            confidence: 0.85
                        ))
                    }
                    
                    return true
                }
            }
            
            // Regex patterns for structured PII
            for (key, patternInfo) in self.regexPatterns {
                guard self.config.enabledTypes.contains(patternInfo.type) else { continue }
                
                if let regex = try? NSRegularExpression(pattern: patternInfo.pattern, options: []) {
                    let nsRange = NSRange(text.startIndex..., in: text)
                    let matches = regex.matches(in: text, options: [], range: nsRange)
                    
                    for match in matches {
                        if let range = Range(match.range, in: text) {
                            let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                            let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                            
                            entities.append(PIIEntity(
                                type: patternInfo.type,
                                text: String(text[range]),
                                startIndex: startIdx,
                                endIndex: endIdx,
                                confidence: 0.95
                            ))
                        }
                    }
                }
            }
            
            // Custom patterns
            for (_, pattern) in self.customPatterns {
                if let regex = try? NSRegularExpression(pattern: pattern.pattern, options: []) {
                    let nsRange = NSRange(text.startIndex..., in: text)
                    let matches = regex.matches(in: text, options: [], range: nsRange)
                    
                    for match in matches {
                        if let range = Range(match.range, in: text) {
                            let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                            let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                            
                            entities.append(PIIEntity(
                                type: pattern.type,
                                text: String(text[range]),
                                startIndex: startIdx,
                                endIndex: endIdx,
                                confidence: 0.90
                            ))
                        }
                    }
                }
            }
            
            // Sort by start index and remove overlaps
            entities.sort { $0.startIndex < $1.startIndex }
            entities = self.removeOverlappingEntities(entities)
            
            let processingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            self.updateStats(entities: entities, processingTime: processingTime)
            
            do {
                let jsonData = try JSONEncoder().encode(entities)
                let jsonString = String(data: jsonData, encoding: .utf8) ?? "[]"
                resolve(jsonString)
            } catch {
                reject("ENCODE_ERROR", "Failed to encode entities", error)
            }
        }
    }
    
    @objc(redactText:withResolver:withRejecter:)
    func redactText(_ text: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "PII module not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            
            // First detect entities
            var entities: [PIIEntity] = []
            
            // NLTagger for named entities
            if self.config.enabledTypes.contains(where: { ["person", "organization", "location"].contains($0) }) {
                let tagger = NLTagger(tagSchemes: [.nameType])
                tagger.string = text
                
                let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation, .joinNames]
                
                tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: options) { tag, range in
                    guard let tag = tag else { return true }
                    
                    let entityType: String?
                    switch tag {
                    case .personalName:
                        entityType = self.config.enabledTypes.contains("person") ? "person" : nil
                    case .organizationName:
                        entityType = self.config.enabledTypes.contains("organization") ? "organization" : nil
                    case .placeName:
                        entityType = self.config.enabledTypes.contains("location") ? "location" : nil
                    default:
                        entityType = nil
                    }
                    
                    if let type = entityType {
                        let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                        let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                        
                        entities.append(PIIEntity(
                            type: type,
                            text: String(text[range]),
                            startIndex: startIdx,
                            endIndex: endIdx,
                            confidence: 0.85
                        ))
                    }
                    
                    return true
                }
            }
            
            // Regex patterns
            for (_, patternInfo) in self.regexPatterns {
                guard self.config.enabledTypes.contains(patternInfo.type) else { continue }
                
                if let regex = try? NSRegularExpression(pattern: patternInfo.pattern, options: []) {
                    let nsRange = NSRange(text.startIndex..., in: text)
                    let matches = regex.matches(in: text, options: [], range: nsRange)
                    
                    for match in matches {
                        if let range = Range(match.range, in: text) {
                            let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                            let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                            
                            entities.append(PIIEntity(
                                type: patternInfo.type,
                                text: String(text[range]),
                                startIndex: startIdx,
                                endIndex: endIdx,
                                confidence: 0.95
                            ))
                        }
                    }
                }
            }
            
            // Custom patterns
            for (_, pattern) in self.customPatterns {
                if let regex = try? NSRegularExpression(pattern: pattern.pattern, options: []) {
                    let nsRange = NSRange(text.startIndex..., in: text)
                    let matches = regex.matches(in: text, options: [], range: nsRange)
                    
                    for match in matches {
                        if let range = Range(match.range, in: text) {
                            let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                            let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                            
                            entities.append(PIIEntity(
                                type: pattern.type,
                                text: String(text[range]),
                                startIndex: startIdx,
                                endIndex: endIdx,
                                confidence: 0.90
                            ))
                        }
                    }
                }
            }
            
            // Sort and remove overlaps
            entities.sort { $0.startIndex < $1.startIndex }
            entities = self.removeOverlappingEntities(entities)
            
            // Perform redaction
            var redactedText = text
            for entity in entities.reversed() {
                let startIndex = redactedText.index(redactedText.startIndex, offsetBy: entity.startIndex)
                let endIndex = redactedText.index(redactedText.startIndex, offsetBy: entity.endIndex)
                
                let replacement: String
                if self.config.preserveLength {
                    replacement = String(repeating: self.config.redactionChar, count: entity.text.count)
                } else {
                    replacement = "[\(entity.type.uppercased())]"
                }
                
                redactedText.replaceSubrange(startIndex..<endIndex, with: replacement)
            }
            
            let processingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            self.updateStats(entities: entities, processingTime: processingTime)
            
            let result = RedactionResult(
                originalText: text,
                redactedText: redactedText,
                entities: entities,
                processingTimeMs: processingTime
            )
            
            // Emit event
            self.sendEvent(withName: "onPIIRedaction", body: [
                "text": redactedText,
                "entities": try? JSONEncoder().encode(entities)
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
    
    @objc(redactBatch:withResolver:withRejecter:)
    func redactBatch(_ texts: [String], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "PII module not initialized", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            var results: [RedactionResult] = []
            let group = DispatchGroup()
            let queue = DispatchQueue(label: "com.localintelligence.pii.batch", attributes: .concurrent)
            let resultsLock = NSLock()
            
            for (index, text) in texts.enumerated() {
                group.enter()
                queue.async {
                    let startTime = CFAbsoluteTimeGetCurrent()
                    var entities: [PIIEntity] = []
                    
                    // Simplified detection for batch
                    let tagger = NLTagger(tagSchemes: [.nameType])
                    tagger.string = text
                    
                    let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation, .joinNames]
                    
                    tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: options) { tag, range in
                        guard let tag = tag else { return true }
                        
                        let entityType: String?
                        switch tag {
                        case .personalName: entityType = "person"
                        case .organizationName: entityType = "organization"
                        case .placeName: entityType = "location"
                        default: entityType = nil
                        }
                        
                        if let type = entityType {
                            let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                            let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                            
                            entities.append(PIIEntity(
                                type: type,
                                text: String(text[range]),
                                startIndex: startIdx,
                                endIndex: endIdx,
                                confidence: 0.85
                            ))
                        }
                        return true
                    }
                    
                    // Regex patterns
                    for (_, patternInfo) in self.regexPatterns {
                        if let regex = try? NSRegularExpression(pattern: patternInfo.pattern, options: []) {
                            let nsRange = NSRange(text.startIndex..., in: text)
                            let matches = regex.matches(in: text, options: [], range: nsRange)
                            
                            for match in matches {
                                if let range = Range(match.range, in: text) {
                                    let startIdx = text.distance(from: text.startIndex, to: range.lowerBound)
                                    let endIdx = text.distance(from: text.startIndex, to: range.upperBound)
                                    
                                    entities.append(PIIEntity(
                                        type: patternInfo.type,
                                        text: String(text[range]),
                                        startIndex: startIdx,
                                        endIndex: endIdx,
                                        confidence: 0.95
                                    ))
                                }
                            }
                        }
                    }
                    
                    entities.sort { $0.startIndex < $1.startIndex }
                    entities = self.removeOverlappingEntities(entities)
                    
                    var redactedText = text
                    for entity in entities.reversed() {
                        let startIndex = redactedText.index(redactedText.startIndex, offsetBy: entity.startIndex)
                        let endIndex = redactedText.index(redactedText.startIndex, offsetBy: entity.endIndex)
                        let replacement = String(repeating: self.config.redactionChar, count: entity.text.count)
                        redactedText.replaceSubrange(startIndex..<endIndex, with: replacement)
                    }
                    
                    let processingTime = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
                    
                    let result = RedactionResult(
                        originalText: text,
                        redactedText: redactedText,
                        entities: entities,
                        processingTimeMs: processingTime
                    )
                    
                    resultsLock.lock()
                    results.append(result)
                    resultsLock.unlock()
                    
                    group.leave()
                }
            }
            
            group.wait()
            
            do {
                let jsonData = try JSONEncoder().encode(results)
                let jsonString = String(data: jsonData, encoding: .utf8) ?? "[]"
                resolve(jsonString)
            } catch {
                reject("ENCODE_ERROR", "Failed to encode results", error)
            }
        }
    }
    
    @objc(addCustomPattern:withPattern:withType:withResolver:withRejecter:)
    func addCustomPattern(_ name: String, pattern: String, type: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        do {
            _ = try NSRegularExpression(pattern: pattern, options: [])
            customPatterns[name] = CustomPattern(name: name, pattern: pattern, type: type)
            resolve(true)
        } catch {
            reject("INVALID_PATTERN", "Invalid regex pattern", error)
        }
    }
    
    @objc(removeCustomPattern:withResolver:withRejecter:)
    func removeCustomPattern(_ name: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        if customPatterns.removeValue(forKey: name) != nil {
            resolve(true)
        } else {
            resolve(false)
        }
    }
    
    @objc(getStats:withRejecter:)
    func getStats(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let avgTime = stats.processCount > 0 ? stats.totalProcessingTimeMs / Double(stats.processCount) : 0
        
        let statsDict: [String: Any] = [
            "totalScanned": stats.totalScanned,
            "totalRedacted": stats.totalRedacted,
            "byType": stats.byType,
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
        stats = PIIStats()
        resolve(true)
    }
    
    private func removeOverlappingEntities(_ entities: [PIIEntity]) -> [PIIEntity] {
        var result: [PIIEntity] = []
        var lastEnd = -1
        
        for entity in entities {
            if entity.startIndex >= lastEnd {
                result.append(entity)
                lastEnd = entity.endIndex
            }
        }
        
        return result
    }
    
    private func updateStats(entities: [PIIEntity], processingTime: Double) {
        stats.totalScanned += 1
        stats.totalRedacted += entities.count
        stats.totalProcessingTimeMs += processingTime
        stats.processCount += 1
        
        for entity in entities {
            stats.byType[entity.type, default: 0] += 1
        }
    }
}
