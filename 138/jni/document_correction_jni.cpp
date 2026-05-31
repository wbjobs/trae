#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <memory>

#include "document_correction.h"
#include "batch_processor.h"

#define LOG_TAG "DocumentCorrection"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

using namespace doc_correction;

extern "C" {

static std::unique_ptr<DocumentCorrection> s_corrector;
static std::unique_ptr<BatchProcessor> s_batchProcessor;

JNIEXPORT jboolean JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeInit(
    JNIEnv *env, jobject thiz, jstring model_dir,
    jint target_width, jint target_height,
    jboolean keep_aspect_ratio, jint padding,
    jfloat confidence_threshold, jboolean use_gpu,
    jint shadow_removal_type, jfloat shadow_sigma,
    jfloat shadow_gain, jfloat shadow_offset,
    jboolean shadow_preserve_color) {

    const char *model_dir_cstr = env->GetStringUTFChars(model_dir, nullptr);
    std::string model_path(model_dir_cstr ? model_dir_cstr : "");
    env->ReleaseStringUTFChars(model_dir, model_dir_cstr);

    CorrectionOptions options;
    options.target_width = target_width;
    options.target_height = target_height;
    options.keep_aspect_ratio = keep_aspect_ratio;
    options.padding = padding;
    options.confidence_threshold = confidence_threshold;
    options.use_gpu = use_gpu;
    options.shadow_removal.type = static_cast<ShadowRemovalType>(shadow_removal_type);
    options.shadow_removal.sigma = shadow_sigma;
    options.shadow_removal.gain = shadow_gain;
    options.shadow_removal.offset = shadow_offset;
    options.shadow_removal.preserve_color = shadow_preserve_color;

    s_corrector = std::make_unique<DocumentCorrection>();
    bool result = s_corrector->init(model_path, options);

    if (result) {
        s_batchProcessor = std::make_unique<BatchProcessor>();
        s_batchProcessor->init(model_path, options);
    }

    return result ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jobject JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeRemoveShadow(
    JNIEnv *env, jobject thiz, jobject bitmap,
    jint shadow_removal_type, jfloat sigma,
    jfloat gain, jfloat offset, jboolean preserve_color) {

    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) {
        LOGE("Failed to get bitmap info");
        return nullptr;
    }

    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888 &&
        info.format != ANDROID_BITMAP_FORMAT_RGB_565) {
        LOGE("Unsupported bitmap format");
        return nullptr;
    }

    void *pixels;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) {
        LOGE("Failed to lock bitmap pixels");
        return nullptr;
    }

    cv::Mat image;
    if (info.format == ANDROID_BITMAP_FORMAT_RGBA_8888) {
        image = cv::Mat(info.height, info.width, CV_8UC4, pixels);
        cv::cvtColor(image, image, cv::COLOR_RGBA2BGR);
    } else {
        image = cv::Mat(info.height, info.width, CV_8UC2, pixels);
        cv::cvtColor(image, image, cv::COLOR_BGR5652BGR);
    }

    AndroidBitmap_unlockPixels(env, bitmap);

    ShadowRemovalOptions options;
    options.type = static_cast<ShadowRemovalType>(shadow_removal_type);
    options.sigma = sigma;
    options.gain = gain;
    options.offset = offset;
    options.preserve_color = preserve_color;

    cv::Mat result = DocumentCorrection::removeShadow(image, options);

    if (result.empty()) {
        return nullptr;
    }

    cv::Mat result_rgba;
    cv::cvtColor(result, result_rgba, cv::COLOR_BGR2RGBA);

    jclass bitmapConfigClass = env->FindClass("android/graphics/Bitmap$Config");
    jfieldID argb8888Field = env->GetStaticFieldID(bitmapConfigClass, "ARGB_8888", "Landroid/graphics/Bitmap$Config;");
    jobject argb8888Config = env->GetStaticObjectField(bitmapConfigClass, argb8888Field);

    jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
    jmethodID createBitmapMethod = env->GetStaticMethodID(bitmapClass, "createBitmap",
        "(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;");

    jobject outputBitmap = env->CallStaticObjectMethod(bitmapClass, createBitmapMethod,
        result_rgba.cols, result_rgba.rows, argb8888Config);

    if (AndroidBitmap_lockPixels(env, outputBitmap, &pixels) < 0) {
        LOGE("Failed to lock output bitmap pixels");
        return nullptr;
    }

    memcpy(pixels, result_rgba.data, result_rgba.total() * result_rgba.elemSize());
    AndroidBitmap_unlockPixels(env, outputBitmap);

    return outputBitmap;
}

