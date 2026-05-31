package com.doccorrection

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class Point2f(
    val x: Float = 0f,
    val y: Float = 0f
) : Parcelable {
    fun isValid(): Boolean = x >= 0 && y >= 0

    override fun toString(): String = "($x, $y)"
}
