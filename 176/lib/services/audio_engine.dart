import 'dart:ffi';
import 'dart:io';
import 'package:ffi/ffi.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

typedef _LogCallbackNative = Void Function(Int32 level, Pointer<Utf8> msg);
typedef _LogCallbackDart = void Function(int level, Pointer<Utf8> msg);

typedef _SetLogCbNative = Void Function(Pointer<NativeFunction<_LogCallbackNative>> cb);
typedef _SetLogCbDart = void Function(Pointer<NativeFunction<_LogCallbackNative>> cb);

typedef _SetPathNative = Void Function(Pointer<Utf8> path);
typedef _SetPathDart = void Function(Pointer<Utf8> path);

typedef _GetDurationNative = Double Function(Pointer<Utf8> input);
typedef _GetDurationDart = double Function(Pointer<Utf8> input);

typedef _ExtractWaveNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Pointer<Float>> outBuf,
    Pointer<Int32> outCount, Int32 targetBins);
typedef _ExtractWaveDart = int Function(
    Pointer<Utf8> input, Pointer<Pointer<Float>> outBuf,
    Pointer<Int32> outCount, int targetBins);

typedef _FreeSamplesNative = Void Function(Pointer<Float> samples);
typedef _FreeSamplesDart = void Function(Pointer<Float> samples);

typedef _TrimNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output, Double start, Double end);
typedef _TrimDart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output, double start, double end);

typedef _VolumeNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output, Double volume);
typedef _VolumeDart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output, double volume);

typedef _FadeNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    Double fi, Double fo, Double dur);
typedef _FadeDart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    double fi, double fo, double dur);

typedef _ExportMp3Native = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output, Int32 kbps);
typedef _ExportMp3Dart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output, int kbps);

typedef _EchoNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    Double delayMs, Double feedback, Double mix);
typedef _EchoDart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    double delayMs, double feedback, double mix);

typedef _ReverbNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    Double roomSize, Double damping, Double wetMix);
typedef _ReverbDart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    double roomSize, double damping, double wetMix);

typedef _PreviewNative = Int32 Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    Int32 effectType, Double previewSeconds,
    Double p1, Double p2, Double p3);
typedef _PreviewDart = int Function(
    Pointer<Utf8> input, Pointer<Utf8> output,
    int effectType, double previewSeconds,
    double p1, double p2, double p3);

/// Dart FFI 对 `lib_audio_editor` 的封装。
/// 所有编辑操作统一产生 WAV 中间文件（16-bit / 44.1kHz），
/// 以便撤销/重做与后续操作可复用。
class NativeAudioEngine {
  late final DynamicLibrary _lib;
  bool _ready = false;

