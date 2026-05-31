package com.doccorrection.demo

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.doccorrection.BatchProgressListener
import com.doccorrection.BatchResult
import com.doccorrection.DocumentCorrectionSDK
import com.doccorrection.demo.databinding.ActivityBatchResultBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class BatchResultActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_IMAGE_PATHS = "extra_image_paths"
    }

    private lateinit var binding: ActivityBatchResultBinding
    private lateinit var adapter: BatchResultAdapter
    private var imagePaths: List<String> = emptyList()
    private var results: List<BatchResult> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBatchResultBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener {
            if (DocumentCorrectionSDK.getInstance().isProcessing()) {
                DocumentCorrectionSDK.getInstance().cancel()
            }
            finish()
        }

        imagePaths = intent.getStringArrayListExtra(EXTRA_IMAGE_PATHS) ?: emptyList()

        setupRecyclerView()
        updateStats(emptyList())
        startBatchProcessing()

        binding.btnCancel.setOnClickListener {
            DocumentCorrectionSDK.getInstance().cancel()
        }
    }

    private fun setupRecyclerView() {
        adapter = BatchResultAdapter()
        binding.rvResults.layoutManager = LinearLayoutManager(this)
        binding.rvResults.adapter = adapter
    }

    private fun startBatchProcessing() {
        if (imagePaths.isEmpty()) {
            showToast("没有选择图片")
            finish()
            return
        }

        val outputDir = getExternalFilesDir(null)?.absolutePath + "/corrected"
        File(outputDir).mkdirs()

        showProgress(true)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val progressListener = BatchProgressListener { current, total, result ->
                    runOnUiThread {
                        binding.tvProgress.text = getString(
                            R.string.progress_processing,
                            current, total
                        )
                    }
                }

                val batchResults = DocumentCorrectionSDK.getInstance().correctBatch(
                    imagePaths,
                    outputDir,
                    progressListener
                )

                results = batchResults

                withContext(Dispatchers.Main) {
                    showProgress(false)
                    adapter.updateResults(batchResults)
                    updateStats(batchResults)
                    showToast(getString(R.string.success_batch_completed))
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showProgress(false)
                    showToast("处理失败: ${e.message}")
                }
            }
        }
    }

    private fun updateStats(results: List<BatchResult>) {
        val successCount = results.count { it.success }
        val failedCount = results.count { !it.success }
        val totalCount = imagePaths.size

        binding.tvSuccessCount.text = successCount.toString()
        binding.tvFailedCount.text = failedCount.toString()
        binding.tvTotalCount.text = totalCount.toString()
    }

    private fun showProgress(show: Boolean) {
        binding.progressOverlay.visibility = if (show) View.VISIBLE else View.GONE
        binding.tvProgress.text = getString(R.string.progress_processing, 0, imagePaths.size)
    }

    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    override fun onBackPressed() {
        if (DocumentCorrectionSDK.getInstance().isProcessing()) {
            DocumentCorrectionSDK.getInstance().cancel()
        }
        super.onBackPressed()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (DocumentCorrectionSDK.getInstance().isProcessing()) {
            DocumentCorrectionSDK.getInstance().cancel()
        }
    }
}
