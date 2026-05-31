package com.doccorrection

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class BatchResult(
    val inputPath: String = "",
    val outputPath: String = "",
    val success: Boolean = false,
    val errorMessage: String? = null,
    val corners: Corners = Corners()
) : Parcelable {

    override fun toString(): String {
        return "BatchResult(success=$success, " +
               "input='$inputPath', " +
               "output='$outputPath', " +
               "corners=$corners, " +
               "error=$errorMessage)"
    }
}
