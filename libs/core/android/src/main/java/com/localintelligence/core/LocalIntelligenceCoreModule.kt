package com.localintelligence.core

import android.app.ActivityManager
import android.content.Context
import android.content.res.AssetManager
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

@ReactModule(name = LocalIntelligenceCoreModule.NAME)
class LocalIntelligenceCoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LocalIntelligenceCore"
    }

    private var config: CoreConfig? = null
    private val modelCache = java.util.concurrent.ConcurrentHashMap<String, ModelStatus>()
    private val activeDownloads = mutableMapOf<String, Job>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var listenerCount = 0

    override fun getName(): String = NAME

    @ReactMethod
    fun initialize(configJson: String, promise: Promise) {
        try {
            val json = JSONObject(configJson)
            config = CoreConfig(
                modelCacheDir = json.optString("modelCacheDir", null),
                cdnBaseUrl = json.optString("cdnBaseUrl", "https://cdn.localintelligence.dev/models"),
                maxConcurrentDownloads = json.optInt("maxConcurrentDownloads", 2),
                enableLogging = json.optBoolean("enableLogging", false)
            )
            
            setupCacheDirectory()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", "Failed to initialize: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getDeviceCapabilities(promise: Promise) {
        try {
            val capabilities = JSONObject().apply {
                put("platform", "android")
                put("osVersion", Build.VERSION.RELEASE)
                put("hasNPU", checkNNAPIAvailability())
                put("hasGPU", checkGPUAvailability())
                put("ramGB", getDeviceRAM())
                put("supportsFoundationModels", false)
                put("supportedDelegates", getSupportedDelegates())
            }
            promise.resolve(capabilities.toString())
        } catch (e: Exception) {
            promise.reject("ENCODE_ERROR", "Failed to encode capabilities", e)
        }
    }

    @ReactMethod
    fun getModelStatus(modelId: String, promise: Promise) {
        try {
            val status = when {
                modelCache.containsKey(modelId) -> modelCache[modelId]!!
                activeDownloads.containsKey(modelId) -> ModelStatus("downloading", 0.0, null, null, null)
                else -> {
                    val path = getModelPath(modelId)
                    if (path != null && File(path).exists()) {
                        val size = File(path).length()
                        ModelStatus("ready", null, size, path, null).also {
                            modelCache[modelId] = it
                        }
                    } else {
                        ModelStatus("not_downloaded", null, null, null, null)
                    }
                }
            }
            
            promise.resolve(status.toJson().toString())
        } catch (e: Exception) {
            promise.reject("ENCODE_ERROR", "Failed to encode status", e)
        }
    }

    @ReactMethod
    fun downloadModel(modelId: String, promise: Promise) {
        val cfg = config
        if (cfg == null) {
            promise.reject("NOT_INITIALIZED", "Core not initialized", null)
            return
        }

        val job = scope.launch {
            try {
                // First fetch metadata to determine model format
                val metadataUrl = URL("${cfg.cdnBaseUrl}/$modelId/latest/metadata.json")
                val metadataConnection = metadataUrl.openConnection() as HttpURLConnection
                metadataConnection.requestMethod = "GET"
                metadataConnection.connect()
                
                val metadataJson = metadataConnection.inputStream.bufferedReader().use { it.readText() }
                val metadata = JSONObject(metadataJson)
                metadataConnection.disconnect()
                
                // Determine file name based on format in metadata
                val format = metadata.optString("format", "tflite")
                val fileName = when (format) {
                    "onnx" -> "model.onnx"
                    "tflite" -> "android.tflite"
                    else -> "android.tflite"
                }
                val fileExtension = when (format) {
                    "onnx" -> ".onnx"
                    else -> ".tflite"
                }
                
                val urlString = "${cfg.cdnBaseUrl}/$modelId/latest/$fileName"
                val url = URL(urlString)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connect()

                val totalBytes = connection.contentLength.toLong()
                val expectedSize = metadata.optLong("size_bytes", 0)
                val cacheDir = getCacheDirectory() ?: throw Exception("Failed to get cache directory")
                val destPath = File(cacheDir, "$modelId$fileExtension").absolutePath
                val destFile = File(destPath)
                destFile.parentFile?.mkdirs()

                var bytesDownloaded = 0L
                val buffer = ByteArray(8192)

                connection.inputStream.use { input ->
                    FileOutputStream(destFile).use { output ->
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            bytesDownloaded += bytesRead
                            
                            if (listenerCount > 0) {
                                val progress = if (totalBytes > 0) bytesDownloaded.toDouble() / totalBytes else 0.0
                                sendDownloadProgress(modelId, bytesDownloaded, totalBytes, progress)
                            }
                        }
                    }
                }
                
                // Validate downloaded file size
                val actualSize = destFile.length()
                if (expectedSize > 0 && actualSize != expectedSize) {
                    destFile.delete()
                    throw Exception("Model file size mismatch: expected $expectedSize bytes, got $actualSize bytes")
                }
                
                // Validate minimum file size (models should be at least 1KB)
                if (actualSize < 1024) {
                    destFile.delete()
                    throw Exception("Downloaded model file is too small: $actualSize bytes")
                }
                
                // Verify SHA256 checksum if provided
                val expectedChecksum = metadata.optString("sha256", null)
                if (expectedChecksum != null && expectedChecksum.isNotEmpty()) {
                    val actualChecksum = calculateSHA256(destFile)
                    if (!actualChecksum.equals(expectedChecksum, ignoreCase = true)) {
                        destFile.delete()
                        throw Exception("Checksum verification failed: expected $expectedChecksum, got $actualChecksum")
                    }
                }
                
                // Also save metadata locally
                val metadataPath = File(cacheDir, "$modelId.metadata.json")
                metadataPath.writeText(metadataJson)
                
                // Download vocab.txt if available (for tokenizer)
                try {
                    val vocabUrl = URL("${cfg.cdnBaseUrl}/$modelId/latest/vocab.txt")
                    val vocabConnection = vocabUrl.openConnection() as HttpURLConnection
                    vocabConnection.requestMethod = "GET"
                    vocabConnection.connect()
                    
                    if (vocabConnection.responseCode == 200) {
                        val vocabPath = File(cacheDir, "$modelId.vocab.txt")
                        vocabConnection.inputStream.use { input ->
                            FileOutputStream(vocabPath).use { output ->
                                input.copyTo(output)
                            }
                        }
                    }
                    vocabConnection.disconnect()
                } catch (e: Exception) {
                    // Vocab download is optional, continue without it
                }

                val status = ModelStatus("ready", null, destFile.length(), destPath, null)
                modelCache[modelId] = status
                activeDownloads.remove(modelId)
                
                // Emit model downloaded event for other modules to listen
                if (listenerCount > 0) {
                    val params = Arguments.createMap().apply {
                        putString("modelId", modelId)
                        putString("path", destPath)
                        putString("format", format)
                    }
                    withContext(Dispatchers.Main) {
                        reactApplicationContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("LocalIntelligenceModelDownloaded", params)
                    }
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(JSONObject().put("path", destPath).put("format", format).toString())
                }
            } catch (e: Exception) {
                activeDownloads.remove(modelId)
                withContext(Dispatchers.Main) {
                    promise.reject("DOWNLOAD_ERROR", e.message ?: "Unknown download error", e)
                }
            }
        }

        activeDownloads[modelId] = job
    }

    @ReactMethod
    fun cancelDownload(modelId: String, promise: Promise) {
        val job = activeDownloads[modelId]
        if (job != null) {
            job.cancel()
            activeDownloads.remove(modelId)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun deleteModel(modelId: String, promise: Promise) {
        try {
            val path = getModelPath(modelId)
            if (path != null && File(path).exists()) {
                File(path).delete()
                modelCache.remove(modelId)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", "Failed to delete model", e)
        }
    }

    @ReactMethod
    fun clearModelCache(promise: Promise) {
        try {
            val cacheDir = getCacheDirectory()
            if (cacheDir != null) {
                File(cacheDir).deleteRecursively()
                File(cacheDir).mkdirs()
            }
            modelCache.clear()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", "Failed to clear cache", e)
        }
    }

    @ReactMethod
    fun getCacheSize(promise: Promise) {
        try {
            val cacheDir = getCacheDirectory()
            val size = if (cacheDir != null) {
                File(cacheDir).walkTopDown().filter { it.isFile }.map { it.length() }.sum()
            } else {
                0L
            }
            promise.resolve(size.toDouble())
        } catch (e: Exception) {
            promise.resolve(0.0)
        }
    }

    @ReactMethod
    fun getLocalModelMetadata(modelId: String, promise: Promise) {
        try {
            val cacheDir = getCacheDirectory()
            if (cacheDir == null) {
                promise.reject("METADATA_ERROR", "Failed to get cache directory")
                return
            }
            
            val metadataFile = File(cacheDir, "$modelId.metadata.json")
            if (!metadataFile.exists()) {
                promise.reject("METADATA_NOT_FOUND", "No local metadata found for model $modelId")
                return
            }
            
            val jsonString = metadataFile.readText()
            promise.resolve(jsonString)
        } catch (e: Exception) {
            promise.reject("METADATA_ERROR", "Failed to read metadata: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount = maxOf(0, listenerCount - count)
    }

    private fun sendDownloadProgress(modelId: String, bytesDownloaded: Long, totalBytes: Long, progress: Double) {
        val params = Arguments.createMap().apply {
            putString("modelId", modelId)
            putDouble("bytesDownloaded", bytesDownloaded.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putDouble("progress", progress)
        }
        
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("LocalIntelligenceDownloadProgress", params)
    }

    private fun setupCacheDirectory() {
        val cacheDir = getCacheDirectory()
        if (cacheDir != null) {
            File(cacheDir).mkdirs()
        }
    }

    private fun getCacheDirectory(): String? {
        config?.modelCacheDir?.let { return it }
        return reactApplicationContext.filesDir?.let {
            File(it, "local_intelligence_models").absolutePath
        }
    }

    private fun getModelPath(modelId: String): String? {
        val cacheDir = getCacheDirectory() ?: return null
        // Check for both formats in cache
        val onnxFile = File(cacheDir, "$modelId.onnx")
        if (onnxFile.exists()) return onnxFile.absolutePath
        val tfliteFile = File(cacheDir, "$modelId.tflite")
        if (tfliteFile.exists()) return tfliteFile.absolutePath
        
        // Check for bundled model in assets and extract if available
        val bundledPath = extractBundledModelIfExists(modelId)
        if (bundledPath != null) return bundledPath
        
        // Default to tflite for new downloads
        return tfliteFile.absolutePath
    }
    
    private fun extractBundledModelIfExists(modelId: String): String? {
        val cacheDir = getCacheDirectory() ?: return null
        val assets = reactApplicationContext.assets
        
        // Try different extensions for bundled models
        val extensions = listOf("onnx", "tflite")
        for (ext in extensions) {
            val assetPath = "models/$modelId.$ext"
            try {
                assets.open(assetPath).use { input ->
                    val destFile = File(cacheDir, "$modelId.$ext")
                    FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                    
                    // Also try to extract vocab if bundled
                    try {
                        assets.open("models/$modelId.vocab.txt").use { vocabInput ->
                            val vocabFile = File(cacheDir, "$modelId.vocab.txt")
                            FileOutputStream(vocabFile).use { vocabOutput ->
                                vocabInput.copyTo(vocabOutput)
                            }
                        }
                    } catch (e: Exception) {
                        // Vocab not bundled, that's ok
                    }
                    
                    return destFile.absolutePath
                }
            } catch (e: Exception) {
                // Asset doesn't exist for this extension, try next
            }
        }
        return null
    }
    
    @ReactMethod
    fun hasBundledModel(modelId: String, promise: Promise) {
        val assets = reactApplicationContext.assets
        val extensions = listOf("onnx", "tflite")
        
        for (ext in extensions) {
            try {
                assets.open("models/$modelId.$ext").close()
                promise.resolve(true)
                return
            } catch (e: Exception) {
                // Not found with this extension
            }
        }
        promise.resolve(false)
    }

    private fun checkNNAPIAvailability(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1
    }

    private fun checkGPUAvailability(): Boolean {
        // Check for OpenGL ES 3.1+ which is required for GPU delegate
        val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val configInfo = activityManager?.deviceConfigurationInfo
        
        // OpenGL ES 3.1 is version 0x00030001 (196609)
        // GPU delegate requires OpenGL ES 3.1 or higher
        val glVersion = configInfo?.reqGlEsVersion ?: 0
        return glVersion >= 0x00030001
    }

    private fun getDeviceRAM(): Double {
        val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        return memInfo.totalMem.toDouble() / (1024 * 1024 * 1024)
    }

    private fun getSupportedDelegates(): org.json.JSONArray {
        val delegates = org.json.JSONArray()
        delegates.put("cpu")
        delegates.put("gpu")
        if (checkNNAPIAvailability()) {
            delegates.put("nnapi")
        }
        return delegates
    }
    
    private fun calculateSHA256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { fis ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (fis.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }
}

data class CoreConfig(
    val modelCacheDir: String?,
    val cdnBaseUrl: String,
    val maxConcurrentDownloads: Int,
    val enableLogging: Boolean
)

data class ModelStatus(
    val state: String,
    val progress: Double?,
    val sizeBytes: Long?,
    val path: String?,
    val message: String?
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("state", state)
            progress?.let { put("progress", it) }
            sizeBytes?.let { put("sizeBytes", it) }
            path?.let { put("path", it) }
            message?.let { put("message", it) }
        }
    }
}