  // function pointers
  late final void Function(Pointer<NativeFunction<_LogCallbackNative>>) _setLogCb;
  late final void Function(Pointer<Utf8>) _setFfmpeg;
  late final void Function(Pointer<Utf8>) _setFfprobe;
  late final double Function(Pointer<Utf8>) _getDuration;
  late final int Function(Pointer<Utf8>, Pointer<Pointer<Float>>, Pointer<Int32>, int) _extractWave;
  late final void Function(Pointer<Float>) _freeSamples;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, double, double) _trim;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, double) _volume;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, double, double, double) _fade;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, int) _exportMp3;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, double, double, double) _echo;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, double, double, double) _reverb;
  late final int Function(Pointer<Utf8>, Pointer<Utf8>, int, double, double, double, double) _preview;

  void Function(String)? onLog;

  NativeAudioEngine._();

  static final NativeAudioEngine instance = NativeAudioEngine._();

  bool get ready => _ready;

  /// 加载动态库。可传入自定义路径；默认在 `./ffi/` 下查找。
  Future<void> load({String? libPath}) async {
    if (_ready) return;
    String path;
    if (libPath != null && libPath.isNotEmpty) {
      path = libPath;
    } else {
      if (Platform.isWindows) {
        path = p.join(Directory.current.path, 'ffi', 'lib_audio_editor.dll');
      } else if (Platform.isMacOS) {
        path = p.join(Directory.current.path, 'ffi', 'lib_audio_editor.dylib');
      } else {
        path = p.join(Directory.current.path, 'ffi', 'lib_audio_editor.so');
      }
    }
    if (!File(path).existsSync()) {
      throw Exception('找不到音频引擎动态库: $path。请先构建 ffi/lib_audio_editor.*');
    }
    _lib = DynamicLibrary.open(path);
    _bind();
    _registerLogCallback();
    _ready = true;
  }

  void _bind() {
    _setLogCb = _lib.lookupFunction<_SetLogCbNative, _SetLogCbDart>('ae_set_log_callback');
    _setFfmpeg = _lib.lookupFunction<_SetPathNative, _SetPathDart>('ae_set_ffmpeg_path');
    _setFfprobe = _lib.lookupFunction<_SetPathNative, _SetPathDart>('ae_set_ffprobe_path');
    _getDuration = _lib.lookupFunction<_GetDurationNative, _GetDurationDart>('ae_get_duration_seconds');
    _extractWave = _lib.lookupFunction<_ExtractWaveNative, _ExtractWaveDart>('ae_extract_waveform');
    _freeSamples = _lib.lookupFunction<_FreeSamplesNative, _FreeSamplesDart>('ae_free_samples');
    _trim = _lib.lookupFunction<_TrimNative, _TrimDart>('ae_trim');
    _volume = _lib.lookupFunction<_VolumeNative, _VolumeDart>('ae_apply_volume');
    _fade = _lib.lookupFunction<_FadeNative, _FadeDart>('ae_apply_fade');
    _exportMp3 = _lib.lookupFunction<_ExportMp3Native, _ExportMp3Dart>('ae_export_mp3');
    _echo = _lib.lookupFunction<_EchoNative, _EchoDart>('ae_apply_echo');
    _reverb = _lib.lookupFunction<_ReverbNative, _ReverbDart>('ae_apply_reverb');
    _preview = _lib.lookupFunction<_PreviewNative, _PreviewDart>('ae_apply_effect_preview');
  }

  void _registerLogCallback() {
    void cb(int level, Pointer<Utf8> msg) {
      final s = msg.toDartString();
      if (onLog != null) onLog!.call('[$level] $s');
    }
    final native = Pointer.fromFunction<_LogCallbackNative>(cb);
    _setLogCb(native);
  }

  /// 设置外部 FFmpeg/Ffprobe 可执行路径。
  void setFfmpegPath(String ffmpeg, {String? ffprobe}) {
    final p1 = ffmpeg.toNativeUtf8();
    _setFfmpeg(p1);
    calloc.free(p1);
    if (ffprobe != null) {
      final p2 = ffprobe.toNativeUtf8();
      _setFfprobe(p2);
      calloc.free(p2);
    }
  }

  double getDuration(String inputPath) {
    final p = inputPath.toNativeUtf8();
    try {
      return _getDuration(p);
    } finally {
      calloc.free(p);
    }
  }

  static const int _kWaveformBins = 2000;

  /// 从音频文件中抽取波形数据用于显示。
  /// 采用分桶聚合（默认 2000 桶），无论音频多长，内存占用恒定。
  /// 调用者负责在使用完后调用 `disposeWaveform` 释放内存。
  Waveform extractWaveform(String inputPath) {
    final pIn = inputPath.toNativeUtf8();
    final pBuf = calloc<Pointer<Float>>();
    final pCnt = calloc<Int32>();
    try {
      final rc = _extractWave(pIn, pBuf, pCnt, _kWaveformBins);
      if (rc != 0) {
        throw Exception('抽取波形失败, code=$rc');
      }
      final count = pCnt.value;
      final ptr = pBuf.value;
      final list = ptr.asTypedList(count).toList(growable: false);
      return Waveform(ptr, list, count);
    } finally {
      calloc.free(pIn);
      calloc.free(pBuf);
      calloc.free(pCnt);
    }
  }

  void disposeWaveform(Waveform w) {
    if (w._ptr != nullptr) {
      _freeSamples(w._ptr);
    }
  }

  void _checkRc(int rc, String op) {
    if (rc != 0) throw Exception('FFmpeg 操作失败: $op');
  }

  Future<void> trim(String input, String output, double start, double end) async {
    final a = input.toNativeUtf8();
    final b = output.toNativeUtf8();
    try {
      _checkRc(_trim(a, b, start, end), 'trim');
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  Future<void> applyVolume(String input, String output, double volume) async {
    final a = input.toNativeUtf8();
    final b = output.toNativeUtf8();
    try {
      _checkRc(_volume(a, b, volume), 'volume');
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  Future<void> applyFade(String input, String output,
      double fadeIn, double fadeOut, double duration) async {
    final a = input.toNativeUtf8();
    final b = output.toNativeUtf8();
    try {
      _checkRc(_fade(a, b, fadeIn, fadeOut, duration), 'fade');
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  Future<void> exportMp3(String input, String output, int kbps) async {
    final a = input.toNativeUtf8();
    final b = output.toNativeUtf8();
    try {
      _checkRc(_exportMp3(a, b, kbps), 'export_mp3');
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  Future<void> applyEcho(String input, String output,
      double delayMs, double feedback, double mix) async {
    final a = input.toNativeUtf8();
    final b = output.toNativeUtf8();
    try {
      _checkRc(_echo(a, b, delayMs, feedback, mix), 'echo');
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  Future<void> applyReverb(String input, String output,
      double roomSize, double damping, double wetMix) async {
    final a = input.toNativeUtf8();
    final b = output.toNativeUtf8();
    try {
      _checkRc(_reverb(a, b, roomSize, damping, wetMix), 'reverb');
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  Future<String> applyEffectPreview(String input, int effectType,
      double previewSeconds, double p1, double p2, double p3) async {
    final dir = await tempDir();
    final outPath = p.join(dir, 'preview_${DateTime.now().millisecondsSinceEpoch}.wav');
    final a = input.toNativeUtf8();
    final b = outPath.toNativeUtf8();
    try {
      _checkRc(_preview(a, b, effectType, previewSeconds, p1, p2, p3), 'preview');
      return outPath;
    } finally {
      calloc.free(a);
      calloc.free(b);
    }
  }

  /// 应用临时工作目录，避免污染用户目录。
  Future<String> tempDir() async {
    final base = (await getTemporaryDirectory()).path;
    final dir = Directory(p.join(base, 'audio_editor_${DateTime.now().millisecondsSinceEpoch}'));
    await dir.create(recursive: true);
    return dir.path;
  }
}

class Waveform {
  final Pointer<Float> _ptr;
  final List<double> samples;
  final int binCount;

  Waveform(this._ptr, this.samples, this.binCount);
}
