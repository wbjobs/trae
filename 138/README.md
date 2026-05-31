# 文档矫正 SDK (Document Correction SDK)

基于 C++ + FastDeploy + Paddle Lite 实现的高性能文档矫正 SDK，支持 Android 平台，提供 Java/Kotlin JNI 接口。

## 功能特性

- 📷 **文档角点检测**：支持深度学习（PaddleOCR DB）和传统 OpenCV 算法双模式
- 🔄 **透视变换矫正**：自动计算透视变换矩阵，输出平整文档图像
- 📱 **Android 支持**：提供完整的 Java/Kotlin JNI 接口
- 📦 **批量处理**：支持相册多选批量矫正，多线程加速
- ⚡ **高性能**：基于 FastDeploy + Paddle Lite，支持 GPU 加速
- 🎯 **进度回调**：实时处理进度反馈，支持取消操作

## 项目结构

```
DocumentCorrectionSDK/
├── CMakeLists.txt              # C++ 构建配置
├── cpp/
│   ├── include/                # 头文件
│   │   ├── common.h            # 公共数据结构
│   │   ├── document_detector.h # 文档角点检测
│   │   ├── perspective_transformer.h  # 透视变换
│   │   ├── document_correction.h      # 主矫正类
│   │   └── batch_processor.h   # 批量处理器
│   └── src/                    # 实现文件
│       ├── document_detector.cpp
│       ├── perspective_transformer.cpp
│       ├── document_correction.cpp
│       └── batch_processor.cpp
├── jni/
│   └── document_correction_jni.cpp  # JNI 接口实现
├── android/
│   ├── sdk/                    # Android SDK 模块
│   │   ├── build.gradle.kts
│   │   └── src/main/java/com/doccorrection/
│   │       ├── Point2f.kt
│   │       ├── Corners.kt
│   │       ├── CorrectionOptions.kt
│   │       ├── CorrectionResult.kt
│   │       ├── BatchResult.kt
│   │       ├── BatchProgressListener.kt
│   │       ├── DocumentCorrectionSDK.kt        # Kotlin SDK 主类
│   │       └── DocumentCorrectionSDKJava.java  # Java 兼容封装
│   └── app/                    # 示例应用
│       ├── build.gradle.kts
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── java/com/doccorrection/demo/
│           │   ├── MainActivity.kt
│           │   ├── CorrectionActivity.kt
│           │   ├── BatchResultActivity.kt
│           │   └── BatchResultAdapter.kt
│           └── res/
├── examples/
│   └── cpp/
│       └── test_correction.cpp # C++ 测试程序
├── build.gradle.kts            # Android 根构建配置
├── settings.gradle.kts
└── gradle.properties
```

## 快速开始

### 1. 环境要求

- **C++**: C++17 或更高
- **OpenCV**: 4.x 版本
- **FastDeploy**: 最新版本（含 Paddle Lite 后端）
- **Android**: API 24+ (Android 7.0+)
- **CMake**: 3.22+

### 2. 依赖准备

#### 安装 OpenCV
```bash
# Ubuntu/Debian
sudo apt-get install libopencv-dev

# macOS (Homebrew)
brew install opencv

# Windows
# 下载并配置 OpenCV 环境变量
```

#### 安装 FastDeploy
```bash
# 下载 FastDeploy
# https://github.com/PaddlePaddle/FastDeploy/releases

# 设置环境变量
export FASTDEPLOY_DIR=/path/to/fastdeploy
```

#### 模型准备
下载 PaddleOCR DB 检测模型：
```bash
# 模型下载地址
# https://paddleocr.bj.bcebos.com/PP-OCRv3/chinese/ch_PP-OCRv3_det_infer.tar

# 解压后目录结构
models/
└── ch_PP-OCRv3_det_infer/
    ├── inference.pdmodel
    ├── inference.pdiparams
    └── inference.pdiparams.info
```

### 3. C++ 使用

#### 编译
```bash
mkdir build && cd build
cmake .. -DWITH_FASTDEPLOY=ON -DWITH_OPENCV=ON
make -j4
```

#### 单张图像矫正
```cpp
#include "document_correction.h"

using namespace doc_correction;

int main() {
    CorrectionOptions options;
    options.target_width = 1080;
    options.target_height = 1920;

    DocumentCorrection corrector;
    corrector.init("/path/to/model", options);

    CorrectionResult result = corrector.correct("/path/to/input.jpg");

    if (result.success) {
        cv::imwrite("/path/to/output.jpg", result.corrected_image);
    }

    return 0;
}
```

#### 批量处理
```cpp
#include "batch_processor.h"

using namespace doc_correction;

int main() {
    BatchProcessor processor;
    processor.init("/path/to/model");
    processor.setThreadCount(4);

    std::vector<std::string> paths = {"img1.jpg", "img2.jpg", "img3.jpg"};

    auto callback = [](int current, int total, const BatchResult& result) {
        std::cout << "[" << current << "/" << total << "] "
                  << (result.success ? "OK" : "FAIL") << std::endl;
    };

    auto results = processor.process(paths, "/output/dir", callback);

    return 0;
}
```

