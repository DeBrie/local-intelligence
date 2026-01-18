package com.localintelligence.semanticsearch

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
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
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LocalIntelligenceSemanticSearch"
        const val DEFAULT_EMBEDDING_DIMENSIONS = 384
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var isInitialized = false
    private var isModelReady = false
    private var isModelDownloading = false
    private var config = SemanticSearchConfig()
    private var stats = EmbeddingStats()
    private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null

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
        isModelReady = false
        promise.resolve(true)
    }

    // MARK: - Private Methods

    private fun generateEmbeddingInternal(text: String): DoubleArray {
        // Check if TFLite model is available
        if (isModelReady) {
            return generateWithTFLite(text)
        }
        
        // Fallback to hash-based embedding when model not available
        return generateFallbackEmbedding(text)
    }

    private fun generateWithTFLite(text: String): DoubleArray {
        val interp = interpreter ?: return generateFallbackEmbedding(text)
        
        try {
            // Tokenize text - simple whitespace tokenization with padding
            // MiniLM expects input_ids and attention_mask
            val maxLength = 256
            val tokens = tokenizeText(text, maxLength)
            
            // Prepare input tensors
            val inputIds = Array(1) { IntArray(maxLength) }
            val attentionMask = Array(1) { IntArray(maxLength) }
            
            for (i in tokens.indices) {
                inputIds[0][i] = tokens[i]
                attentionMask[0][i] = 1
            }
            
            // Prepare output tensor (batch_size=1, sequence_length, hidden_size=384)
            val outputShape = interp.getOutputTensor(0).shape()
            val outputBuffer = Array(1) { Array(outputShape[1]) { FloatArray(outputShape[2]) } }
            
            // Run inference
            val inputs = mapOf(
                "input_ids" to inputIds,
                "attention_mask" to attentionMask
            )
            val outputs = mapOf(0 to outputBuffer)
            interp.runForMultipleInputsOutputs(arrayOf(inputIds, attentionMask), outputs)
            
            // Mean pooling over sequence dimension
            val embedding = DoubleArray(config.embeddingDimensions)
            val seqLen = tokens.size.coerceAtMost(outputShape[1])
            
            for (dim in 0 until config.embeddingDimensions) {
                var sum = 0.0
                for (seq in 0 until seqLen) {
                    sum += outputBuffer[0][seq][dim].toDouble()
                }
                embedding[dim] = sum / seqLen
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
            // Fallback on error
            return generateFallbackEmbedding(text)
        }
    }
    
    private fun tokenizeText(text: String, maxLength: Int): List<Int> {
        // Simple word-piece-like tokenization
        // In production, would use proper tokenizer from model metadata
        val words = text.lowercase().split(Regex("\\s+"))
        val tokens = mutableListOf<Int>()
        
        // [CLS] token
        tokens.add(101)
        
        for (word in words) {
            if (tokens.size >= maxLength - 1) break
            // Simple hash-based token ID (placeholder for real vocab lookup)
            val tokenId = (Math.abs(word.hashCode()) % 30000) + 1000
            tokens.add(tokenId)
        }
        
        // [SEP] token
        tokens.add(102)
        
        // Pad to maxLength
        while (tokens.size < maxLength) {
            tokens.add(0)
        }
        
        return tokens.take(maxLength)
    }

    private fun generateFallbackEmbedding(text: String): DoubleArray {
        // Simple word-based embedding using hash functions
        // This provides basic semantic similarity based on word overlap
        // Production would use the actual MiniLM TFLite model
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
        
        // Check if model file exists in cache (check both locations)
        val cacheDir = File(reactApplicationContext.filesDir, "local_intelligence_models")
        val modelFile = File(cacheDir, "${config.modelId}.tflite")
        
        if (modelFile.exists()) {
            loadModel(modelFile)
            return
        }
        
        // Model not downloaded yet - will use fallback until downloaded via core module
        isModelDownloading = false
        isModelReady = false
    }
    
    private fun loadModel(modelFile: File) {
        try {
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
            isModelReady = false
            isModelDownloading = false
        }
    }
    
    private fun loadModelFile(file: File): MappedByteBuffer {
        val fileInputStream = FileInputStream(file)
        val fileChannel = fileInputStream.channel
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, 0, fileChannel.size())
    }
    
    fun onModelDownloaded(modelId: String, path: String) {
        if (modelId == config.modelId) {
            val modelFile = File(path)
            if (modelFile.exists()) {
                loadModel(modelFile)
            }
        }
    }

    private fun updateStats(processingTime: Double, count: Int = 1) {
        stats.totalGenerated += count
        stats.totalProcessingTimeMs += processingTime
        stats.processCount++
    }
}
