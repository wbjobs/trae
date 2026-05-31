import 'package:flutter/material.dart';

class ExportDialog extends StatefulWidget {
  const ExportDialog({super.key});

  @override
  State<ExportDialog> createState() => _ExportDialogState();
}

class _ExportDialogState extends State<ExportDialog> {
  final List<int> _bitrates = const [64, 96, 128, 192, 256, 320];
  int _bitrate = 192;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('导出 MP3'),
      content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('选择比特率'),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          value: _bitrate,
          decoration: const InputDecoration(border: OutlineInputBorder()),
          items: _bitrates
              .map((b) => DropdownMenuItem<int>(
                    value: b,
                    child: Text('${b} kbps'),
                  ))
              .toList(),
          onChanged: (v) => setState(() => _bitrate = v ?? 192),
        ),
      ],
    ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, null),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _bitrate),
          child: const Text('导出'),
        ),
      ],
    );
  }
}
