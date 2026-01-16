package com.debrie.pii

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.regex.Pattern

class DebriePIIModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DebriePII"
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var isInitialized = false
    private var config = PIIConfig()
    private val customPatterns = mutableMapOf<String, CustomPattern>()
    private var stats = PIIStats()

    private val regexPatterns = mapOf(
        "email" to PatternInfo(
            """[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}""",
            "email"
        ),
        "phone" to PatternInfo(
            """\b(?:\+1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b""",
            "phone"
        ),
        "ssn" to PatternInfo(
            """\b[0-9]{3}[-]?[0-9]{2}[-]?[0-9]{4}\b""",
            "ssn"
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
        )
    )

    data class PIIConfig(
        var enabledTypes: List<String> = listOf("person", "organization", "location", "email", "phone", "ssn", "credit_card"),
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

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

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

    @ReactMethod
    fun detectEntities(text: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "PII module not initialized")
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
        
        // Simple heuristic-based name detection for Android
        // (In production, you'd use ML Kit or a BERT model)
        if (config.enabledTypes.contains("person")) {
            detectNames(text, entities)
        }
        
        // Sort and remove overlaps
        return removeOverlappingEntities(entities.sortedBy { it.startIndex })
    }

    private fun detectNames(text: String, entities: MutableList<PIIEntity>) {
        // Simple capitalized word sequence detection as a fallback
        // This is a basic heuristic - production would use ML Kit NER
        val namePattern = Pattern.compile("""\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b""")
        val matcher = namePattern.matcher(text)
        
        while (matcher.find()) {
            val match = matcher.group()
            // Filter out common non-name phrases
            val commonPhrases = listOf("The", "This", "That", "These", "Those", "Monday", "Tuesday", 
                "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", 
                "March", "April", "May", "June", "July", "August", "September", "October", 
                "November", "December")
            
            val words = match.split(" ")
            if (words.none { commonPhrases.contains(it) }) {
                entities.add(PIIEntity(
                    type = "person",
                    text = match,
                    startIndex = matcher.start(),
                    endIndex = matcher.end(),
                    confidence = 0.70
                ))
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
