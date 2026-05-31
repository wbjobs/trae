import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'models/audio_editor_model.dart';
import 'pages/editor_page.dart';

void main() {
  runApp(const AudioEditorApp());
}

class AudioEditorApp extends StatelessWidget {
  const AudioEditorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AudioEditorModel>(
      create: (_) => AudioEditorModel(),
      child: MaterialApp(
        title: '音频剪辑工具',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorSchemeSeed: Colors.indigo,
          useMaterial3: true,
          brightness: Brightness.dark,
        ),
        home: const EditorPage(),
      ),
    );
  }
}
