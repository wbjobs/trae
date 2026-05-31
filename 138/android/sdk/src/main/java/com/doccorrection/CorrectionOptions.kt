package com.doccorrection

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

enum class ShadowRemovalType {
    NONE,
    FAST_SSR,
    SIMPLE_MSR,
    ADAPTIVE
}

@Parcelize
data class ShadowRemovalOptions(
    var type: ShadowRemovalType = ShadowRemovalType.NONE,
    var sigma: Float = 80.0f,
    var gain: Float = 1.0f,
    var offset: Float = 0.0f,
    var preserveColor: Boolean = true,
    var threadCount: Int = 2
) : Parcelable {

    class Builder {
        private val options = ShadowRemovalOptions()

        fun type(type: ShadowRemovalType) = apply { options.type = type }
        fun sigma(sigma: Float) = apply { options.sigma = sigma }
        fun gain(gain: Float) = apply { options.gain = gain }
        fun offset(offset: Float) = apply { options.offset = offset }
        fun preserveColor(preserve: Boolean) = apply { options.preserveColor = preserve }
        fun threadCount(count: Int) = apply { options.threadCount = count }

        fun build(): ShadowRemovalOptions = options
    }

    override fun toString(): String {
        return "ShadowRemovalOptions(type=$type, sigma=$sigma, gain=$gain, " +
               "offset=$offset, preserveColor=$preserveColor, threadCount=$threadCount)"
    }
}

@Parcelize
data class CorrectionOptions(
    var targetWidth: Int = 1080,
    var targetHeight: Int = 1920,
    var keepAspectRatio: Boolean = true,
    var padding: Int = 20,
    var confidenceThreshold: Float = 0.3f,
    var useGpu: Boolean = false,
    var threadCount: Int = 2,
    var shadowRemoval: ShadowRemovalOptions = ShadowRemovalOptions()
) : Parcelable {

    class Builder {
        private val options = CorrectionOptions()

        fun targetWidth(width: Int) = apply { options.targetWidth = width }
        fun targetHeight(height: Int) = apply { options.targetHeight = height }
        fun keepAspectRatio(keep: Boolean) = apply { options.keepAspectRatio = keep }
        fun padding(padding: Int) = apply { options.padding = padding }
        fun confidenceThreshold(threshold: Float) = apply { options.confidenceThreshold = threshold }
        fun useGpu(use: Boolean) = apply { options.useGpu = use }
        fun threadCount(count: Int) = apply { options.threadCount = count }
        fun shadowRemoval(shadowRemoval: ShadowRemovalOptions) = apply {
            options.shadowRemoval = shadowRemoval
        }

        fun build(): CorrectionOptions = options
    }

    override fun toString(): String {
        return "CorrectionOptions(targetWidth=$targetWidth, targetHeight=$targetHeight, " +
               "keepAspectRatio=$keepAspectRatio, padding=$padding, " +
               "confidenceThreshold=$confidenceThreshold, useGpu=$useGpu, " +
               "threadCount=$threadCount, shadowRemoval=$shadowRemoval)"
    }
}