#### 命令行工具
```bash
# 单张矫正
./test_correction single input.jpg output.jpg [model_dir]

# 批量处理
./test_correction batch list.txt output/ [model_dir]

# 角点检测（带可视化）
./test_correction detect input.jpg [model_dir]
```

### 4. Android 使用

#### 配置 build.gradle
```kotlin
android {
    defaultConfig {
        minSdk = 24
        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++17"
                arguments += listOf(
                    "-DBUILD_ANDROID=ON",
                    "-DWITH_FASTDEPLOY=ON",
                    "-DWITH_OPENCV=ON"
                )
            }
        }
    }
}

dependencies {
    implementation(project(":sdk"))
}
```

#### Kotlin 代码示例
```kotlin
// 初始化 SDK
val options = CorrectionOptions.Builder()
    .targetWidth(1080)
    .targetHeight(1920)
    .keepAspectRatio(true)
    .padding(20)
    .confidenceThreshold(0.5f)
    .useGpu(false)
    .threadCount(2)
    .build()

val sdk = DocumentCorrectionSDK.getInstance()
val success = sdk.init(context, "/path/to/model", options)

// 单张矫正
val bitmap: Bitmap = ...
val result = sdk.correct(bitmap)

if (result.success) {
    imageView.setImageBitmap(result.correctedBitmap)
    Log.d("Corners", result.corners.toString())
}

// 批量处理（相册多选）
val imagePaths: List<String> = ...
val outputDir = getExternalFilesDir(null)?.absolutePath + "/corrected"

val results = sdk.correctBatch(
    inputPaths = imagePaths,
    outputDir = outputDir,
    listener = { current, total, result ->
        Log.d("Progress", "[$current/$total] ${result.success}")
    }
)

// 协程异步调用
val result = sdk.correctAsync(bitmap)

// Flow 流式批量处理
sdk.correctBatchFlow(imagePaths, outputDir)
    .collect { progress ->
        when (progress) {
            is DocumentCorrectionSDK.BatchProgress.Progress -> {
                // 更新进度
            }
            is DocumentCorrectionSDK.BatchProgress.Completed -> {
                // 处理完成
                val results = progress.results
            }
        }
    }

// 释放资源
sdk.release()
```

#### Java 代码示例
```java
DocumentCorrectionSDKJava sdk = DocumentCorrectionSDKJava.getInstance();
boolean success = sdk.init(context);

// 单张矫正
Bitmap bitmap = ...;
CorrectionResult result = sdk.correct(bitmap);

if (result.getSuccess()) {
    imageView.setImageBitmap(result.getCorrectedBitmap());
}

// 批量处理
List<String> paths = ...;
List<BatchResult> results = sdk.correctBatchFromPaths(
    paths,
    outputDir,
    (current, total, batchResult) -> {
        Log.d("Progress", current + "/" + total);
    }
);

// 取消处理
sdk.cancel();

// 释放
sdk.release();
```

## 核心 API 说明

### CorrectionOptions 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| targetWidth | Int | 1080 | 输出目标宽度 |
| targetHeight | Int | 1920 | 输出目标高度 |
| keepAspectRatio | Boolean | true | 是否保持宽高比 |
| padding | Int | 20 | 输出图像边距 |
| confidenceThreshold | Float | 0.5f | 检测置信度阈值 |
| useGpu | Boolean | false | 是否使用 GPU |
| threadCount | Int | 2 | 批量处理线程数 |

### Corners 角点数据结构

```kotlin
data class Corners(
    val topLeft: Point2f,      // 左上角
    val topRight: Point2f,     // 右上角
    val bottomRight: Point2f,  // 右下角
    val bottomLeft: Point2f    // 左下角
)
```

### CorrectionResult 矫正结果

```kotlin
data class CorrectionResult(
    val correctedBitmap: Bitmap?,  // 矫正后的图像
    val corners: Corners,          // 检测到的角点
    val success: Boolean,          // 是否成功
    val errorMessage: String?      // 错误信息
)
```

## 算法原理

### 1. 文档角点检测

**深度学习模式（FastDeploy + Paddle Lite）：**
- 使用 PaddleOCR DB 文本检测模型
- 检测文档区域的四边形轮廓
- 选择最大面积的四边形作为文档区域
- 对四个角点进行排序（左上、右上、右下、左下）

**传统算法模式（OpenCV）：**
- 灰度化 → 高斯模糊 → Canny 边缘检测
- 形态学闭操作连接边缘
- 轮廓查找与多边形拟合
- 筛选四边形轮廓作为文档区域

### 2. 透视变换矫正

1. 根据检测到的四个角点，计算文档的实际宽高
2. 生成目标矩形的四个顶点坐标
3. 计算透视变换矩阵 M
4. 应用透视变换 `warpPerspective` 得到平整图像
5. 支持边距填充和宽高比保持

### 3. 阴影去除（Retinex光照归一化）

**算法原理：**
- 基于Retinex理论：图像 = 光照分量 × 反射分量
- 通过估计光照分量并去除，得到光照均匀的图像

**三种处理模式：**

