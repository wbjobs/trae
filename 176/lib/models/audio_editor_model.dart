import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../services/audio_engine.dart';
import '../services/history.dart';

class AudioEditorModel extends ChangeNotifier {
  final NativeAudioEngine _engine = NativeAudioEngine.instance;
  final HistoryStack history = HistoryStack();

  String? _loadedFilePath;
  String? get loadedFilePath => _loadedFilePath;

  double _duration = 0.0;
  double get duration => _duration;

  List<double> _waveform = const [];
  List<double> get waveform => _waveform;

  int _waveformBinCount = 0;
  int get waveformBinCount => _waveformBinCount;

  bool _busy = false;
  bool get busy => _busy;

  String? _status;
  String? get status => _status;

  // 裁剪选区（秒）
  double _selectionStart = 0.0;
  double _selectionEnd = 0.0;
  double get selectionStart => _selectionStart;
  double get selectionEnd => _selectionEnd;

  // 参数
  double _volume = 1.0;
  double get volume => _volume;

  double _fadeIn = 0.0;
  double get fadeIn => _fadeIn;

  double _fadeOut = 0.0;
  double get fadeOut => _fadeOut;

  // 回声参数
  double _echoDelayMs = 200.0;
  double get echoDelayMs => _echoDelayMs;
  double _echoFeedback = 0.3;
  double get echoFeedback => _echoFeedback;
  double _echoMix = 0.4;
  double get echoMix => _echoMix;

  // 混响参数
  double _reverbRoomSize = 1.0;
  double get reverbRoomSize => _reverbRoomSize;
  double _reverbDamping = 0.5;
  double get reverbDamping => _reverbDamping;
  double _reverbWetMix = 0.5;
  double get reverbWetMix => _reverbWetMix;

  // 预览
  String? _previewPath;
  String? get previewPath => _previewPath;

  final Uuid _uuid = const Uuid();

