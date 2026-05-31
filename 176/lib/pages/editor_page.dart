import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import 'package:audioplayers/audioplayers.dart';

import '../models/audio_editor_model.dart';
import '../widgets/waveform.dart';
import '../widgets/export_dialog.dart';

class EditorPage extends StatefulWidget {
  const EditorPage({super.key});

  @override
  State<EditorPage> createState() => _EditorPageState();
}

class _EditorPageState extends State<EditorPage> {
  @override
  Widget build(BuildContext context) {
    final model = context.watch<AudioEditorModel>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('音频剪辑工具'),
        actions: [
          IconButton(
            tooltip: '打开音频 (MP3/M4A)',
            icon: const Icon(Icons.folder_open),
            onPressed: _open,
          ),
          IconButton(
            tooltip: '撤销',
            icon: const Icon(Icons.undo),
            onPressed: model.history.canUndo && !model.busy
                ? model.undo
                : null,
          ),
          IconButton(
            tooltip: '重做',
            icon: const Icon(Icons.redo),
            onPressed: model.history.canRedo && !model.busy
                ? model.redo
                : null,
          ),
          IconButton(
            tooltip: '导出 MP3',
            icon: const Icon(Icons.save_alt),
            onPressed:
                model.loadedFilePath != null && !model.busy ? _export : null,
          ),
        ],
      ),
      body: Column(
        children: [
          if (model.status != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              color: Colors.black12,
              child: Text(model.status!),
            ),
          Expanded(
            child: model.loadedFilePath == null
                ? const _EmptyView()
                : _EditorView(model: model),
          ),
        ],
      ),
    );
  }

  Future<void> _open() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.audio,
      allowedExtensions: ['mp3', 'm4a', 'wav', 'aac', 'flac'],
    );
    if (result == null || result.files.isEmpty) return;
    final path = result.files.first.path;
    if (path == null) return;
    if (!mounted) return;
    await context.read<AudioEditorModel>().loadFile(path);
  }

  Future<void> _export() async {
    final model = context.read<AudioEditorModel>();
    final kbps = await showDialog<int>(
      context: context,
      builder: (_) => const ExportDialog(),
    );
    if (kbps == null) return;
    final out = await FilePicker.platform.saveFile(
      dialogTitle: '保存 MP3',
      fileName: 'output.mp3',
      type: FileType.custom,
      allowedExtensions: ['mp3'],
    );
    if (out == null || out.isEmpty) return;
    await model.exportMp3(out, kbps);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('导出完成: $out')),
      );
    }
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.music_note, size: 72, color: Colors.grey),
          SizedBox(height: 12),
          Text('请点击左上角文件夹图标打开 MP3/M4A 文件'),
        ],
      ),
    );
  }
}

class _EditorView extends StatelessWidget {
  final AudioEditorModel model;