JNIEXPORT jboolean JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeIsInitialized(
    JNIEnv *env, jobject thiz) {
    return (s_corrector && s_corrector->isInitialized()) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jobject JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeCorrectBitmap(
    JNIEnv *env, jobject thiz, jobject bitmap) {

    if (!s_corrector || !s_corrector->isInitialized()) {
        LOGE("SDK not initialized");
        return nullptr;
    }

    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) {
        LOGE("Failed to get bitmap info");
        return nullptr;
    }

    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888 &&
        info.format != ANDROID_BITMAP_FORMAT_RGB_565) {
        LOGE("Unsupported bitmap format");
        return nullptr;
    }

    void *pixels;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) {
        LOGE("Failed to lock bitmap pixels");
        return nullptr;
    }

    cv::Mat image;
    if (info.format == ANDROID_BITMAP_FORMAT_RGBA_8888) {
        image = cv::Mat(info.height, info.width, CV_8UC4, pixels);
        cv::cvtColor(image, image, cv::COLOR_RGBA2BGR);
    } else {
        image = cv::Mat(info.height, info.width, CV_8UC2, pixels);
        cv::cvtColor(image, image, cv::COLOR_BGR5652BGR);
    }

    AndroidBitmap_unlockPixels(env, bitmap);

    CorrectionResult result = s_corrector->correct(image);

    if (!result.success) {
        LOGE("Correction failed: %s", result.error_message.c_str());
        return nullptr;
    }

    cv::Mat corrected_rgba;
    cv::cvtColor(result.corrected_image, corrected_rgba, cv::COLOR_BGR2RGBA);

    jclass bitmapConfigClass = env->FindClass("android/graphics/Bitmap$Config");
    jfieldID argb8888Field = env->GetStaticFieldID(bitmapConfigClass, "ARGB_8888", "Landroid/graphics/Bitmap$Config;");
    jobject argb8888Config = env->GetStaticObjectField(bitmapConfigClass, argb8888Field);

    jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
    jmethodID createBitmapMethod = env->GetStaticMethodID(bitmapClass, "createBitmap",
        "(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;");

    jobject outputBitmap = env->CallStaticObjectMethod(bitmapClass, createBitmapMethod,
        corrected_rgba.cols, corrected_rgba.rows, argb8888Config);

    if (AndroidBitmap_lockPixels(env, outputBitmap, &pixels) < 0) {
        LOGE("Failed to lock output bitmap pixels");
        return nullptr;
    }

    memcpy(pixels, corrected_rgba.data, corrected_rgba.total() * corrected_rgba.elemSize());
    AndroidBitmap_unlockPixels(env, outputBitmap);

    jclass resultClass = env->FindClass("com/doccorrection/CorrectionResult");
    jmethodID resultConstructor = env->GetMethodID(resultClass, "<init>",
        "(Landroid/graphics/Bitmap;[FFFFZLjava/lang/String;)V");

    jfloatArray cornersArray = env->NewFloatArray(8);
    jfloat corners[8] = {
        result.corners.top_left.x, result.corners.top_left.y,
        result.corners.top_right.x, result.corners.top_right.y,
        result.corners.bottom_right.x, result.corners.bottom_right.y,
        result.corners.bottom_left.x, result.corners.bottom_left.y
    };
    env->SetFloatArrayRegion(cornersArray, 0, 8, corners);

    jstring errorMsg = result.success ? nullptr :
        env->NewStringUTF(result.error_message.c_str());

    jobject correctionResult = env->NewObject(resultClass, resultConstructor,
        outputBitmap, cornersArray,
        result.corners.top_left.x, result.corners.top_left.y,
        result.success ? JNI_TRUE : JNI_FALSE, errorMsg);

    return correctionResult;
}

