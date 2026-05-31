package com.doccorrection

import android.content.Context
import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.io.File

class DocumentCorrectionSDK private constructor() {

    private var isInitialized = false

    fun init(
        context: Context,
        modelDir: String = "",
        options: CorrectionOptions = CorrectionOptions()
    ): Boolean {
        synchronized(this) {
            if (isInitialized) {
                return true
            }

            val actualModelDir = if (modelDir.isEmpty()) {
                getDefaultModelDir(context)
            } else {
                modelDir
            }

            isInitialized = nativeInit(
                actualModelDir,
                options.targetWidth,
                options.targetHeight,
                options.keepAspectRatio,
                options.padding,
                options.confidenceThreshold,
                options.useGpu,
                options.shadowRemoval.type.ordinal,
                options.shadowRemoval.sigma,
                options.shadowRemoval.gain,
                options.shadowRemoval.offset,
                options.shadowRemoval.preserveColor
            )

            if (isInitialized) {
                nativeSetThreadCount(options.threadCount)
            }

            return isInitialized
        }
    }

    fun removeShadow(bitmap: Bitmap, options: ShadowRemovalOptions): Bitmap? {
        return nativeRemoveShadow(
            bitmap,
            options.type.ordinal,
            options.sigma,
            options.gain,
            options.offset,
            options.preserveColor
        )
    }

    fun isInitialized(): Boolean {
        return isInitialized && nativeIsInitialized()
    }

    fun correct(bitmap: Bitmap): CorrectionResult {
        checkInitialized()
        return nativeCorrectBitmap(bitmap) ?: CorrectionResult(
            success = false,
            errorMessage = "Correction failed"
        )
    }

    suspend fun correctAsync(bitmap: Bitmap): CorrectionResult {
        return withContext(Dispatchers.IO) {
            correct(bitmap)
        }
    }

    fun correctBatch(
        bitmaps: List<Bitmap>,
        listener: BatchProgressListener? = null
    ): List<BatchResult> {
        checkInitialized()

        val bitmapArray = bitmaps.toTypedArray()
        val resultArray = nativeCorrectBitmapArray(
            bitmapArray,
            object : BatchProgressListener {
                override fun onProgress(current: Int, total: Int, result: BatchResult) {
                    listener?.onProgress(current, total, result)
                }
            }
        )

        return resultArray?.toList() ?: emptyList()
    }

    fun correctBatch(
        inputPaths: List<String>,
        outputDir: String,
        listener: BatchProgressListener? = null
    ): List<BatchResult> {
        checkInitialized()

        val outputDirFile = File(outputDir)
        if (!outputDirFile.exists()) {
            outputDirFile.mkdirs()
        }

        val pathArray = inputPaths.toTypedArray()
        val resultArray = nativeCorrectPaths(
            pathArray,
            outputDir,
            object : BatchProgressListener {
                override fun onProgress(current: Int, total: Int, result: BatchResult) {
                    listener?.onProgress(current, total, result)
                }
            }
        )

        return resultArray?.toList() ?: emptyList()
    }

    fun correctBatchFlow(
        inputPaths: List<String>,
        outputDir: String
    ): Flow<BatchProgress> = flow {
        checkInitialized()

        val outputDirFile = File(outputDir)
        if (!outputDirFile.exists()) {
            outputDirFile.mkdirs()
        }

        val pathArray = inputPaths.toTypedArray()
        val results = mutableListOf<BatchResult>()

        val resultArray = nativeCorrectPaths(
            pathArray,
            outputDir,
            object : BatchProgressListener {
                override fun onProgress(current: Int, total: Int, result: BatchResult) {
                    results.add(result)
                }
            }
        )

        val finalResults = resultArray?.toList() ?: results
        emit(BatchProgress.Completed(finalResults))
    }.flowOn(Dispatchers.IO)

    fun cancel() {
        nativeCancel()
    }

    fun isProcessing(): Boolean {
        return nativeIsProcessing()
    }

    var threadCount: Int
        get() = nativeGetThreadCount()
        set(value) = nativeSetThreadCount(value)

    fun release() {
        synchronized(this) {
            if (isInitialized) {
                nativeRelease()
                isInitialized = false
            }
        }
    }

    private fun checkInitialized() {
        if (!isInitialized()) {
            throw IllegalStateException("SDK not initialized. Call init() first.")
        }
    }

    private fun getDefaultModelDir(context: Context): String {
        val modelDir = File(context.filesDir, "models")
        if (!modelDir.exists()) {
            modelDir.mkdirs()
        }
        return modelDir.absolutePath
    }

    sealed class BatchProgress {
        data class Progress(val current: Int, val total: Int, val result: BatchResult) : BatchProgress()
        data class Completed(val results: List<BatchResult>) : BatchProgress()
    }

    companion object {
        @Volatile
        private var INSTANCE: DocumentCorrectionSDK? = null

        fun getInstance(): DocumentCorrectionSDK {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DocumentCorrectionSDK().also { INSTANCE = it }
            }
        }

        init {
            System.loadLibrary("document_correction")
        }
    }

    private external fun nativeInit(
        modelDir: String,
        targetWidth: Int,
        targetHeight: Int,
        keepAspectRatio: Boolean,
        padding: Int,
        confidenceThreshold: Float,
        useGpu: Boolean,
        shadowRemovalType: Int,
        shadowSigma: Float,
        shadowGain: Float,
        shadowOffset: Float,
        shadowPreserveColor: Boolean
    ): Boolean

    private external fun nativeIsInitialized(): Boolean

    private external fun nativeCorrectBitmap(bitmap: Bitmap): CorrectionResult?

    private external fun nativeCorrectBitmapArray(
        bitmaps: Array<Bitmap>,
        listener: BatchProgressListener
    ): Array<BatchResult>?

    private external fun nativeCorrectPaths(
        inputPaths: Array<String>,
        outputDir: String,
        listener: BatchProgressListener
    ): Array<BatchResult>?

    private external fun nativeRemoveShadow(
        bitmap: Bitmap,
        shadowRemovalType: Int,
        sigma: Float,
        gain: Float,
        offset: Float,
        preserveColor: Boolean
    ): Bitmap?

    private external fun nativeCancel()

    private external fun nativeIsProcessing(): Boolean

    private external fun nativeSetThreadCount(count: Int)

    private external fun nativeGetThreadCount(): Int

    private external fun nativeRelease()
}
