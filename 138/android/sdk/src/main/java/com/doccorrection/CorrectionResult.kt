package com.doccorrection

import android.graphics.Bitmap
import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class CorrectionResult(
    val correctedBitmap: Bitmap? = null,
    val corners: Corners = Corners(),
    val success: Boolean = false,
    val errorMessage: String? = null
) : Parcelable {

    override fun toString(): String {
        return "CorrectionResult(success=$success, " +
               "corners=$corners, " +
               "bitmapSize=${correctedBitmap?.width}x${correctedBitmap?.height}, " +
               "error=$errorMessage)"
    }
}