  Future<void> loadFile(String path) async {
    _busy = true;
    _status = '加载中...';
    notifyListeners();
    try {
      if (!_engine.ready) {
        await _engine.load();
      }
      final dur = _engine.getDuration(path);
      if (dur <= 0) throw Exception('无法读取音频时长: $path');

      // 初始化第一份快照（WAV）
      final snap0 = await _snapshotPath();
      await _engine.trim(path, snap0, 0.0, dur);

      // 抽取波形
      final wf = _engine.extractWaveform(snap0);
      _waveform = List<double>.unmodifiable(wf.samples);
      _waveformBinCount = wf.binCount;
      _engine.disposeWaveform(wf);

      _loadedFilePath = path;
      _duration = dur;
      _selectionStart = 0.0;
      _selectionEnd = dur;
      _volume = 1.0;
      _fadeIn = 0.0;
      _fadeOut = 0.0;

      history.initWith(snap0);
      _status = '已加载 ${p.basename(path)}';
    } catch (e) {
      _status = '加载失败: $e';
      debugPrint('loadFile error: $e');
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  void setSelection(double start, double end) {
    if (start < 0) start = 0;
    if (end > _duration) end = _duration;
    if (start > end) {
      final t = start; start = end; end = t;
    }
    _selectionStart = start;
    _selectionEnd = end;
    notifyListeners();
  }

  void setVolume(double v) {
    if (v < 0) v = 0;
    if (v > 2.0) v = 2.0;
    _volume = v;
    notifyListeners();
  }

  void setFadeIn(double v) {
    if (v < 0) v = 0;
    if (v > 5.0) v = 5.0;
    _fadeIn = v;
    notifyListeners();
  }

  void setFadeOut(double v) {
    if (v < 0) v = 0;
    if (v > 5.0) v = 5.0;
    _fadeOut = v;
    notifyListeners();
  }

  void setEchoDelayMs(double v) {
    if (v < 10) v = 10;
    if (v > 2000) v = 2000;
    _echoDelayMs = v;
    notifyListeners();
  }

  void setEchoFeedback(double v) {
    if (v < 0) v = 0;
    if (v > 0.9) v = 0.9;
    _echoFeedback = v;
    notifyListeners();
  }

  void setEchoMix(double v) {
    if (v < 0) v = 0;
    if (v > 1.0) v = 1.0;
    _echoMix = v;
    notifyListeners();
  }

  void setReverbRoomSize(double v) {
    if (v < 0.5) v = 0.5;
    if (v > 2.0) v = 2.0;
    _reverbRoomSize = v;
    notifyListeners();
  }

  void setReverbDamping(double v) {
    if (v < 0.1) v = 0.1;
    if (v > 0.9) v = 0.9;
    _reverbDamping = v;
    notifyListeners();
  }

  void setReverbWetMix(double v) {
    if (v < 0) v = 0;
    if (v > 1.0) v = 1.0;
    _reverbWetMix = v;
    notifyListeners();
  }

  Future<void> doTrim() async {
    final cur = history.current;
    if (cur == null) return;
    if (_selectionEnd - _selectionStart < 0.01) return;
    await _runOp('裁剪中...', () async {
      final out = await _snapshotPath();
      await _engine.trim(cur, out, _selectionStart, _selectionEnd);
      history.push(out, TrimCommand(_selectionStart, _selectionEnd));
      await _refreshFromCurrent();
    });
  }

  Future<void> doApplyVolume() async {
    final cur = history.current;
    if (cur == null) return;
    await _runOp('调整音量中...', () async {
      final out = await _snapshotPath();
      await _engine.applyVolume(cur, out, _volume);
      history.push(out, VolumeCommand(_volume));
      await _refreshFromCurrent();
    });
  }

  Future<void> doApplyFade() async {
    final cur = history.current;
    if (cur == null) return;
    await _runOp('添加淡入淡出中...', () async {
      final out = await _snapshotPath();
      await _engine.applyFade(cur, out, _fadeIn, _fadeOut, _duration);
      history.push(out, FadeCommand(_fadeIn, _fadeOut));
      await _refreshFromCurrent();
    });
  }

  Future<void> doApplyEcho() async {
    final cur = history.current;
    if (cur == null) return;
    await _runOp('添加回声中...', () async {
      final out = await _snapshotPath();
      await _engine.applyEcho(cur, out, _echoDelayMs, _echoFeedback, _echoMix);
      history.push(out, EchoCommand(_echoDelayMs, _echoFeedback, _echoMix));
      await _refreshFromCurrent();
    });
  }

  Future<void> doApplyReverb() async {
    final cur = history.current;
    if (cur == null) return;
    await _runOp('添加混响中...', () async {
      final out = await _snapshotPath();
      await _engine.applyReverb(cur, out, _reverbRoomSize, _reverbDamping, _reverbWetMix);
      history.push(out, ReverbCommand(_reverbRoomSize, _reverbDamping, _reverbWetMix));
      await _refreshFromCurrent();
    });
  }

  /// 实时预览效果。effectType: 0=回声, 1=混响。返回预览文件路径。
  Future<String?> previewEffect(int effectType, {double seconds = 5.0}) async {
    final cur = history.current;
    if (cur == null) return null;
    _busy = true;
    _status = '生成预览中...';
    notifyListeners();
    try {
      if (effectType == 0) {
        _previewPath = await _engine.applyEffectPreview(
            cur, effectType, seconds, _echoDelayMs, _echoFeedback, _echoMix);
      } else {
        _previewPath = await _engine.applyEffectPreview(
            cur, effectType, seconds, _reverbRoomSize, _reverbDamping, _reverbWetMix);
      }
      _status = '预览已生成';
      return _previewPath;
    } catch (e) {
      _status = '预览失败: $e';
      debugPrint('preview error: $e');
      return null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> undo() async {
    final p = history.undo();
    if (p == null) return;
    await _refreshFromCurrent();
    _status = '已撤销';
    notifyListeners();
  }

  Future<void> redo() async {
    final p = history.redo();
    if (p == null) return;
    await _refreshFromCurrent();
    _status = '已重做';
    notifyListeners();
  }

  Future<void> exportMp3(String outputPath, int kbps) async {
    final cur = history.current;
    if (cur == null) return;
    _busy = true;
    _status = '导出 MP3 中...';
    notifyListeners();
    try {
      await _engine.exportMp3(cur, outputPath, kbps);
      _status = '已导出: $outputPath';
    } catch (e) {
      _status = '导出失败: $e';
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> _refreshFromCurrent() async {
    final cur = history.current;
    if (cur == null) return;
    final dur = _engine.getDuration(cur);
    _duration = dur > 0 ? dur : _duration;

    final wf = _engine.extractWaveform(cur);
    _waveform = List<double>.unmodifiable(wf.samples);
    _waveformBinCount = wf.binCount;
    _engine.disposeWaveform(wf);

    _selectionStart = 0.0;
    _selectionEnd = _duration;
  }

  Future<void> _runOp(String statusMsg, Future<void> Function() fn) async {
    _busy = true;
    _status = statusMsg;
    notifyListeners();
    try {
      await fn();
      _status = '完成';
    } catch (e) {
      _status = '操作失败: $e';
      debugPrint('op error: $e');
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<String> _snapshotPath() async {
    final tmp = (await getTemporaryDirectory()).path;
    final dir = Directory(p.join(tmp, 'audio_editor_snaps'));
    if (!await dir.exists()) await dir.create(recursive: true);
    return p.join(dir.path, '${_uuid.v4()}.wav');
  }

  @override
  void dispose() {
    history.disposeAll().catchError((_) {});
    super.dispose();
  }
}
