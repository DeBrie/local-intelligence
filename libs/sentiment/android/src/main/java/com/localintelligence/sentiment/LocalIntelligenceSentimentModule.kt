package com.localintelligence.sentiment

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
import java.io.FileInputStream
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.exp

class LocalIntelligenceSentimentModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ComponentCallbacks2 {

    companion object {
        const val NAME = "LocalIntelligenceSentiment"
        const val MODEL_ID = "distilbert-sst2"
        const val MEMORY_PRESSURE_IDLE_THRESHOLD_MS = 30_000L
        const val MAX_TEXT_LENGTH = 10000 // Characters
        const val MAX_BATCH_SIZE = 100
        
        // DistilBERT-SST2 labels: 0 = negative, 1 = positive
        val SENTIMENT_LABELS = listOf("negative", "positive")
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var isInitialized = false
    private var config = SentimentConfig()
    private var stats = SentimentStats()
    private val cache = ConcurrentHashMap<String, CachedResult>()
    
    // ONNX Runtime for DistilBERT-SST2 model
    @Volatile private var ortEnvironment: OrtEnvironment? = null
    @Volatile private var ortSession: OrtSession? = null
    @Volatile private var tokenizer: WordPieceTokenizer? = null
    @Volatile private var isModelReady = false
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
        
        // Input validation
        if (text.isBlank()) {
            promise.reject("INVALID_INPUT", "Text cannot be empty")
            return
        }
        
        if (text.length > MAX_TEXT_LENGTH) {
            promise.reject("INVALID_INPUT", "Text exceeds maximum length of $MAX_TEXT_LENGTH characters")
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
        
        // Input validation
        if (texts.size() == 0) {
            promise.reject("INVALID_INPUT", "Batch cannot be empty")
            return
        }
        
        if (texts.size() > MAX_BATCH_SIZE) {
            promise.reject("INVALID_INPUT", "Batch exceeds maximum size of $MAX_BATCH_SIZE items")
            return
        }
        
        for (i in 0 until texts.size()) {
            val text = texts.getString(i) ?: ""
            if (text.isBlank()) {
                promise.reject("INVALID_INPUT", "Text at index $i cannot be empty")
                return
            }
            if (text.length > MAX_TEXT_LENGTH) {
                promise.reject("INVALID_INPUT", "Text at index $i exceeds maximum length of $MAX_TEXT_LENGTH characters")
                return
            }
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
        lastAccessTimeMs = System.currentTimeMillis()
        
        if (!isModelReady) {
            throw IllegalStateException("Model not loaded. Call downloadModel() and wait for it to complete before analyzing.")
        }
        
        return analyzeWithONNX(text, startTime)
    }
    
    private fun analyzeWithONNX(text: String, startTime: Long): SentimentResult {
        val session: OrtSession
        val env: OrtEnvironment
        val tok: WordPieceTokenizer
        
        synchronized(modelLock) {
            session = ortSession ?: throw IllegalStateException("ONNX session not initialized")
            env = ortEnvironment ?: throw IllegalStateException("ONNX environment not initialized")
            tok = tokenizer ?: throw IllegalStateException("Tokenizer not initialized")
        }
        
        try {
            val maxLength = 512
            val tokenized = tok.tokenize(text, maxLength, true)
            
            // Create input tensors
            val inputIdsArray = Array(1) { LongArray(maxLength) { tokenized.inputIds[it].toLong() } }
            val attentionMaskArray = Array(1) { LongArray(maxLength) { tokenized.attentionMask[it].toLong() } }
            
            val inputIdsTensor = OnnxTensor.createTensor(env, inputIdsArray)
            val attentionMaskTensor = OnnxTensor.createTensor(env, attentionMaskArray)
            
            val inputs = mapOf(
                "input_ids" to inputIdsTensor,
                "attention_mask" to attentionMaskTensor
            )
            
            val outputs = session.run(inputs)
            val logits = (outputs[0].value as Array<FloatArray>)[0]
            
            // Apply softmax to get probabilities
            val probs = softmax(logits)
            val negativeProb = probs[0].toDouble()
            val positiveProb = probs[1].toDouble()
            
            // Determine label and confidence
            val label: String
            val confidence: Double
            
            if (positiveProb > negativeProb) {
                label = "positive"
                confidence = positiveProb
            } else {
                label = "negative"
                confidence = negativeProb
            }
            
            // Calculate neutral as inverse of max confidence (SST-2 is binary)
            val neutralScore = 1.0 - confidence
            
            val processingTime = (System.currentTimeMillis() - startTime).toDouble()
            
            inputIdsTensor.close()
            attentionMaskTensor.close()
            outputs.close()
            
            return SentimentResult(
                text = text,
                label = label,
                confidence = confidence,
                scores = SentimentResult.Scores(
                    positive = positiveProb,
                    negative = negativeProb,
                    neutral = neutralScore
                ),
                processingTimeMs = processingTime
            )
        } catch (e: Exception) {
            throw IllegalStateException("ONNX inference failed: ${e.message}", e)
        }
    }
    
    private fun softmax(logits: FloatArray): FloatArray {
        val maxLogit = logits.maxOrNull() ?: 0f
        val expValues = logits.map { exp((it - maxLogit).toDouble()).toFloat() }.toFloatArray()
        val sumExp = expValues.sum()
        return expValues.map { it / sumExp }.toFloatArray()
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

    @ReactMethod
    fun notifyModelDownloaded(modelId: String, path: String) {
        if (modelId == MODEL_ID) {
            scope.launch {
                loadOnnxModel(path)
            }
        }
    }
    
    @ReactMethod
    fun getModelStatus(promise: Promise) {
        val status = if (isModelReady) "ready" else "not_ready"
        val result = JSONObject().apply {
            put("status", status)
            put("modelId", MODEL_ID)
            put("isModelReady", isModelReady)
        }
        promise.resolve(result.toString())
    }
    
    private fun loadOnnxModel(modelPath: String) {
        synchronized(modelLock) {
            try {
                val modelFile = File(modelPath)
                if (!modelFile.exists()) return
                
                // Load vocab file
                val vocabFile = File(modelFile.parent, "$MODEL_ID.vocab.txt")
                if (!vocabFile.exists()) return
                
                // Initialize tokenizer
                tokenizer = WordPieceTokenizer(vocabFile)
                
                // Initialize ONNX Runtime
                ortEnvironment = OrtEnvironment.getEnvironment()
                ortSession = ortEnvironment?.createSession(modelPath)
                
                isModelReady = true
                
                // Emit model ready event
                val params = Arguments.createMap().apply {
                    putString("modelId", MODEL_ID)
                }
                sendEvent("onModelReady", params)
            } catch (e: Exception) {
                ortSession = null
                ortEnvironment = null
                tokenizer = null
                isModelReady = false
            }
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
