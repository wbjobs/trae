package com.doccorrection;

import android.content.Context;
import android.graphics.Bitmap;

import java.util.List;
import java.util.ArrayList;

public class DocumentCorrectionSDKJava {

    private final DocumentCorrectionSDK sdk;

    private DocumentCorrectionSDKJava() {
        this.sdk = DocumentCorrectionSDK.INSTANCE;
    }

    private static class Holder {
        private static final DocumentCorrectionSDKJava INSTANCE = new DocumentCorrectionSDKJava();
    }

    public static DocumentCorrectionSDKJava getInstance() {
        return Holder.INSTANCE;
    }

    public boolean init(Context context) {
        return sdk.init(context, "", new CorrectionOptions());
    }

    public boolean init(Context context, String modelDir) {
        return sdk.init(context, modelDir, new CorrectionOptions());
    }

    public boolean init(Context context, String modelDir, CorrectionOptions options) {
        return sdk.init(context, modelDir, options);
    }

    public boolean isInitialized() {
        return sdk.isInitialized();
    }

    public CorrectionResult correct(Bitmap bitmap) {
        return sdk.correct(bitmap);
    }

    public List<BatchResult> correctBatch(List<Bitmap> bitmaps) {
        return sdk.correctBatch(bitmaps, null);
    }

    public List<BatchResult> correctBatch(List<Bitmap> bitmaps, BatchProgressListener listener) {
        return sdk.correctBatch(bitmaps, listener);
    }

    public List<BatchResult> correctBatchFromPaths(List<String> inputPaths, String outputDir) {
        return sdk.correctBatch(inputPaths, outputDir, null);
    }

    public List<BatchResult> correctBatchFromPaths(
            List<String> inputPaths,
            String outputDir,
            BatchProgressListener listener) {
        return sdk.correctBatch(inputPaths, outputDir, listener);
    }

    public void cancel() {
        sdk.cancel();
    }

    public boolean isProcessing() {
        return sdk.isProcessing();
    }

    public int getThreadCount() {
        return sdk.getThreadCount();
    }

    public void setThreadCount(int count) {
        sdk.setThreadCount(count);
    }

    public Bitmap removeShadow(Bitmap bitmap, ShadowRemovalOptions options) {
        return sdk.removeShadow(bitmap, options);
    }

    public void release() {
        sdk.release();
    }
}
