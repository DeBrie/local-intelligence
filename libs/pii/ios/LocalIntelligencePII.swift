import Foundation
import NaturalLanguage
import React
import onnxruntime_objc

@objc(LocalIntelligencePII)
class LocalIntelligencePII: RCTEventEmitter {
    
    private var isInitialized = false
    private var config: PIIConfig = PIIConfig()
    private var customPatterns: [String: CustomPattern] = [:]
    private var stats = PIIStats()
    
    // ONNX Runtime for BERT PII model
    private var ortSession: ORTSession?
    private var ortEnv: ORTEnv?
    private var tokenizer: WordPieceTokenizer?
    private var isModelReady = false
    private let modelLock = NSLock()
    
    // PII Labels from gravitee-io/bert-small-pii-detection model
    private let piiLabels = [
        "O",  // Outside (not PII)
        "AGE", "COORDINATE", "CREDIT_CARD", "DATE_TIME", "EMAIL_ADDRESS",
        "FINANCIAL", "IBAN_CODE", "IMEI", "IP_ADDRESS", "LOCATION",
        "MAC_ADDRESS", "NRP", "ORGANIZATION", "PASSWORD", "PERSON",
        "PHONE_NUMBER", "TITLE", "URL", "US_BANK_NUMBER", "US_DRIVER_LICENSE",
        "US_ITIN", "US_LICENSE_PLATE", "US_PASSPORT", "US_SSN"
    ]
    
