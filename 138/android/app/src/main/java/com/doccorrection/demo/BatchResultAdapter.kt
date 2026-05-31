package com.doccorrection.demo

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.doccorrection.BatchResult
import com.doccorrection.demo.databinding.ItemBatchResultBinding
import java.io.File

class BatchResultAdapter : RecyclerView.Adapter<BatchResultAdapter.ViewHolder>() {

    private var results: List<BatchResult> = emptyList()

    fun updateResults(newResults: List<BatchResult>) {
        results = newResults
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemBatchResultBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(results[position])
    }

    override fun getItemCount(): Int = results.size

    class ViewHolder(private val binding: ItemBatchResultBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(result: BatchResult) {
            val file = File(result.outputPath)
            val displayName = file.name.ifEmpty {
                File(result.inputPath).name
            }

            binding.tvFileName.text = displayName
            binding.tvFilePath.text = if (result.success) result.outputPath else result.inputPath

            if (result.success) {
                binding.ivStatus.setImageResource(android.R.drawable.ic_menu_check)
                binding.ivStatus.setColorFilter(
                    binding.root.context.resources.getColor(
                        android.R.color.holo_green_dark
                    )
                )
                binding.tvError.visibility = android.view.View.GONE

                Glide.with(binding.root.context)
                    .load(file)
                    .centerCrop()
                    .placeholder(android.R.drawable.ic_menu_gallery)
                    .error(android.R.drawable.ic_menu_report_image)
                    .into(binding.ivThumbnail)
            } else {
                binding.ivStatus.setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
                binding.ivStatus.setColorFilter(
                    binding.root.context.resources.getColor(
                        android.R.color.holo_red_dark
                    )
                )
                binding.tvError.visibility = android.view.View.VISIBLE
                binding.tvError.text = result.errorMessage

                Glide.with(binding.root.context)
                    .load(File(result.inputPath))
                    .centerCrop()
                    .placeholder(android.R.drawable.ic_menu_gallery)
                    .error(android.R.drawable.ic_menu_report_image)
                    .into(binding.ivThumbnail)
            }
        }
    }
}
