package com.doccorrection

fun interface BatchProgressListener {
    fun onProgress(current: Int, total: Int, result: BatchResult)
}
