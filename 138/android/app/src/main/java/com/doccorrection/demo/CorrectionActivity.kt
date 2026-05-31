package com.doccorrection.demo

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.doccorrection.CorrectionResult
import com.doccorrection.DocumentCorrectionSDK
import com.doccorrection.demo.databinding.ActivityCorrectionBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class CorrectionActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCorrectionBinding
    private var currentBitmap: Bitmap? = null
    private var correctedBitmap: Bitmap? = null
    private var currentResult: CorrectionResult? = null

    private val imagePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            result.data?.data?.let { uri ->
                loadImage(uri)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCorrectionBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.btnSelectImage.setOnClickListener {
            selectImage()
        }

        binding.btnCorrect.setOnClickListener {
            correctImage()
        }

        binding.btnSave.setOnClickListener {
            saveImage()
        }
    }

    private fun selectImage() {
        val intent = Intent(Intent.ACTION_PICK)
        intent.type = "image/*"
        imagePicker.launch(intent)
    }

    private fun loadImage(uri: Uri) {
        showLoading(true)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val bitmap = contentResolver.openInputStream(uri)?.use { inputStream ->
                    BitmapFactory.decodeStream(inputStream)
                }

                withContext(Dispatchers.Main) {
                    bitmap?.let {
                        currentBitmap = it
                        binding.ivOriginal.setImageBitmap(it)
                        binding.ivCorrected.setImageBitmap(null)
                        correctedBitmap = null
                        currentResult = null
                        binding.btnSave.isEnabled = false
                        binding.tvCorners.visibility = View.GONE
                        binding.tvCornersData.visibility = View.GONE
                    }
                    showLoading(false)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    showToast("加载图片失败: ${e.message}")
                }
            }
        }
    }

    private fun correctImage() {
        val bitmap = currentBitmap ?: run {
            showToast(getString(R.string.error_no_image))
            return
        }

        showLoading(true)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = DocumentCorrectionSDK.getInstance().correctAsync(bitmap)

                withContext(Dispatchers.Main) {
                    currentResult = result
                    if (result.success) {
                        correctedBitmap = result.correctedBitmap
                        binding.ivCorrected.setImageBitmap(result.correctedBitmap)
                        binding.btnSave.isEnabled = true

                        binding.tvCorners.visibility = View.VISIBLE
                        binding.tvCornersData.visibility = View.VISIBLE
                        binding.tvCornersData.text = buildString {
                            append("左上: (${result.corners.topLeft.x}, ${result.corners.topLeft.y})\n")
                            append("右上: (${result.corners.topRight.x}, ${result.corners.topRight.y})\n")
                            append("右下: (${result.corners.bottomRight.x}, ${result.corners.bottomRight.y})\n")
                            append("左下: (${result.corners.bottomLeft.x}, ${result.corners.bottomLeft.y})")
                        }

                        showToast("矫正成功")
                    } else {
                        showToast(getString(R.string.error_correction, result.errorMessage))
                    }
                    showLoading(false)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    showToast(getString(R.string.error_correction, e.message))
                }
            }
        }
    }

    private fun saveImage() {
        val bitmap = correctedBitmap ?: run {
            showToast("没有可保存的图片")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault())
                    .format(Date())
                val fileName = "DOC_$timeStamp.jpg"

                val storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES)
                val imageFile = File(storageDir, fileName)

                FileOutputStream(imageFile).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
                }

                val mediaScanIntent = Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
                val contentUri = Uri.fromFile(imageFile)
                mediaScanIntent.data = contentUri
                sendBroadcast(mediaScanIntent)

                withContext(Dispatchers.Main) {
                    showToast(getString(R.string.success_saved) + ": ${imageFile.absolutePath}")
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showToast("保存失败: ${e.message}")
                }
            }
        }
    }

    private fun showLoading(show: Boolean) {
        binding.progressBar.visibility = if (show) View.VISIBLE else View.GONE
        binding.btnCorrect.isEnabled = !show
        binding.btnSelectImage.isEnabled = !show
        binding.btnSave.isEnabled = !show && correctedBitmap != null
    }

    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
