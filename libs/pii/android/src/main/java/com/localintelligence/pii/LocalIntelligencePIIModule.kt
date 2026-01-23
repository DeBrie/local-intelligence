package com.localintelligence.pii

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.localintelligence.core.WordPieceTokenizer
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.LongBuffer
import java.util.regex.Pattern

class LocalIntelligencePIIModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ComponentCallbacks2 {

    companion object {
        const val NAME = "LocalIntelligencePII"
        const val MEMORY_PRESSURE_IDLE_THRESHOLD_MS = 30_000L

        // PII Labels from gravitee-io/bert-small-pii-detection model
        val PII_LABELS = listOf(
            "O",  // Outside (not PII)
            "AGE",
            "COORDINATE",
            "CREDIT_CARD",
            "DATE_TIME",
            "EMAIL_ADDRESS",
            "FINANCIAL",
            "IBAN_CODE",
            "IMEI",
            "IP_ADDRESS",
            "LOCATION",
            "MAC_ADDRESS",
            "NRP",
            "ORGANIZATION",
            "PASSWORD",
            "PERSON",
            "PHONE_NUMBER",
            "TITLE",
            "URL",
            "US_BANK_NUMBER",
            "US_DRIVER_LICENSE",
            "US_ITIN",
            "US_LICENSE_PLATE",
            "US_PASSPORT",
            "US_SSN"
        )

        fun labelToType(label: String): String = label.lowercase()
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var isInitialized = false
    @Volatile private var isModelReady = false
    @Volatile private var isModelDownloading = false
    private var config = PIIConfig()
    private val customPatterns = mutableMapOf<String, CustomPattern>()
    private var stats = PIIStats()
    
    // ONNX Runtime for BERT PII model
    @Volatile private var ortEnvironment: OrtEnvironment? = null
    @Volatile private var ortSession: OrtSession? = null
    @Volatile private var tokenizer: WordPieceTokenizer? = null
    private val modelLock = Any()
    @Volatile private var lastAccessTimeMs: Long = System.currentTimeMillis()

    init {
        reactApplicationContext.registerComponentCallbacks(this)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {}

    override fun onLowMemory() {
        handleMemoryPressure(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }

    override fun onTrimMemory(level: Int) {
        handleMemoryPressure(level)
    }

    private fun handleMemoryPressure(level: Int) {
        val timeSinceLastAccess = System.currentTimeMillis() - lastAccessTimeMs
        
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> {
                unloadModelInternal()
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE && timeSinceLastAccess > MEMORY_PRESSURE_IDLE_THRESHOLD_MS -> {
                unloadModelInternal()
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND && timeSinceLastAccess > MEMORY_PRESSURE_IDLE_THRESHOLD_MS * 2 -> {
                unloadModelInternal()
            }
        }
    }

    private fun unloadModelInternal() {
        synchronized(modelLock) {
            ortSession?.close()
            ortSession = null
            tokenizer = null
            isModelReady = false
        }
    }

    private val regexPatterns = mapOf(
        "email_address" to PatternInfo(
            """[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}""",
            "email_address"
        ),
        "phone_number" to PatternInfo(
            """\b(?:\+1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b""",
            "phone_number"
        ),
        // SSN regex: Must have dashes in standard format (XXX-XX-XXXX) or be preceded by SSN/Social Security keywords
        // First group (001-899, excluding 666) - Second group (01-99) - Third group (0001-9999)
        // This prevents matching arbitrary 9-digit numbers
        "us_ssn" to PatternInfo(
            """(?:(?:SSN|Social Security|social security)[:\s]*)?(?!000|666|9\d{2})[0-8]\d{2}-(?!00)\d{2}-(?!0000)\d{4}""",
            "us_ssn"
        ),
        "credit_card" to PatternInfo(
            """\b(?:[0-9]{4}[-\s]?){3}[0-9]{4}\b""",
            "credit_card"
        ),
        "ip_address" to PatternInfo(
            """\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b""",
            "ip_address"
        ),
        "url" to PatternInfo(
            """https?://[^\s]+""",
            "url"
        ),
        "iban_code" to PatternInfo(
            """\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}\b""",
            "iban_code"
        ),
        "mac_address" to PatternInfo(
            """\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\b""",
            "mac_address"
        ),
        "coordinate" to PatternInfo(
            """\b[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)\b""",
            "coordinate"
        ),
        "us_driver_license" to PatternInfo(
            """\b[A-Z][0-9]{3,8}\b""",
            "us_driver_license"
        )
    )

    data class PIIConfig(
        var enabledTypes: List<String> = listOf(
            "person", "organization", "location", "email_address", "phone_number",
            "us_ssn", "credit_card", "date_time", "ip_address", "url"
        ),
        var redactionChar: String = "*",
        var minConfidence: Double = 0.7,
        var preserveLength: Boolean = true
    )

    data class PatternInfo(val pattern: String, val type: String)
    data class CustomPattern(val name: String, val pattern: String, val type: String)

    data class PIIStats(
        var totalScanned: Int = 0,
        var totalRedacted: Int = 0,
        var byType: MutableMap<String, Int> = mutableMapOf(),
        var totalProcessingTimeMs: Double = 0.0,
        var processCount: Int = 0
    )

    data class PIIEntity(
        val type: String,
        val text: String,
        val startIndex: Int,
        val endIndex: Int,
        val confidence: Double
    )

    data class RedactionResult(
        val originalText: String,
        val redactedText: String,
        val entities: List<PIIEntity>,
        val processingTimeMs: Double
    )

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private var modelDownloadSubscription: Any? = null
    
    @ReactMethod
    fun addListener(eventName: String) {
        // Subscribe to model download events from core module
        if (eventName == "onPIIRedaction" && modelDownloadSubscription == null) {
            // Will be handled via JS bridge
        }
    }

    @ReactMethod
    fun removeListeners(count: Int) {}
    
    @ReactMethod
    fun notifyModelDownloaded(modelId: String, path: String) {
        android.util.Log.d("PII", "notifyModelDownloaded called with modelId: $modelId, path: $path")
        // Called from JS when core module emits LocalIntelligenceModelDownloaded
        if (modelId == "bert-small-pii") {
            val modelFile = File(path)
            val vocabFile = File(modelFile.parent, "bert-small-pii.vocab.txt")
            android.util.Log.d("PII", "Model file exists: ${modelFile.exists()}, Vocab file exists: ${vocabFile.exists()}")
            if (modelFile.exists() && vocabFile.exists()) {
                scope.launch {
                    loadOnnxModel(modelFile, vocabFile)
                }
            } else {
                android.util.Log.e("PII", "Missing required files - model: ${modelFile.absolutePath}, vocab: ${vocabFile.absolutePath}")
            }
        }
    }

    @ReactMethod
    fun initialize(configJson: String, promise: Promise) {
        try {
            val configObj = JSONObject(configJson)
            
            if (configObj.has("enabledTypes")) {
                val typesArray = configObj.getJSONArray("enabledTypes")
                config.enabledTypes = (0 until typesArray.length()).map { typesArray.getString(it) }
            }
            if (configObj.has("redactionChar")) {
                config.redactionChar = configObj.getString("redactionChar")
            }
            if (configObj.has("minConfidence")) {
                config.minConfidence = configObj.getDouble("minConfidence")
            }
            if (configObj.has("preserveLength")) {
                config.preserveLength = configObj.getBoolean("preserveLength")
            }
            
            isInitialized = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", "Failed to initialize PII module", e)
        }
    }

    // ML-required entity types that need BERT model for accurate detection
    private val mlRequiredTypes = listOf("person", "organization", "location", "age", "date_time", "title", "nrp")
    
    @ReactMethod
    fun detectEntities(text: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "PII module not initialized")
            return
        }
        
        // Check if user requested ML-required types but model isn't ready
        val requestedMLTypes = config.enabledTypes.filter { mlRequiredTypes.contains(it) }
        if (requestedMLTypes.isNotEmpty() && !isModelReady) {
            promise.reject("MODEL_NOT_READY", 
                "PII model not ready. ML-based entity types (${requestedMLTypes.joinToString(", ")}) require the BERT model. Call Core.downloadModel('bert-small-pii') first.")
            return
        }

        scope.launch {
            try {
                val startTime = System.currentTimeMillis()
                val entities = detectEntitiesInternal(text)
                val processingTime = (System.currentTimeMillis() - startTime).toDouble()
                
                updateStats(entities, processingTime)
                
                val jsonArray = JSONArray()
                entities.forEach { entity ->
                    jsonArray.put(JSONObject().apply {
                        put("type", entity.type)
                        put("text", entity.text)
                        put("startIndex", entity.startIndex)
                        put("endIndex", entity.endIndex)
                        put("confidence", entity.confidence)
                    })
                }
                
                promise.resolve(jsonArray.toString())
            } catch (e: Exception) {
                promise.reject("DETECT_ERROR", "Failed to detect entities", e)
            }
        }
    }

    @ReactMethod
    fun redactText(text: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "PII module not initialized")
            return
        }

        scope.launch {
            try {
                val startTime = System.currentTimeMillis()
                val entities = detectEntitiesInternal(text)
                val redactedText = performRedaction(text, entities)
                val processingTime = (System.currentTimeMillis() - startTime).toDouble()
                
                updateStats(entities, processingTime)
                
                val result = JSONObject().apply {
                    put("originalText", text)
                    put("redactedText", redactedText)
                    put("entities", JSONArray().apply {
                        entities.forEach { entity ->
                            put(JSONObject().apply {
                                put("type", entity.type)
                                put("text", entity.text)
                                put("startIndex", entity.startIndex)
                                put("endIndex", entity.endIndex)
                                put("confidence", entity.confidence)
                            })
                        }
                    })
                    put("processingTimeMs", processingTime)
                }
                
                // Emit event
                val params = Arguments.createMap().apply {
                    putString("text", redactedText)
                    putString("entities", JSONArray().apply {
                        entities.forEach { entity ->
                            put(JSONObject().apply {
                                put("type", entity.type)
                                put("text", entity.text)
                            })
                        }
                    }.toString())
                }
                sendEvent("onPIIRedaction", params)
                
                promise.resolve(result.toString())
            } catch (e: Exception) {
                promise.reject("REDACT_ERROR", "Failed to redact text", e)
            }
        }
    }

