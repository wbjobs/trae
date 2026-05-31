# 模型目录

本目录存放摔倒检测所需的模型文件。

## 必需的模型文件

### 1. MediaPipe Pose 模型
- **文件名**: `pose_landmarker_full.task`
- **下载地址**: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task

### 2. LSTM 摔倒检测模型
- **文件名**: `fall_detection_lstm.tflite`
- **生成方式**: 运行 `../scripts/train_lstm.py` 训练脚本自动生成

## 模型下载命令

### Windows PowerShell:
```powershell
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task" -OutFile "pose_landmarker_full.task"
```

### 或手动下载:
1. 访问 https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
2. 下载 Pose Landmarker (Full) 模型
3. 放置到本目录

## 模型训练

训练 LSTM 模型:
```bash
cd ../scripts
python train_lstm.py --samples 10000 --epochs 50
```

训练完成后会自动生成:
- `fall_detection_lstm.h5` - Keras 格式模型
- `fall_detection_lstm.tflite` - TensorFlow Lite 格式模型
- `training_history.png` - 训练过程图表
