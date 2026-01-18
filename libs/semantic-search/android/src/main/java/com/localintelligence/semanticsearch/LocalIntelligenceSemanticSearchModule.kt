package com.localintelligence.semanticsearch

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.localintelligence.core.WordPieceTokenizer
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.sqrt

class LocalIntelligenceSemanticSearchModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ComponentCallbacks2 {

    companion object {
        const val NAME = "LocalIntelligenceSemanticSearch"
        const val DEFAULT_EMBEDDING_DIMENSIONS = 384
        const val MEMORY_PRESSURE_IDLE_THRESHOLD_MS = 30_000L
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var isInitialized = false
    @Volatile private var isModelReady = false
    @Volatile private var isModelDownloading = false
    private var config = SemanticSearchConfig()
    private var stats = EmbeddingStats()
    @Volatile private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null
    @Volatile private var tokenizer: WordPieceTokenizer? = null
    private val modelLock = Any()
    @Volatile private var lastAccessTimeMs: Long = System.currentTimeMillis()

    init {
        reactContext.registerComponentCallbacks(this)
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
                // Critical memory pressure - unload immediately
                unloadModelInternal()
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE && timeSinceLastAccess > MEMORY_PRESSURE_IDLE_THRESHOLD_MS -> {
                // Moderate pressure and model idle - unload
                unloadModelInternal()
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND && timeSinceLastAccess > MEMORY_PRESSURE_IDLE_THRESHOLD_MS * 2 -> {
                // Background and model very idle - unload
                unloadModelInternal()
            }
        }
    }

    private fun unloadModelInternal() {
        synchronized(modelLock) {
            interpreter?.close()
            interpreter = null
            gpuDelegate?.close()
            gpuDelegate = null
            tokenizer = null
            isModelReady = false
        }
    }

    data class SemanticSearchConfig(
        var databasePath: String = "",
        var tableName: String = "semantic_index",
        var embeddingDimensions: Int = DEFAULT_EMBEDDING_DIMENSIONS,
        var modelId: String = "minilm-l6-v2"
    )

    data class EmbeddingStats(
        var totalGenerated: Int = 0,
        var totalProcessingTimeMs: Double = 0.0,
        var processCount: Int = 0
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
    fun notifyModelDownloaded(modelId: String, path: String) {
        // Called from JS when core module emits LocalIntelligenceModelDownloaded
        if (modelId == config.modelId) {
            val modelFile = File(path)
            val vocabFile = File(modelFile.parent, "${config.modelId}.vocab.txt")
            if (modelFile.exists() && vocabFile.exists()) {
                scope.launch {
                    loadModel(modelFile, vocabFile)
                }
            }
        }
    }

    @ReactMethod
    fun initialize(configJson: String, promise: Promise) {
        try {
            val configObj = JSONObject(configJson)
            
            if (configObj.has("databasePath")) {
                config.databasePath = configObj.getString("databasePath")
            }
            if (configObj.has("tableName")) {
                config.tableName = configObj.getString("tableName")
            }
            if (configObj.has("embeddingDimensions")) {
                config.embeddingDimensions = configObj.getInt("embeddingDimensions")
            }
            if (configObj.has("modelId")) {
                config.modelId = configObj.getString("modelId")
            }
            
            // Check if model is available, trigger download if not
            checkAndDownloadModel()
            
            isInitialized = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", "Failed to initialize semantic search", e)
        }
    }

    @ReactMethod
    fun generateEmbedding(text: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "Semantic search not initialized")
            return
        }

        scope.launch {
            try {
                val startTime = System.currentTimeMillis()
                val embedding = generateEmbeddingInternal(text)
                val processingTime = (System.currentTimeMillis() - startTime).toDouble()
                
                updateStats(processingTime)
                
                val result = JSONObject().apply {
                    put("text", text)
                    put("embedding", JSONArray(embedding.toList()))
                    put("processingTimeMs", processingTime)
                }
                
                promise.resolve(result.toString())
            } catch (e: Exception) {
                promise.reject("EMBEDDING_ERROR", "Failed to generate embedding", e)
            }
        }
    }

    @ReactMethod
    fun generateEmbeddingBatch(texts: ReadableArray, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INITIALIZED", "Semantic search not initialized")
            return
        }

