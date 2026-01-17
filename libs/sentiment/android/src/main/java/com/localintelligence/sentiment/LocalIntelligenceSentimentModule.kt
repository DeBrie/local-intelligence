package com.localintelligence.sentiment

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs

class LocalIntelligenceSentimentModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LocalIntelligenceSentiment"
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var isInitialized = false
    private var config = SentimentConfig()
    private var stats = SentimentStats()
    private val cache = ConcurrentHashMap<String, CachedResult>()

    private val positiveWords = setOf(
        "good", "great", "excellent", "amazing", "wonderful", "fantastic", "awesome",
        "love", "like", "happy", "joy", "pleased", "delighted", "satisfied", "perfect",
        "beautiful", "brilliant", "superb", "outstanding", "magnificent", "terrific",
        "best", "better", "nice", "fine", "positive", "success", "successful", "win",
        "enjoy", "enjoyed", "enjoying", "thank", "thanks", "grateful", "appreciate"
    )

    private val negativeWords = setOf(
        "bad", "terrible", "awful", "horrible", "poor", "worst", "hate", "dislike",
        "sad", "angry", "upset", "disappointed", "frustrated", "annoyed", "unhappy",
        "fail", "failed", "failure", "wrong", "problem", "issue", "error", "mistake",
        "ugly", "disgusting", "pathetic", "useless", "waste", "boring", "stupid",
        "never", "nothing", "nobody", "nowhere", "neither", "cannot", "can't", "won't"
    )

    private val intensifiers = setOf(
        "very", "really", "extremely", "absolutely", "completely", "totally", "highly",
        "incredibly", "remarkably", "exceptionally", "particularly", "especially"
    )

    private val negators = setOf(
        "not", "no", "never", "neither", "nobody", "nothing", "nowhere",
        "hardly", "barely", "scarcely", "don't", "doesn't", "didn't", "won't",
        "wouldn't", "couldn't", "shouldn't", "isn't", "aren't", "wasn't", "weren't"
    )

    data class SentimentConfig(
        var minConfidence: Double = 0.5,
        var defaultLabel: String = "neutral",
        var enableCaching: Boolean = true,
        var maxCacheSize: Int = 100
    )

    data class CachedResult(
        val result: SentimentResult,
        val timestamp: Long
    )

    data class SentimentStats(
        var totalAnalyzed: Int = 0,
        var byLabel: MutableMap<String, Int> = mutableMapOf("positive" to 0, "negative" to 0, "neutral" to 0),
        var totalConfidence: Double = 0.0,
        var totalProcessingTimeMs: Double = 0.0
    )

    data class SentimentResult(
        val text: String,
        val label: String,
        val confidence: Double,
        val scores: Scores,
        val processingTimeMs: Double
    ) {
        data class Scores(
            val positive: Double,
            val negative: Double,
            val neutral: Double
        )
    }

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
            
            if (configObj.has("minConfidence")) {
                config.minConfidence = configObj.getDouble("minConfidence")
            }
            if (configObj.has("defaultLabel")) {
                config.defaultLabel = configObj.getString("defaultLabel")
            }
            if (configObj.has("enableCaching")) {
                config.enableCaching = configObj.getBoolean("enableCaching")
            }
            if (configObj.has("maxCacheSize")) {
                config.maxCacheSize = configObj.getInt("maxCacheSize")
            }
            
            isInitialized = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", "Failed to initialize sentiment module", e)
        }
    }

    @ReactMethod
    fun analyze(text: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "Sentiment module not initialized")
            return
        }

        scope.launch {
            try {
                // Check cache
                if (config.enableCaching) {
                    cache[text]?.let { cached ->
                        val result = cached.result
                        val json = resultToJson(result)
                        promise.resolve(json.toString())
                        return@launch
                    }
                }

                val startTime = System.currentTimeMillis()
                val result = analyzeSentiment(text, startTime)
                
                // Update stats
                synchronized(stats) {
                    stats.totalAnalyzed++
                    stats.byLabel[result.label] = (stats.byLabel[result.label] ?: 0) + 1
                    stats.totalConfidence += result.confidence
                    stats.totalProcessingTimeMs += result.processingTimeMs
                }
                
                // Cache result
                if (config.enableCaching) {
                    cacheResult(text, result)
                }
                
                // Emit event
                val params = Arguments.createMap().apply {
                    putString("result", resultToJson(result).toString())
                }
                sendEvent("onSentimentAnalysis", params)
                
                promise.resolve(resultToJson(result).toString())
            } catch (e: Exception) {
                promise.reject("ANALYZE_ERROR", "Failed to analyze sentiment", e)
            }
        }
    }

    @ReactMethod
    fun analyzeBatch(texts: ReadableArray, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "Sentiment module not initialized")
            return
        }

        scope.launch {
            try {
                val batchStartTime = System.currentTimeMillis()
                val results = mutableListOf<SentimentResult>()
                var totalConfidence = 0.0
                
                for (i in 0 until texts.size()) {
                    val text = texts.getString(i) ?: continue
                    val startTime = System.currentTimeMillis()
                    val result = analyzeSentiment(text, startTime)
                    results.add(result)
                    totalConfidence += result.confidence
                    
                    // Update stats
                    synchronized(stats) {
                        stats.totalAnalyzed++
                        stats.byLabel[result.label] = (stats.byLabel[result.label] ?: 0) + 1
                        stats.totalConfidence += result.confidence
                        stats.totalProcessingTimeMs += result.processingTimeMs
                    }
                }
                
                val totalTime = (System.currentTimeMillis() - batchStartTime).toDouble()
                val avgConfidence = if (results.isNotEmpty()) totalConfidence / results.size else 0.0
                
                val batchResult = JSONObject().apply {
                    put("results", JSONArray().apply {
                        results.forEach { put(resultToJson(it)) }
                    })
                    put("totalProcessingTimeMs", totalTime)
                    put("averageConfidence", avgConfidence)
                }
                
                promise.resolve(batchResult.toString())
            } catch (e: Exception) {
                promise.reject("BATCH_ERROR", "Failed to analyze batch", e)
            }
        }
    }

    @ReactMethod
    fun getStats(promise: Promise) {
        try {
            val avgConfidence = if (stats.totalAnalyzed > 0) {
                stats.totalConfidence / stats.totalAnalyzed
            } else 0.0
            
            val avgTime = if (stats.totalAnalyzed > 0) {
                stats.totalProcessingTimeMs / stats.totalAnalyzed
            } else 0.0
            
            val result = JSONObject().apply {
                put("totalAnalyzed", stats.totalAnalyzed)
                put("byLabel", JSONObject(stats.byLabel.toMap()))
                put("averageConfidence", avgConfidence)
                put("averageProcessingTimeMs", avgTime)
            }
            
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("STATS_ERROR", "Failed to get stats", e)
        }
    }

    @ReactMethod
    fun resetStats(promise: Promise) {
        stats = SentimentStats()
        promise.resolve(true)
    }

    @ReactMethod
    fun clearCache(promise: Promise) {
        cache.clear()
        promise.resolve(true)
    }

    private fun analyzeSentiment(text: String, startTime: Long): SentimentResult {
        val words = text.lowercase().split(Regex("[\\s,.!?;:\"'()\\[\\]{}]+"))
            .filter { it.isNotBlank() }
        
        var positiveScore = 0.0
        var negativeScore = 0.0
        var isNegated = false
        var intensifierMultiplier = 1.0
        
        for (i in words.indices) {
            val word = words[i]
            
            // Check for negators
            if (negators.contains(word)) {
                isNegated = true
                continue
            }
            
            // Check for intensifiers
            if (intensifiers.contains(word)) {
                intensifierMultiplier = 1.5
                continue
            }
            
            // Score positive words
            if (positiveWords.contains(word)) {
                val score = 1.0 * intensifierMultiplier
                if (isNegated) {
                    negativeScore += score
                } else {
                    positiveScore += score
                }
                isNegated = false
                intensifierMultiplier = 1.0
            }
            
            // Score negative words
            if (negativeWords.contains(word)) {
                val score = 1.0 * intensifierMultiplier
                if (isNegated) {
                    positiveScore += score * 0.5 // Negated negative is weakly positive
                } else {
                    negativeScore += score
                }
                isNegated = false
                intensifierMultiplier = 1.0
            }
        }
        
        // Normalize scores
        val total = positiveScore + negativeScore
        val normalizedPositive: Double
        val normalizedNegative: Double
        val normalizedNeutral: Double
        
        if (total > 0) {
            normalizedPositive = positiveScore / (total + 1)
            normalizedNegative = negativeScore / (total + 1)
            normalizedNeutral = 1.0 / (total + 1)
        } else {
            normalizedPositive = 0.0
            normalizedNegative = 0.0
            normalizedNeutral = 1.0
        }
        
        // Determine label and confidence
        val label: String
        val confidence: Double
        
        when {
            normalizedPositive > normalizedNegative && normalizedPositive > normalizedNeutral -> {
                label = "positive"
                confidence = normalizedPositive
            }
            normalizedNegative > normalizedPositive && normalizedNegative > normalizedNeutral -> {
                label = "negative"
                confidence = normalizedNegative
            }
            else -> {
                label = "neutral"
                confidence = normalizedNeutral
            }
        }
        
        val processingTime = (System.currentTimeMillis() - startTime).toDouble()
        
        return SentimentResult(
            text = text,
            label = label,
            confidence = confidence,
            scores = SentimentResult.Scores(
                positive = normalizedPositive,
                negative = normalizedNegative,
                neutral = normalizedNeutral
            ),
            processingTimeMs = processingTime
        )
    }

    private fun resultToJson(result: SentimentResult): JSONObject {
        return JSONObject().apply {
            put("text", result.text)
            put("label", result.label)
            put("confidence", result.confidence)
            put("scores", JSONObject().apply {
                put("positive", result.scores.positive)
                put("negative", result.scores.negative)
                put("neutral", result.scores.neutral)
            })
            put("processingTimeMs", result.processingTimeMs)
        }
    }

    private fun cacheResult(text: String, result: SentimentResult) {
        // Evict oldest entries if cache is full
        if (cache.size >= config.maxCacheSize) {
            val sortedEntries = cache.entries.sortedBy { it.value.timestamp }
            val toRemove = sortedEntries.take(cache.size - config.maxCacheSize + 1)
            toRemove.forEach { cache.remove(it.key) }
        }
        
        cache[text] = CachedResult(result, System.currentTimeMillis())
    }
}