  const _EditorView({required this.model});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('文件: ${model.loadedFilePath}',
              style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('时长: ${model.duration.toStringAsFixed(2)}s'),
          const SizedBox(height: 12),
          WaveformWidget(
            samples: model.waveform,
            duration: model.duration,
            selectionStart: model.selectionStart,
            selectionEnd: model.selectionEnd,
            onSelectionChanged: (r) =>
                model.setSelection(r.left, r.right),
          ),
          const SizedBox(height: 8),
          Text(
            '选区: ${model.selectionStart.toStringAsFixed(2)}s - '
            '${model.selectionEnd.toStringAsFixed(2)}s  '
            '(拖拽左右橙色手柄调整)',
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: model.busy ? null : model.doTrim,
                icon: const Icon(Icons.cut),
                label: const Text('裁剪选区'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _SectionCard(
            title: '音量 (0% - 200%)',
            child: Column(
              children: [
                Slider(
                  min: 0.0,
                  max: 2.0,
                  divisions: 40,
                  value: model.volume,
                  onChanged: model.setVolume,
                ),
                Text('${(model.volume * 100).toStringAsFixed(0)}%'),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: model.busy ? null : model.doApplyVolume,
                  icon: const Icon(Icons.volume_up),
                  label: const Text('应用音量'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: '淡入 / 淡出 (0 - 5 秒)',
            child: Column(
              children: [
                Row(
                  children: [
                    const SizedBox(width: 60, child: Text('淡入')),
                    Expanded(
                      child: Slider(
                        min: 0.0,
                        max: 5.0,
                        divisions: 50,
                        value: model.fadeIn,
                        onChanged: model.setFadeIn,
                      ),
                    ),
                    SizedBox(
                        width: 60,
                        child: Text(
                            '${model.fadeIn.toStringAsFixed(2)}s')),
                  ],
                ),
                Row(
                  children: [
                    const SizedBox(width: 60, child: Text('淡出')),
                    Expanded(
                      child: Slider(
                        min: 0.0,
                        max: 5.0,
                        divisions: 50,
                        value: model.fadeOut,
                        onChanged: model.setFadeOut,
                      ),
                    ),
                    SizedBox(
                        width: 60,
                        child: Text(
                            '${model.fadeOut.toStringAsFixed(2)}s')),
                  ],
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: model.busy ? null : model.doApplyFade,
                  icon: const Icon(Icons.gradient),
                  label: const Text('应用淡入淡出'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _EffectSectionCard(
            title: '回声 (Echo)',
            effectType: 0,
            model: model,
            params: [
              _EffectParam(
                label: '延迟',
                unit: 'ms',
                min: 10,
                max: 2000,
                value: model.echoDelayMs,
                onChanged: model.setEchoDelayMs,
                divisions: 199,
              ),
              _EffectParam(
                label: '反馈',
                unit: '%',
                min: 0,
                max: 90,
                value: model.echoFeedback * 100,
                onChanged: (v) => model.setEchoFeedback(v / 100),
                divisions: 90,
              ),
              _EffectParam(
                label: '混合',
                unit: '%',
                min: 0,
                max: 100,
                value: model.echoMix * 100,
                onChanged: (v) => model.setEchoMix(v / 100),
                divisions: 100,
              ),
            ],
            applyButtonText: '应用回声',
            applyIcon: Icons.multitrack_audio,
          ),
          const SizedBox(height: 12),
          _EffectSectionCard(
            title: '混响 (Reverb) — FFT 卷积',
            effectType: 1,
            model: model,
            params: [
              _EffectParam(
                label: '房间大小',
                unit: 'x',
                min: 50,
                max: 200,
                value: model.reverbRoomSize * 100,
                onChanged: (v) => model.setReverbRoomSize(v / 100),
                divisions: 150,
              ),
              _EffectParam(
                label: '阻尼',
                unit: '%',
                min: 10,
                max: 90,
                value: model.reverbDamping * 100,
                onChanged: (v) => model.setReverbDamping(v / 100),
                divisions: 80,
              ),
              _EffectParam(
                label: '湿信号',
                unit: '%',
                min: 0,
                max: 100,
                value: model.reverbWetMix * 100,
                onChanged: (v) => model.setReverbWetMix(v / 100),
                divisions: 100,
              ),
            ],
            applyButtonText: '应用混响',
            applyIcon: Icons.surround_sound,
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            child,
          ],
        ),
      ),
    );
  }
}

class _EffectParam {
  final String label;
  final String unit;
  final double min;
  final double max;
  final double value;
  final ValueChanged<double> onChanged;
  final int divisions;

  const _EffectParam({
    required this.label,
    required this.unit,
    required this.min,
    required this.max,
    required this.value,
    required this.onChanged,
    required this.divisions,
  });
}

class _EffectSectionCard extends StatefulWidget {
  final String title;
  final int effectType;
  final AudioEditorModel model;
  final List<_EffectParam> params;
  final String applyButtonText;
  final IconData applyIcon;

  const _EffectSectionCard({
    required this.title,
    required this.effectType,
    required this.model,
    required this.params,
    required this.applyButtonText,
    required this.applyIcon,
  });

  @override
  State<_EffectSectionCard> createState() => _EffectSectionCardState();
}

class _EffectSectionCardState extends State<_EffectSectionCard> {
  final AudioPlayer _player = AudioPlayer();
  bool _isPlaying = false;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _isPlaying = false);
    });
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _generateAndPlayPreview() async {
    if (widget.model.busy) return;
    final path = await widget.model.previewEffect(
      widget.effectType,
      seconds: 5.0,
    );
    if (path != null && mounted) {
      await _player.play(DeviceFileSource(path));
      setState(() {
        _isPlaying = true;
      });
    }
  }

  Future<void> _stopPreview() async {
    await _player.stop();
    if (mounted) setState(() => _isPlaying = false);
  }

  Future<void> _togglePreview() async {
    if (_isPlaying) {
      await _stopPreview();
    } else {
      await _generateAndPlayPreview();
    }
  }

  Future<void> _apply() async {
    if (widget.effectType == 0) {
      await widget.model.doApplyEcho();
    } else {
      await widget.model.doApplyReverb();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ...widget.params.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      SizedBox(width: 80, child: Text(p.label)),
                      Expanded(
                        child: Slider(
                          min: p.min,
                          max: p.max,
                          divisions: p.divisions,
                          value: p.value.clamp(p.min, p.max),
                          onChanged: widget.model.busy ? null : p.onChanged,
                        ),
                      ),
                      SizedBox(
                          width: 60,
                          child: Text(
                              '${p.value.toStringAsFixed(p.unit == 'ms' ? 0 : 0)}${p.unit}')),
                    ],
                  ),
                )),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FilledButton.icon(
                  onPressed:
                      widget.model.busy ? null : _togglePreview,
                  icon: Icon(_isPlaying ? Icons.stop : Icons.play_arrow),
                  label: Text(_isPlaying ? '停止预览' : '预览 (5秒)'),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  onPressed: widget.model.busy ? null : _apply,
                  icon: Icon(widget.applyIcon),
                  label: Text(widget.applyButtonText),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