JNIEXPORT jobjectArray JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeCorrectBitmapArray(
    JNIEnv *env, jobject thiz, jobjectArray bitmaps, jobject progress_listener) {

    if (!s_batchProcessor) {
        LOGE("Batch processor not initialized");
        return nullptr;
    }

    jsize length = env->GetArrayLength(bitmaps);
    std::vector<cv::Mat> images;
    images.reserve(length);

    for (jsize i = 0; i < length; i++) {
        jobject bitmap = env->GetObjectArrayElement(bitmaps, i);

        AndroidBitmapInfo info;
        if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) {
            images.push_back(cv::Mat());
            continue;
        }

        void *pixels;
        if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) {
            images.push_back(cv::Mat());
            continue;
        }

        cv::Mat image;
        if (info.format == ANDROID_BITMAP_FORMAT_RGBA_8888) {
            image = cv::Mat(info.height, info.width, CV_8UC4, pixels);
            cv::cvtColor(image, image, cv::COLOR_RGBA2BGR);
        } else if (info.format == ANDROID_BITMAP_FORMAT_RGB_565) {
            image = cv::Mat(info.height, info.width, CV_8UC2, pixels);
            cv::cvtColor(image, image, cv::COLOR_BGR5652BGR);
        }

        AndroidBitmap_unlockPixels(env, bitmap);
        images.push_back(image);
    }

    jclass listenerClass = env->GetObjectClass(progress_listener);
    jmethodID onProgressMethod = env->GetMethodID(listenerClass, "onProgress",
        "(IILcom/doccorrection/BatchResult;)V");

    auto callback = [&](int current, int total, const BatchResult& result) {
        jclass batchResultClass = env->FindClass("com/doccorrection/BatchResult");
        jmethodID batchResultConstructor = env->GetMethodID(batchResultClass, "<init>",
            "(Ljava/lang/String;Ljava/lang/String;ZLjava/lang/String;[F)V");

        jfloatArray cornersArray = env->NewFloatArray(8);
        jfloat corners[8] = {
            result.corners.top_left.x, result.corners.top_left.y,
            result.corners.top_right.x, result.corners.top_right.y,
            result.corners.bottom_right.x, result.corners.bottom_right.y,
            result.corners.bottom_left.x, result.corners.bottom_left.y
        };
        env->SetFloatArrayRegion(cornersArray, 0, 8, corners);

        jstring inputPath = env->NewStringUTF(result.input_path.c_str());
        jstring outputPath = env->NewStringUTF(result.output_path.c_str());
        jstring errorMsg = result.success ? nullptr :
            env->NewStringUTF(result.error_message.c_str());

        jobject batchResult = env->NewObject(batchResultClass, batchResultConstructor,
            inputPath, outputPath, result.success ? JNI_TRUE : JNI_FALSE,
            errorMsg, cornersArray);

        env->CallVoidMethod(progress_listener, onProgressMethod, current, total, batchResult);
    };

    std::vector<BatchResult> results = s_batchProcessor->process(images, callback);

    jclass batchResultClass = env->FindClass("com/doccorrection/BatchResult");
    jobjectArray resultArray = env->NewObjectArray(results.size(), batchResultClass, nullptr);

    for (size_t i = 0; i < results.size(); i++) {
        const auto& result = results[i];

        jfloatArray cornersArray = env->NewFloatArray(8);
        jfloat corners[8] = {
            result.corners.top_left.x, result.corners.top_left.y,
            result.corners.top_right.x, result.corners.top_right.y,
            result.corners.bottom_right.x, result.corners.bottom_right.y,
            result.corners.bottom_left.x, result.corners.bottom_left.y
        };
        env->SetFloatArrayRegion(cornersArray, 0, 8, corners);

        jstring inputPath = env->NewStringUTF(result.input_path.c_str());
        jstring outputPath = env->NewStringUTF(result.output_path.c_str());
        jstring errorMsg = result.success ? nullptr :
            env->NewStringUTF(result.error_message.c_str());

        jmethodID batchResultConstructor = env->GetMethodID(batchResultClass, "<init>",
            "(Ljava/lang/String;Ljava/lang/String;ZLjava/lang/String;[F)V");

        jobject batchResult = env->NewObject(batchResultClass, batchResultConstructor,
            inputPath, outputPath, result.success ? JNI_TRUE : JNI_FALSE,
            errorMsg, cornersArray);

        env->SetObjectArrayElement(resultArray, i, batchResult);
    }

    return resultArray;
}

