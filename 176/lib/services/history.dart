import 'dart:io';
import 'package:flutter/foundation.dart';

/// 编辑命令抽象。每个命令表示一次可撤销的操作。
abstract class EditCommand {
  String get label;
}

class TrimCommand implements EditCommand {
  final double start;
  final double end;
  TrimCommand(this.start, this.end);
  @override
  String get label => '裁剪 ${start.toStringAsFixed(2)}s - ${end.toStringAsFixed(2)}s';
}

class VolumeCommand implements EditCommand {
  final double volume;
  VolumeCommand(this.volume);
  @override
  String get label => '音量 ${(volume * 100).toStringAsFixed(0)}%';
}

class FadeCommand implements EditCommand {
  final double fadeIn;
  final double fadeOut;
  FadeCommand(this.fadeIn, this.fadeOut);
  @override
  String get label =>
      '淡入 ${fadeIn.toStringAsFixed(2)}s / 淡出 ${fadeOut.toStringAsFixed(2)}s';
}

class EchoCommand implements EditCommand {
  final double delayMs;
  final double feedback;
  final double mix;
  EchoCommand(this.delayMs, this.feedback, this.mix);
  @override
  String get label =>
      '回声 ${delayMs.toStringAsFixed(0)}ms / 反馈 ${(feedback * 100).toStringAsFixed(0)}%';
}

class ReverbCommand implements EditCommand {
  final double roomSize;
  final double damping;
  final double wetMix;
  ReverbCommand(this.roomSize, this.damping, this.wetMix);
  @override
  String get label =>
      '混响 房间${roomSize.toStringAsFixed(1)}x / 阻尼${(damping * 100).toStringAsFixed(0)}%';
}

/// 历史栈：支持撤销与重做。
/// 采用「每步一份 WAV 快照」策略，操作是无损的。
class HistoryStack extends ChangeNotifier {
  final List<String> _snapshots = [];
  final List<EditCommand> _commands = [];
  int _cursor = -1;

  List<String> get snapshots => List.unmodifiable(_snapshots);

  String? get current => _cursor >= 0 && _cursor < _snapshots.length
      ? _snapshots[_cursor]
      : null;

  int get cursor => _cursor;

  bool get canUndo => _cursor > 0;
  bool get canRedo => _cursor < _snapshots.length - 1;

  EditCommand? get currentCommand =>
      _cursor >= 0 && _cursor < _commands.length ? _commands[_cursor] : null;

  /// 初始化：载入初始音频快照。
  void initWith(String path) {
    _snapshots.clear();
    _commands.clear();
    _snapshots.add(path);
    _commands.add(TrimCommand(0, 0));
    _cursor = 0;
    notifyListeners();
  }

  /// 推入新步骤。如果当前不在栈顶，会丢弃其后的历史。
  void push(String snapshotPath, EditCommand cmd) {
    if (_cursor < _snapshots.length - 1) {
      _snapshots.removeRange(_cursor + 1, _snapshots.length);
      _commands.removeRange(_cursor + 1, _commands.length);
    }
    _snapshots.add(snapshotPath);
    _commands.add(cmd);
    _cursor = _snapshots.length - 1;
    notifyListeners();
  }

  /// 撤销：光标回退一步。返回新的当前快照路径。
  String? undo() {
    if (!canUndo) return null;
    _cursor--;
    notifyListeners();
    return current;
  }

  /// 重做：光标前进一步。返回新的当前快照路径。
  String? redo() {
    if (!canRedo) return null;
    _cursor++;
    notifyListeners();
    return current;
  }

  /// 清理所有快照文件。
  Future<void> disposeAll() async {
    for (final p in _snapshots) {
      try {
        final f = File(p);
        if (await f.exists()) await f.delete();
      } catch (_) {}
    }
    _snapshots.clear();
    _commands.clear();
    _cursor = -1;
    notifyListeners();
  }
}