        scope.launch {
            try {
                val startTime = System.currentTimeMillis()
                val embeddings = JSONArray()
                
                for (i in 0 until texts.size()) {
                    val text = texts.getString(i) ?: continue
                    val textStartTime = System.currentTimeMillis()
                    val embedding = generateEmbeddingInternal(text)
                    val textProcessingTime = (System.currentTimeMillis() - textStartTime).toDouble()
                    
                    embeddings.put(JSONObject().apply {
                        put("text", text)
                        put("embedding", JSONArray(embedding.toList()))
                        put("processingTimeMs", textProcessingTime)
                    })
                }
                
                val totalProcessingTime = (System.currentTimeMillis() - startTime).toDouble()
                updateStats(totalProcessingTime, texts.size())
                
                val result = JSONObject().apply {
                    put("embeddings", embeddings)
                    put("totalProcessingTimeMs", totalProcessingTime)
                }
                
                promise.resolve(result.toString())
            } catch (e: Exception) {
                promise.reject("BATCH_ERROR", "Failed to generate batch embeddings", e)
            }
        }
    }

    @ReactMethod
    fun getModelStatus(promise: Promise) {
        try {
            val status = when {
                isModelReady -> "ready"
                isModelDownloading -> "downloading"
                else -> "not_downloaded"
            }
            
            val result = JSONObject().apply {
                put("status", status)
                if (isModelDownloading) {
                    put("progress", 50) // Placeholder progress
                }
            }
            
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", "Failed to get model status", e)
        }
    }

    @ReactMethod
    fun preloadModel(promise: Promise) {
        scope.launch {
            try {
                checkAndDownloadModel()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("PRELOAD_ERROR", "Failed to preload model", e)
            }
        }
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        unloadModelInternal()
        promise.resolve(true)
    }

    // MARK: - Private Methods

    private fun generateEmbeddingInternal(text: String): DoubleArray {
        // Track last access time for memory pressure handling
        lastAccessTimeMs = System.currentTimeMillis()
        
        // Check if TFLite model is available
        if (isModelReady) {
            return generateWithTFLite(text)
        }
        
        // Error: Model not available - do not use fallback as it provides no semantic value
        throw IllegalStateException("Embedding model not ready. Call Core.downloadModel('${config.modelId}') first.")
    }

    private fun generateWithTFLite(text: String): DoubleArray {
        val interp: Interpreter
        val tok: WordPieceTokenizer
        
        synchronized(modelLock) {
            interp = interpreter ?: throw IllegalStateException("TFLite interpreter not initialized")
            tok = tokenizer ?: throw IllegalStateException("Tokenizer not initialized")
        }
        
        try {
            // Tokenize text using proper WordPiece tokenizer
            val maxLength = 256
            val tokenized = tok.tokenize(text, maxLength)
            
            // Prepare input tensors as proper 2D int arrays [batch_size, seq_length]
            val inputIds = Array(1) { IntArray(maxLength) { i -> tokenized.inputIds[i] } }
            val attentionMask = Array(1) { IntArray(maxLength) { i -> tokenized.attentionMask[i] } }
            
            // Get output shape from interpreter
            val outputTensor = interp.getOutputTensor(0)
            val outputShape = outputTensor.shape()
            
            // Output shape could be [1, seq_len, hidden_size] or [1, hidden_size]
            val output: Any = if (outputShape.size == 3) {
                Array(1) { Array(outputShape[1]) { FloatArray(outputShape[2]) } }
            } else {
                Array(1) { FloatArray(outputShape[1]) }
            }
            
            // Run inference
            interp.runForMultipleInputsOutputs(arrayOf(inputIds, attentionMask), mapOf(0 to output))
            
            // Extract embeddings based on output shape
            val embedding = DoubleArray(config.embeddingDimensions)
            
            if (outputShape.size == 3) {
                // [1, seq_len, hidden_size] - need mean pooling
                @Suppress("UNCHECKED_CAST")
                val output3d = output as Array<Array<FloatArray>>
                val seqLen = tokenized.tokenCount.coerceAtMost(outputShape[1])
                
                for (dim in 0 until config.embeddingDimensions.coerceAtMost(outputShape[2])) {
                    var sum = 0.0
                    var count = 0
                    for (seq in 0 until seqLen) {
                        if (tokenized.attentionMask[seq] == 1) {
                            sum += output3d[0][seq][dim].toDouble()
                            count++
                        }
                    }
                    embedding[dim] = if (count > 0) sum / count else 0.0
                }
            } else {
                // [1, hidden_size] - already pooled
                @Suppress("UNCHECKED_CAST")
                val output2d = output as Array<FloatArray>
                for (dim in 0 until config.embeddingDimensions.coerceAtMost(outputShape[1])) {
                    embedding[dim] = output2d[0][dim].toDouble()
                }
            }
            
            // L2 normalize
            val magnitude = sqrt(embedding.sumOf { it * it })
            if (magnitude > 0) {
                for (i in embedding.indices) {
                    embedding[i] /= magnitude
                }
            }
            
            return embedding
        } catch (e: Exception) {
            // Re-throw error instead of using fallback - fallback provides no semantic value
            throw IllegalStateException("Failed to generate embedding: ${e.message}", e)
        }
    }

    // DEPRECATED: Fallback embedding removed - provides no semantic value
    // Keeping method for reference but it should not be called
    @Deprecated("Fallback embeddings provide no semantic value. Ensure model is downloaded first.")
    private fun generateFallbackEmbedding(text: String): DoubleArray {
        throw IllegalStateException("Fallback embeddings are disabled. Download the embedding model first using Core.downloadModel('${config.modelId}')")
    }

    // Original fallback implementation preserved for reference only
    @Suppress("unused")
    private fun generateFallbackEmbeddingLegacy(text: String): DoubleArray {
        // Simple word-based embedding using hash functions
        // WARNING: This provides NO semantic value - just hash-based similarity
        val embedding = DoubleArray(config.embeddingDimensions) { 0.0 }
        
        val words = text.lowercase().split(Regex("\\s+"))
        val wordSet = words.toSet()
        
        for ((index, word) in words.withIndex()) {
            if (word.isBlank()) continue
            
            // Use multiple hash functions for better distribution
            val hash1 = word.hashCode()
            val hash2 = word.reversed().hashCode()
            
            val pos1 = Math.abs(hash1) % config.embeddingDimensions
            val pos2 = Math.abs(hash2) % config.embeddingDimensions
            
            // TF-IDF-like weighting
            val tf = words.count { it == word }.toDouble() / words.size
            embedding[pos1] += tf
            embedding[pos2] += tf * 0.5
            
            // Positional encoding
            val positionFactor = index.toDouble() / words.size.coerceAtLeast(1)
            embedding[(pos1 + 1) % config.embeddingDimensions] += positionFactor * 0.1
        }
        
        // Character n-gram features for subword information
        for (word in wordSet) {
            if (word.length >= 3) {
                for (i in 0..word.length - 3) {
                    val ngram = word.substring(i, i + 3)
                    val ngramPos = Math.abs(ngram.hashCode()) % config.embeddingDimensions
                    embedding[ngramPos] += 0.1
                }
            }
        }
        
        // L2 normalize
        val magnitude = sqrt(embedding.sumOf { it * it })
        if (magnitude > 0) {
            for (i in embedding.indices) {
                embedding[i] /= magnitude
            }
        }
        
        return embedding
    }

    private fun checkAndDownloadModel() {
        if (isModelReady || isModelDownloading) return
        
        // Check if model file and vocab exist in cache
        val cacheDir = File(reactApplicationContext.filesDir, "local_intelligence_models")
        val modelFile = File(cacheDir, "${config.modelId}.tflite")
        val vocabFile = File(cacheDir, "${config.modelId}.vocab.txt")
        
        if (modelFile.exists() && vocabFile.exists()) {
            loadModel(modelFile, vocabFile)
            return
        }
        
        // Model not downloaded yet - will use fallback until downloaded via core module
        isModelDownloading = false
        isModelReady = false
    }
    
    private fun loadModel(modelFile: File, vocabFile: File) {
        synchronized(modelLock) {
            try {
                // Load tokenizer first
                tokenizer = WordPieceTokenizer(vocabFile)
                
                // Try GPU delegate first
                try {
                    gpuDelegate = GpuDelegate()
                    val options = Interpreter.Options().addDelegate(gpuDelegate)
                    interpreter = Interpreter(loadModelFile(modelFile), options)
                } catch (e: Exception) {
                    // Fallback to CPU
                    gpuDelegate?.close()
                    gpuDelegate = null
                    interpreter = Interpreter(loadModelFile(modelFile))
                }
                
                isModelReady = true
                isModelDownloading = false
            } catch (e: Exception) {
                tokenizer = null
                interpreter = null
                isModelReady = false
                isModelDownloading = false
            }
        }
    }
    
    private fun loadModelFile(file: File): MappedByteBuffer {
        FileInputStream(file).use { fileInputStream ->
            val fileChannel = fileInputStream.channel
            return fileChannel.map(FileChannel.MapMode.READ_ONLY, 0, fileChannel.size())
        }
    }
    
    fun onModelDownloaded(modelId: String, path: String) {
        if (modelId == config.modelId) {
            val modelFile = File(path)
            val vocabFile = File(modelFile.parent, "${config.modelId}.vocab.txt")
            if (modelFile.exists() && vocabFile.exists()) {
                loadModel(modelFile, vocabFile)
            }
        }
    }

    private fun updateStats(processingTime: Double, count: Int = 1) {
        stats.totalGenerated += count
        stats.totalProcessingTimeMs += processingTime
        stats.processCount++
    }
}