JNIEXPORT jobjectArray JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeCorrectPaths(
    JNIEnv *env, jobject thiz, jobjectArray input_paths, jstring output_dir,
    jobject progress_listener) {

    if (!s_batchProcessor) {
        LOGE("Batch processor not initialized");
        return nullptr;
    }

    jsize length = env->GetArrayLength(input_paths);
    std::vector<std::string> inputPaths;
    inputPaths.reserve(length);

    for (jsize i = 0; i < length; i++) {
        jstring path = (jstring)env->GetObjectArrayElement(input_paths, i);
        const char *path_cstr = env->GetStringUTFChars(path, nullptr);
        inputPaths.emplace_back(path_cstr ? path_cstr : "");
        env->ReleaseStringUTFChars(path, path_cstr);
    }

    const char *output_dir_cstr = env->GetStringUTFChars(output_dir, nullptr);
    std::string outputDir(output_dir_cstr ? output_dir_cstr : "");
    env->ReleaseStringUTFChars(output_dir, output_dir_cstr);

    jclass listenerClass = env->GetObjectClass(progress_listener);
    jmethodID onProgressMethod = env->GetMethodID(listenerClass, "onProgress",
        "(IILcom/doccorrection/BatchResult;)V");

    auto callback = [&](int current, int total, const BatchResult& result) {
        jclass batchResultClass = env->FindClass("com/doccorrection/BatchResult");
        jmethodID batchResultConstructor = env->GetMethodID(batchResultClass, "<init>",
            "(Ljava/lang/String;Ljava/lang/String;ZLjava/lang/String;[F)V");

        jfloatArray cornersArray = env->NewFloatArray(8);
        jfloat corners[8] = {
            result.corners.top_left.x, result.corners.top_left.y,
            result.corners.top_right.x, result.corners.top_right.y,
            result.corners.bottom_right.x, result.corners.bottom_right.y,
            result.corners.bottom_left.x, result.corners.bottom_left.y
        };
        env->SetFloatArrayRegion(cornersArray, 0, 8, corners);

        jstring inputPath = env->NewStringUTF(result.input_path.c_str());
        jstring outputPath = env->NewStringUTF(result.output_path.c_str());
        jstring errorMsg = result.success ? nullptr :
            env->NewStringUTF(result.error_message.c_str());

        jobject batchResult = env->NewObject(batchResultClass, batchResultConstructor,
            inputPath, outputPath, result.success ? JNI_TRUE : JNI_FALSE,
            errorMsg, cornersArray);

        env->CallVoidMethod(progress_listener, onProgressMethod, current, total, batchResult);
    };

    std::vector<BatchResult> results = s_batchProcessor->process(inputPaths, outputDir, callback);

    jclass batchResultClass = env->FindClass("com/doccorrection/BatchResult");
    jobjectArray resultArray = env->NewObjectArray(results.size(), batchResultClass, nullptr);

    for (size_t i = 0; i < results.size(); i++) {
        const auto& result = results[i];

        jfloatArray cornersArray = env->NewFloatArray(8);
        jfloat corners[8] = {
            result.corners.top_left.x, result.corners.top_left.y,
            result.corners.top_right.x, result.corners.top_right.y,
            result.corners.bottom_right.x, result.corners.bottom_right.y,
            result.corners.bottom_left.x, result.corners.bottom_left.y
        };
        env->SetFloatArrayRegion(cornersArray, 0, 8, corners);

        jstring inputPath = env->NewStringUTF(result.input_path.c_str());
        jstring outputPath = env->NewStringUTF(result.output_path.c_str());
        jstring errorMsg = result.success ? nullptr :
            env->NewStringUTF(result.error_message.c_str());

        jmethodID batchResultConstructor = env->GetMethodID(batchResultClass, "<init>",
            "(Ljava/lang/String;Ljava/lang/String;ZLjava/lang/String;[F)V");

        jobject batchResult = env->NewObject(batchResultClass, batchResultConstructor,
            inputPath, outputPath, result.success ? JNI_TRUE : JNI_FALSE,
            errorMsg, cornersArray);

        env->SetObjectArrayElement(resultArray, i, batchResult);
    }

    return resultArray;
}

JNIEXPORT void JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeCancel(
    JNIEnv *env, jobject thiz) {
    if (s_batchProcessor) {
        s_batchProcessor->cancel();
    }
}

JNIEXPORT jboolean JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeIsProcessing(
    JNIEnv *env, jobject thiz) {
    return s_batchProcessor && s_batchProcessor->isProcessing() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeSetThreadCount(
    JNIEnv *env, jobject thiz, jint count) {
    if (s_batchProcessor) {
        s_batchProcessor->setThreadCount(count);
    }
}

JNIEXPORT jint JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeGetThreadCount(
    JNIEnv *env, jobject thiz) {
    return s_batchProcessor ? s_batchProcessor->getThreadCount() : 1;
}

JNIEXPORT void JNICALL
Java_com_doccorrection_DocumentCorrectionSDK_nativeRelease(
    JNIEnv *env, jobject thiz) {
    s_corrector.reset();
    s_batchProcessor.reset();
}

}
