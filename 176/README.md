# 音频剪辑桌面工具

基于 Flutter + FFmpeg + Dart FFI

## 架构

```
lib/
├── main.dart                              应用入口
├── models/audio_editor_model.dart          业务状态 (Provider 撤销/重做 & 操作调度
├── services/
│   ├── audio_engine.dart                FFI 绑定层 (Dart → C DLL)
│   └── history.dart                     命令模式撤销/重做栈 (快照 WAV)
├── widgets/
│   ├── waveform.dart                   自定义波形绘制 + 选区手柄
│   └── export_dialog.dart            MP3 导出对话框
└── pages/
    └── editor_page.dart              主界面

ffi/
└── lib_audio_editor.c                FFI 动态库 (封装 ffmpeg/ffprobe 可执行文件
```

## 功能

- 加载 MP3 / M4A / WAV 等音频文件
- 自定义 Canvas 绘制波形图
- 裁剪选区：拖拽波形左右橙色手柄
- 音量调节 0% ~ 200%
- 淡入淡出 0 ~ 5 秒
- 撤销 / 重做
- 导出 MP3，可选 64/96/128/192/256/320 kbps

## 构建

### 1. 构建 FFI 动态库 (Windows)

在 `ffi/` 目录下执行 (需要 MinGW64 或 MSVC)：

```bash
gcc -shared -o lib_audio_editor.dll lib_audio_editor.c
```

或者使用 MSVC:

```bash
cl /LD /Fe:lib_audio_editor.dll lib_audio_editor.c
```

### 2. 放置 FFmpeg

- 下载 [gyan.dev FFmpeg Windows build](https://www.gyan.dev/ffmpeg/builds/)，将 `ffmpeg.exe` 与 `ffprobe.exe` 放到系统 PATH，或在运行前调用：

```dart
NativeAudioEngine.instance.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe",
    ffprobe: "C:/ffmpeg/bin/ffprobe.exe");
```

### 3. 运行 Flutter Desktop

```bash
flutter create .   # 如果还没有 desktop 配置
flutter config --enable-windows-desktop
flutter run -d windows
```

## 设计要点

- **撤销/重做**：每次编辑操作生成一份新的 WAV 快照，压入 `HistoryStack`。光标回退/前进即可无损切换到任意历史版本。
- **波形绘制**：将音频解码为 8kHz/mono float PCM，在 Dart 侧按像素宽度聚合峰值，绘制效率高。
- **FFI 层**：`lib_audio_editor` 的所有导出函数均为同步阻塞调用，内部通过 `system()` 执行 ffmpeg/ffprobe。如果需要纯 libav 方式可以替换为 avformat/avcodec 直接调用。