    private let regexPatterns: [String: (pattern: String, type: String)] = [
        "email_address": ("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "email_address"),
        "phone_number": ("\\b(?:\\+1[-.]?)?\\(?[0-9]{3}\\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\\b", "phone_number"),
        // SSN regex: Must have dashes in standard format (XXX-XX-XXXX) or be preceded by SSN/Social Security keywords
        // First group (001-899, excluding 666) - Second group (01-99) - Third group (0001-9999)
        // This prevents matching arbitrary 9-digit numbers
        "us_ssn": ("(?:(?:SSN|Social Security|social security)[:\\s]*)?\\b(?!000|666|9\\d{2})[0-8]\\d{2}-(?!00)\\d{2}-(?!0000)\\d{4}\\b", "us_ssn"),
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
    
    // ML-required entity types that need BERT model for accurate detection
    private let mlRequiredTypes = ["person", "organization", "location", "age", "date_time", "title", "nrp"]
    
    @objc(detectEntities:withResolver:withRejecter:)
    func detectEntities(_ text: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard isInitialized else {
            reject("NOT_INITIALIZED", "PII module not initialized", nil)
            return
        }
        
        // Check if user requested ML-required types but model isn't ready
        let requestedMLTypes = config.enabledTypes.filter { mlRequiredTypes.contains($0) }
        if !requestedMLTypes.isEmpty && !isModelReady {
            reject("MODEL_NOT_READY", "PII model not ready. ML-based entity types (\(requestedMLTypes.joined(separator: ", "))) require the BERT model. Call Core.downloadModel('bert-small-pii') first.", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let startTime = CFAbsoluteTimeGetCurrent()
            var entities: [PIIEntity] = []
            
            // Use BERT model for ML-based entity detection
            if self.isModelReady {
                self.detectWithBERT(text: text, entities: &entities)
            }
            
            // NOTE: NLTagger fallback removed - has <50% accuracy and provides unreliable results
            // Users must download the BERT model for named entity detection
            
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
    
    // MARK: - BERT Model Support
    
    @objc(notifyModelDownloaded:withPath:)
    func notifyModelDownloaded(_ modelId: String, path: String) {
        // Called from JS when core module emits LocalIntelligenceModelDownloaded
        if modelId == "bert-small-pii" {
            let modelFile = URL(fileURLWithPath: path)
            let vocabFile = modelFile.deletingLastPathComponent().appendingPathComponent("bert-small-pii.vocab.txt")
            if FileManager.default.fileExists(atPath: modelFile.path) &&
               FileManager.default.fileExists(atPath: vocabFile.path) {
                DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                    self?.loadOnnxModel(modelFile: modelFile, vocabFile: vocabFile)
                }
            }
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
    
    private func detectWithBERT(text: String, entities: inout [PIIEntity]) {
        modelLock.lock()
        guard let session = ortSession,
              let tok = tokenizer,
              isModelReady else {
            modelLock.unlock()
            return
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
            
            guard let logitsValue = outputs["logits"] else { return }
            
            // Get logits data
            let logitsData = try logitsValue.tensorData() as Data
            let logitsCount = maxLength * piiLabels.count
            var logits = [Float](repeating: 0, count: logitsCount)
            logitsData.copyBytes(to: &logits, count: logitsCount * MemoryLayout<Float>.size)
            
            // Parse predictions
            var predictions: [(Int, String)] = []
            for i in 0..<tokenized.tokenCount {
                if tokenized.attentionMask[i] == 0 { continue }
                
                // Find max logit for this token
                let startIdx = i * piiLabels.count
                var maxIdx = 0
                var maxVal = logits[startIdx]
                for j in 1..<piiLabels.count {
                    if logits[startIdx + j] > maxVal {
                        maxVal = logits[startIdx + j]
                        maxIdx = j
                    }
                }
                
                let label = piiLabels[maxIdx]
                if label != "O" && config.enabledTypes.contains(label.lowercased()) {
                    predictions.append((i, label))
                }
            }
            
            // Convert predictions to entities
            convertPredictionsToEntities(text: text, tokenized: tokenized, predictions: predictions, entities: &entities)
            
        } catch {
            // Silently fail, will use NLTagger fallback
        }
    }
    
    private func convertPredictionsToEntities(text: String, tokenized: WordPieceTokenizer.TokenizedResult, predictions: [(Int, String)], entities: inout [PIIEntity]) {
        var currentLabel: String? = nil
        var currentStart = -1
        var currentEnd = -1
        
        for (tokenIdx, label) in predictions {
            let charStart = tokenized.tokenToCharStart[tokenIdx]
            let charEnd = tokenized.tokenToCharEnd[tokenIdx]
            
            if charStart < 0 { continue }
            
            if label == currentLabel && charStart <= currentEnd + 2 {
                // Extend current entity
                currentEnd = charEnd
            } else {
                // Save previous entity if exists
                if let prevLabel = currentLabel, currentStart >= 0, currentEnd <= text.count {
                    let startIdx = text.index(text.startIndex, offsetBy: currentStart)
                    let endIdx = text.index(text.startIndex, offsetBy: currentEnd)
                    entities.append(PIIEntity(
                        type: prevLabel.lowercased(),
                        text: String(text[startIdx..<endIdx]),
                        startIndex: currentStart,
                        endIndex: currentEnd,
                        confidence: 0.85
                    ))
                }
                // Start new entity
                currentLabel = label
                currentStart = charStart
                currentEnd = charEnd
            }
        }
        
        // Don't forget last entity
        if let prevLabel = currentLabel, currentStart >= 0, currentEnd <= text.count {
            let startIdx = text.index(text.startIndex, offsetBy: currentStart)
            let endIdx = text.index(text.startIndex, offsetBy: currentEnd)
            entities.append(PIIEntity(
                type: prevLabel.lowercased(),
                text: String(text[startIdx..<endIdx]),
                startIndex: currentStart,
                endIndex: currentEnd,
                confidence: 0.85
            ))
        }
    }
    
    private func triggerModelDownload() {
        // Check if model already exists in cache
        guard let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let cacheDir = documentsDir.appendingPathComponent("local_intelligence_models")
        let modelFile = cacheDir.appendingPathComponent("bert-small-pii.onnx")
        let vocabFile = cacheDir.appendingPathComponent("bert-small-pii.vocab.txt")
        
        if FileManager.default.fileExists(atPath: modelFile.path) &&
           FileManager.default.fileExists(atPath: vocabFile.path) {
            loadOnnxModel(modelFile: modelFile, vocabFile: vocabFile)
        }
        // Model not downloaded yet - will use NLTagger until downloaded via core module
    }
}
