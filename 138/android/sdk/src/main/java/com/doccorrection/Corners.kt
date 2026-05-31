package com.doccorrection

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class Corners(
    val topLeft: Point2f = Point2f(),
    val topRight: Point2f = Point2f(),
    val bottomRight: Point2f = Point2f(),
    val bottomLeft: Point2f = Point2f()
) : Parcelable {

    fun toList(): List<Point2f> = listOf(topLeft, topRight, bottomRight, bottomLeft)

    fun toFloatArray(): FloatArray = floatArrayOf(
        topLeft.x, topLeft.y,
        topRight.x, topRight.y,
        bottomRight.x, bottomRight.y,
        bottomLeft.x, bottomLeft.y
    )

    fun isValid(): Boolean =
        topLeft.isValid() && topRight.isValid() &&
        bottomRight.isValid() && bottomLeft.isValid()

    override fun toString(): String {
        return "Corners(topLeft=$topLeft, topRight=$topRight, " +
               "bottomRight=$bottomRight, bottomLeft=$bottomLeft)"
    }

    companion object {
        fun fromFloatArray(array: FloatArray): Corners {
            if (array.size < 8) return Corners()
            return Corners(
                topLeft = Point2f(array[0], array[1]),
                topRight = Point2f(array[2], array[3]),
                bottomRight = Point2f(array[4], array[5]),
                bottomLeft = Point2f(array[6], array[7])
            )
        }
    }
}
