package com.doccorrection.demo

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.doccorrection.CorrectionOptions
import com.doccorrection.DocumentCorrectionSDK
import com.doccorrection.demo.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.all { it.value }
        if (allGranted) {
            showToast("权限已授予")
        } else {
            showToast(getString(R.string.error_permission))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        checkPermissions()
        initSDK()

        binding.cardSingle.setOnClickListener {
            startActivity(Intent(this, CorrectionActivity::class.java))
        }

        binding.cardBatch.setOnClickListener {
            checkAndStartBatch()
        }
    }

    private fun checkPermissions() {
        val permissions = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }

        val needRequest = permissions.any {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needRequest) {
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    private fun initSDK() {
        CoroutineScope(Dispatchers.IO).launch {
            val options = CorrectionOptions.Builder()
                .targetWidth(1080)
                .targetHeight(1920)
                .keepAspectRatio(true)
                .padding(20)
                .confidenceThreshold(0.5f)
                .useGpu(false)
                .threadCount(2)
                .build()

            val success = DocumentCorrectionSDK.getInstance().init(
                this@MainActivity,
                "",
                options
            )

            withContext(Dispatchers.Main) {
                if (success) {
                    showToast("SDK 初始化成功")
                } else {
                    showToast(getString(R.string.error_sdk_init))
                }
            }
        }
    }

    private fun checkAndStartBatch() {
        if (!DocumentCorrectionSDK.getInstance().isInitialized()) {
            showToast(getString(R.string.error_sdk_init))
            return
        }

        val intent = Intent(Intent.ACTION_PICK)
        intent.type = "image/*"
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        batchImagePicker.launch(intent)
    }

    private val batchImagePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            val imagePaths = mutableListOf<String>()

            data?.clipData?.let { clipData ->
                for (i in 0 until clipData.itemCount) {
                    val uri = clipData.getItemAt(i).uri
                    getRealPathFromUri(uri)?.let { imagePaths.add(it) }
                }
            } ?: data?.data?.let { uri ->
                getRealPathFromUri(uri)?.let { imagePaths.add(it) }
            }

            if (imagePaths.isNotEmpty()) {
                val intent = Intent(this, BatchResultActivity::class.java)
                intent.putStringArrayListExtra(
                    BatchResultActivity.EXTRA_IMAGE_PATHS,
                    ArrayList(imagePaths)
                )
                startActivity(intent)
            } else {
                showToast(getString(R.string.error_no_image))
            }
        }
    }

    private fun getRealPathFromUri(uri: Uri): String? {
        return try {
            var realPath: String? = null
            val projection = arrayOf(android.provider.MediaStore.Images.Media.DATA)
            contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val columnIndex = cursor.getColumnIndexOrThrow(
                        android.provider.MediaStore.Images.Media.DATA
                    )
                    realPath = cursor.getString(columnIndex)
                }
            }
            realPath ?: uri.path
        } catch (e: Exception) {
            uri.path
        }
    }

    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        DocumentCorrectionSDK.getInstance().release()
    }
}