| 模式 | 说明 | 适用场景 | 耗时(1080p) |
|------|------|----------|-------------|
| `FAST_SSR` | 单尺度Retinex，盒式滤波近似高斯 | 一般阴影场景 | < 15ms |
| `SIMPLE_MSR` | 多尺度Retinex（3个尺度加权平均） | 复杂阴影场景 | < 30ms |
| `ADAPTIVE` | 自适应Retinex，根据图像特征自动调整参数 | 通用场景 | < 20ms |

**性能优化：**
- 盒式滤波（Box Blur）近似高斯模糊，O(n)复杂度
- 分离式滤波（先水平后垂直），减少计算量
- 灰度图处理后再恢复彩色，避免3通道重复计算
- 1080p图像处理耗时 < 30ms

**使用示例：**
```kotlin
// 启用阴影去除
val shadowOptions = ShadowRemovalOptions.Builder()
    .type(ShadowRemovalType.ADAPTIVE)  // 自适应模式
    .sigma(80.0f)                        // 高斯核参数
    .gain(1.0f)                          // 亮度增益
    .preserveColor(true)                 // 保持色彩比例
    .build()

val options = CorrectionOptions.Builder()
    .shadowRemoval(shadowOptions)
    .build()

sdk.init(context, modelDir, options)

// 单独使用阴影去除
val result = sdk.removeShadow(bitmap, shadowOptions)
```

## 性能优化

- **多线程批量处理**：通过 BatchProcessor 实现多线程并行处理
- **内存复用**：JNI 层直接操作 Bitmap 像素数据，避免多次拷贝
- **Paddle Lite 优化**：移动端推理优化，支持 FP16 和 INT8 量化
- **GPU 加速**：支持 OpenCL GPU 推理（需要 FastDeploy GPU 版本）
- **高效Retinex**：盒式滤波近似高斯模糊，1080p处理 < 30ms

## 常见问题

### Q: 没有模型文件可以使用吗？
A: 可以。SDK 内置了基于 OpenCV 的传统检测算法，即使没有模型文件也能工作。但使用深度学习模型准确率更高。

### Q: 如何提高检测准确率？
A: 
1. 使用 PaddleOCR 深度学习模型
2. 调整 `confidenceThreshold` 参数（0.3-0.7）
3. 确保拍摄时光照充足，文档占据画面主体

### Q: 批量处理时如何控制内存占用？
A: 
1. 调整 `threadCount` 控制并发数
2. 处理大图片时先进行适当缩放
3. 及时调用 `release()` 释放资源

### Q: 支持哪些图片格式？
A: 支持 JPEG、PNG、BMP 等 OpenCV 支持的所有格式。Android 端支持 Bitmap（ARGB_8888 和 RGB_565）。

### Q: 阴影去除会影响文档矫正的角点检测吗？
A: 不会。阴影去除是在矫正前的预处理步骤，会提升低对比度场景下的检测准确率。实际处理流程是：
1. 输入图像 → 2. 阴影去除（可选）→ 3. 角点检测 → 4. 透视变换矫正 → 5. 输出

### Q: 阴影去除的性能如何？
A: 
- FAST_SSR: < 15ms @ 1080p
- ADAPTIVE: < 20ms @ 1080p  
- SIMPLE_MSR: < 30ms @ 1080p
- 纯角点检测+矫正: < 10ms @ 1080p
- 完整流程（含阴影去除）: < 40ms @ 1080p

### Q: 如何选择阴影去除的模式？
A: 
- 一般场景使用 `FAST_SSR`，速度最快
- 复杂阴影（如手指阴影、不均匀光照）使用 `SIMPLE_MSR`
- 不确定时使用 `ADAPTIVE`，会根据图像特征自动调整

### Q: 浅色背景 + 浅色文档场景下检测失败怎么办？
A: SDK 已针对低对比度场景进行了深度优化（v2.0+）：

**技术方案**：
1. **多通道边缘检测**：融合灰度、HSV（S/V通道）、LAB（L通道）的边缘检测结果
2. **自适应对比度增强**：CLAHE + Gamma校正 + 动态线性拉伸
3. **动态Canny阈值**：基于Otsu算法 + 图像亮度/对比度自动调整阈值
4. **多尺度检测**：4组不同参数组合并行检测，选取最优结果
5. **候选评估机制**：综合面积比、边长比、角度偏差、纹理丰富度评分
6. **角点亚像素优化**：梯度加权 + `cornerSubPix` 亚像素级精确定位
7. **边缘推断回退**：极端情况下从四个角区域搜索最大边缘点

**使用建议**：
- 默认置信度阈值已降至 0.3，适应更多场景
- 可适当降低 `confidenceThreshold` 至 0.2（但可能增加误检）
- 确保文档至少占据画面 15% 以上面积
- 避免文档与背景色差小于 20 个灰度级的极端场景

**相关参数调整**：
```kotlin
val options = CorrectionOptions.Builder()
    .confidenceThreshold(0.25f)    // 进一步降低阈值
    .build()
```

## License

MIT License

## 技术支持

如有问题，请提交 Issue 或联系开发团队。