    @ReactMethod
    fun redactBatch(texts: ReadableArray, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "PII module not initialized")
            return
        }

        scope.launch {
            try {
                val results = JSONArray()
                
                for (i in 0 until texts.size()) {
                    val text = texts.getString(i) ?: continue
                    val startTime = System.currentTimeMillis()
                    val entities = detectEntitiesInternal(text)
                    val redactedText = performRedaction(text, entities)
                    val processingTime = (System.currentTimeMillis() - startTime).toDouble()
                    
                    results.put(JSONObject().apply {
                        put("originalText", text)
                        put("redactedText", redactedText)
                        put("entities", JSONArray().apply {
                            entities.forEach { entity ->
                                put(JSONObject().apply {
                                    put("type", entity.type)
                                    put("text", entity.text)
                                    put("startIndex", entity.startIndex)
                                    put("endIndex", entity.endIndex)
                                    put("confidence", entity.confidence)
                                })
                            }
                        })
                        put("processingTimeMs", processingTime)
                    })
                }
                
                promise.resolve(results.toString())
            } catch (e: Exception) {
                promise.reject("BATCH_ERROR", "Failed to redact batch", e)
            }
        }
    }

    @ReactMethod
    fun addCustomPattern(name: String, pattern: String, type: String, promise: Promise) {
        try {
            Pattern.compile(pattern)
            customPatterns[name] = CustomPattern(name, pattern, type)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INVALID_PATTERN", "Invalid regex pattern", e)
        }
    }

    @ReactMethod
    fun removeCustomPattern(name: String, promise: Promise) {
        val removed = customPatterns.remove(name) != null
        promise.resolve(removed)
    }

    @ReactMethod
    fun getStats(promise: Promise) {
        try {
            val avgTime = if (stats.processCount > 0) {
                stats.totalProcessingTimeMs / stats.processCount
            } else 0.0
            
            val result = JSONObject().apply {
                put("totalScanned", stats.totalScanned)
                put("totalRedacted", stats.totalRedacted)
                put("byType", JSONObject(stats.byType.toMap()))
                put("averageProcessingTimeMs", avgTime)
            }
            
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("STATS_ERROR", "Failed to get stats", e)
        }
    }

    @ReactMethod
    fun resetStats(promise: Promise) {
        stats = PIIStats()
        promise.resolve(true)
    }

    @ReactMethod
    fun getModelStatus(promise: Promise) {
        try {
            val status = when {
                isModelReady -> "ready"
                isModelDownloading -> "downloading"
                else -> "not_ready"
            }
            
            val result = JSONObject().apply {
                put("status", status)
                put("modelId", "bert-small-pii")
                put("isModelReady", isModelReady)
            }
            
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", "Failed to get model status", e)
        }
    }

    private fun detectEntitiesInternal(text: String): List<PIIEntity> {
        val entities = mutableListOf<PIIEntity>()
        
        // Regex-based detection for structured PII
        regexPatterns.forEach { (_, patternInfo) ->
            if (config.enabledTypes.contains(patternInfo.type)) {
                try {
                    val pattern = Pattern.compile(patternInfo.pattern)
                    val matcher = pattern.matcher(text)
                    
                    while (matcher.find()) {
                        entities.add(PIIEntity(
                            type = patternInfo.type,
                            text = matcher.group(),
                            startIndex = matcher.start(),
                            endIndex = matcher.end(),
                            confidence = 0.95
                        ))
                    }
                } catch (e: Exception) {
                    // Skip invalid patterns
                }
            }
        }
        
        // Custom patterns
        customPatterns.values.forEach { customPattern ->
            try {
                val pattern = Pattern.compile(customPattern.pattern)
                val matcher = pattern.matcher(text)
                
                while (matcher.find()) {
                    entities.add(PIIEntity(
                        type = customPattern.type,
                        text = matcher.group(),
                        startIndex = matcher.start(),
                        endIndex = matcher.end(),
                        confidence = 0.90
                    ))
                }
            } catch (e: Exception) {
                // Skip invalid patterns
            }
        }
        
        // ML-based NER detection for person names and addresses
        // Uses tiny-bert-pii model when available, falls back to heuristics
        if (config.enabledTypes.contains("person") || config.enabledTypes.contains("address")) {
            detectNEREntities(text, entities)
        }
        
        // Sort and remove overlaps
        return removeOverlappingEntities(entities.sortedBy { it.startIndex })
    }

    private fun detectNEREntities(text: String, entities: MutableList<PIIEntity>) {
        // Check if BERT model is available
        if (isModelReady) {
            detectWithBERT(text, entities)
        } else {
            // Fallback to heuristic detection when model not available
            detectNamesHeuristic(text, entities)
            detectAddressesHeuristic(text, entities)
            
            // Trigger background model download if not already downloading
            if (!isModelDownloading) {
                triggerModelDownload()
            }
        }
    }

    private fun detectWithBERT(text: String, entities: MutableList<PIIEntity>) {
        val session: OrtSession
        val env: OrtEnvironment
        val tok: WordPieceTokenizer
        
        synchronized(modelLock) {
            session = ortSession ?: run {
                detectNamesHeuristic(text, entities)
                detectAddressesHeuristic(text, entities)
                return
            }
            env = ortEnvironment ?: run {
                detectNamesHeuristic(text, entities)
                detectAddressesHeuristic(text, entities)
                return
            }
            tok = tokenizer ?: run {
                detectNamesHeuristic(text, entities)
                detectAddressesHeuristic(text, entities)
                return
            }
        }
        
        try {
            // Tokenize text using proper WordPiece tokenizer
            val maxLength = 512
            val tokenized = tok.tokenize(text, maxLength)
            
            // Create input tensors
            val inputIds = LongBuffer.wrap(tokenized.inputIds.map { it.toLong() }.toLongArray())
            val attentionMask = LongBuffer.wrap(tokenized.attentionMask.map { it.toLong() }.toLongArray())
            
            val inputIdsTensor = OnnxTensor.createTensor(env, inputIds, longArrayOf(1, maxLength.toLong()))
            val attentionMaskTensor = OnnxTensor.createTensor(env, attentionMask, longArrayOf(1, maxLength.toLong()))
            
            val inputs = mapOf(
                "input_ids" to inputIdsTensor,
                "attention_mask" to attentionMaskTensor
            )
            
            // Run inference
            val results = session.run(inputs)
            val logits = results[0].value as Array<Array<FloatArray>>
            
            // Parse predictions
            val predictions = mutableListOf<Pair<Int, String>>()
            for (i in 0 until tokenized.tokenCount) {
                if (tokenized.attentionMask[i] == 0) continue
                
                val tokenLogits = logits[0][i]
                val maxIdx = tokenLogits.indices.maxByOrNull { tokenLogits[it] } ?: 0
                val label = PII_LABELS.getOrElse(maxIdx) { "O" }
                
                if (label != "O" && config.enabledTypes.contains(label.lowercase())) {
                    predictions.add(i to label)
                }
            }
            
            // Convert token predictions to entity spans
            convertPredictionsToEntitiesFromTokenizer(text, tokenized, predictions, entities)
            
            // Cleanup
            inputIdsTensor.close()
            attentionMaskTensor.close()
            results.close()
            
        } catch (e: Exception) {
            // Fallback on error
            detectNamesHeuristic(text, entities)
            detectAddressesHeuristic(text, entities)
        }
    }
    
    private fun convertPredictionsToEntitiesFromTokenizer(
        text: String,
        tokenized: WordPieceTokenizer.TokenizedResult,
        predictions: List<Pair<Int, String>>,
        entities: MutableList<PIIEntity>
    ) {
        // Group consecutive tokens with same label
        var currentLabel: String? = null
        var currentStart = -1
        var currentEnd = -1
        
        for ((tokenIdx, label) in predictions) {
            val charStart = tokenized.tokenToCharStart[tokenIdx]
            val charEnd = tokenized.tokenToCharEnd[tokenIdx]
            
            if (charStart < 0) continue
            
            if (label == currentLabel && charStart <= currentEnd + 2) {
                // Extend current entity
                currentEnd = charEnd
            } else {
                // Save previous entity if exists
                if (currentLabel != null && currentStart >= 0 && currentEnd <= text.length) {
                    entities.add(PIIEntity(
                        type = currentLabel.lowercase(),
                        text = text.substring(currentStart, currentEnd),
                        startIndex = currentStart,
                        endIndex = currentEnd,
                        confidence = 0.85
                    ))
                }
                // Start new entity
                currentLabel = label
                currentStart = charStart
                currentEnd = charEnd
            }
        }
        
        // Don't forget last entity
        if (currentLabel != null && currentStart >= 0 && currentEnd <= text.length) {
            entities.add(PIIEntity(
                type = currentLabel.lowercase(),
                text = text.substring(currentStart, currentEnd),
                startIndex = currentStart,
                endIndex = currentEnd,
                confidence = 0.85
            ))
        }
    }

    private fun detectNamesHeuristic(text: String, entities: MutableList<PIIEntity>) {
        val detectPerson = config.enabledTypes.contains("person")
        val detectOrg = config.enabledTypes.contains("organization")
        
        if (!detectPerson && !detectOrg) return
        
        // Enhanced capitalized word sequence detection
        val namePattern = Pattern.compile("""\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b""")
        val matcher = namePattern.matcher(text)
        
        // Organization indicators
        val orgSuffixes = listOf("Corporation", "Corp", "Company", "Co", "Inc", "LLC", "Ltd", 
            "Limited", "Group", "Holdings", "Industries", "International", "Foundation",
            "Association", "Institute", "University", "College", "Bank", "Partners")
        
        // Common non-name phrases to filter out
        val commonPhrases = listOf("The", "This", "That", "These", "Those", "Monday", "Tuesday", 
            "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", 
            "March", "April", "May", "June", "July", "August", "September", "October", 
            "November", "December", "New York", "Los Angeles", "San Francisco")
        
        while (matcher.find()) {
            val match = matcher.group()
            val words = match.split(" ")
            
            if (words.any { commonPhrases.contains(it) }) continue
            
            // Check if it looks like an organization
            val isOrganization = words.any { word -> orgSuffixes.any { suffix -> 
                word.equals(suffix, ignoreCase = true) 
            }}
            
            if (isOrganization && detectOrg) {
                entities.add(PIIEntity(
                    type = "organization",
                    text = match,
                    startIndex = matcher.start(),
                    endIndex = matcher.end(),
                    confidence = if (isModelReady) 0.85 else 0.40  // Heuristic has lower accuracy
                ))
            } else if (!isOrganization && detectPerson) {
                entities.add(PIIEntity(
                    type = "person",
                    text = match,
                    startIndex = matcher.start(),
                    endIndex = matcher.end(),
                    confidence = if (isModelReady) 0.85 else 0.45  // Heuristic has lower accuracy
                ))
            }
        }
    }

    private fun detectAddressesHeuristic(text: String, entities: MutableList<PIIEntity>) {
        if (!config.enabledTypes.contains("address")) return
        
        // Basic US address pattern detection
        val addressPattern = Pattern.compile(
            """\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b""",
            Pattern.CASE_INSENSITIVE
        )
        val matcher = addressPattern.matcher(text)
        
        while (matcher.find()) {
            entities.add(PIIEntity(
                type = "address",
                text = matcher.group(),
                startIndex = matcher.start(),
                endIndex = matcher.end(),
                confidence = if (isModelReady) 0.85 else 0.40  // Heuristic has lower accuracy
            ))
        }
    }

    private fun triggerModelDownload() {
        // Check if model already exists in cache
        val cacheDir = File(reactApplicationContext.filesDir, "local_intelligence_models")
        val modelFile = File(cacheDir, "bert-small-pii.onnx")
        val vocabFile = File(cacheDir, "bert-small-pii.vocab.txt")
        
        if (modelFile.exists() && vocabFile.exists()) {
            loadOnnxModel(modelFile, vocabFile)
            return
        }
        
        // Model not downloaded yet - will use regex/heuristics until downloaded via core module
        isModelDownloading = false
        isModelReady = false
    }
    
    private fun loadOnnxModel(modelFile: File, vocabFile: File) {
        android.util.Log.d("PII", "loadOnnxModel called with model: ${modelFile.absolutePath}, vocab: ${vocabFile.absolutePath}")
        synchronized(modelLock) {
            try {
                // Load tokenizer first
                android.util.Log.d("PII", "Initializing tokenizer...")
                tokenizer = WordPieceTokenizer(vocabFile)
                android.util.Log.d("PII", "Tokenizer initialized successfully")
                
                // Then load ONNX model
                android.util.Log.d("PII", "Initializing ONNX Runtime...")
                ortEnvironment = OrtEnvironment.getEnvironment()
                ortSession = ortEnvironment?.createSession(modelFile.absolutePath)
                android.util.Log.d("PII", "ONNX session created successfully")
                
                isModelReady = true
                isModelDownloading = false
                android.util.Log.d("PII", "Model is now ready!")
            } catch (e: Exception) {
                android.util.Log.e("PII", "Error loading model: ${e.message}", e)
                tokenizer = null
                ortSession = null
                isModelReady = false
                isModelDownloading = false
            }
        }
    }
    
    fun onModelDownloaded(modelId: String, path: String) {
        android.util.Log.d("PII", "onModelDownloaded called with modelId: $modelId, path: $path")
        if (modelId == "bert-small-pii") {
            val modelFile = File(path)
            val vocabFile = File(modelFile.parent, "bert-small-pii.vocab.txt")
            android.util.Log.d("PII", "Model file exists: ${modelFile.exists()}, Vocab file exists: ${vocabFile.exists()}")
            if (modelFile.exists() && vocabFile.exists()) {
                loadOnnxModel(modelFile, vocabFile)
            } else {
                android.util.Log.e("PII", "Missing required files for model loading")
            }
        }
    }

    private fun performRedaction(text: String, entities: List<PIIEntity>): String {
        if (entities.isEmpty()) return text
        
        val sb = StringBuilder(text)
        
        // Process in reverse order to maintain indices
        entities.sortedByDescending { it.startIndex }.forEach { entity ->
            val replacement = if (config.preserveLength) {
                config.redactionChar.repeat(entity.text.length)
            } else {
                "[${entity.type.uppercase()}]"
            }
            sb.replace(entity.startIndex, entity.endIndex, replacement)
        }
        
        return sb.toString()
    }

    private fun removeOverlappingEntities(entities: List<PIIEntity>): List<PIIEntity> {
        val result = mutableListOf<PIIEntity>()
        var lastEnd = -1
        
        entities.forEach { entity ->
            if (entity.startIndex >= lastEnd) {
                result.add(entity)
                lastEnd = entity.endIndex
            }
        }
        
        return result
    }

    private fun updateStats(entities: List<PIIEntity>, processingTime: Double) {
        stats.totalScanned++
        stats.totalRedacted += entities.size
        stats.totalProcessingTimeMs += processingTime
        stats.processCount++
        
        entities.forEach { entity ->
            stats.byType[entity.type] = (stats.byType[entity.type] ?: 0) + 1
        }
    }
}
