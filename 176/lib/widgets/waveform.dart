import 'package:flutter/material.dart';

/// 自定义波形绘制控件。
/// - 使用 `CustomPaint` 直接在 Canvas 上绘制。
/// - 支持显示选区（半透明高亮）。
/// - 支持拖拽调整选区的起点/终点（左右手柄）。
class WaveformWidget extends StatefulWidget {
  final List<double> samples;
  final double duration;
  final double selectionStart;
  final double selectionEnd;
  final ValueChanged<Rect>? onSelectionChanged;
  final Color color;
  final Color selectionColor;
  final double minHeight;

  const WaveformWidget({
    super.key,
    required this.samples,
    required this.duration,
    required this.selectionStart,
    required this.selectionEnd,
    this.onSelectionChanged,
    this.color = const Color(0xFF4FC3F7),
    this.selectionColor = const Color(0x66FFB74D),
    this.minHeight = 160,
  });

  @override
  State<WaveformWidget> createState() => _WaveformWidgetState();
}

class _WaveformWidgetState extends State<WaveformWidget> {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (ctx, constraints) {
        final width = constraints.maxWidth;
        final height = widget.minHeight;
        return GestureDetector(
          onHorizontalDragStart: _onDragStart,
          onHorizontalDragUpdate: _onDragUpdate,
          onHorizontalDragEnd: _onDragEnd,
          child: CustomPaint(
            size: Size(width, height),
            painter: _WavePainter(
              samples: widget.samples,
              duration: widget.duration,
              selectionStart: widget.selectionStart,
              selectionEnd: widget.selectionEnd,
              color: widget.color,
              selectionColor: widget.selectionColor,
            ),
          ),
        );
      },
    );
  }

  int? _dragMode; // 0: start handle, 1: end handle, null: no drag

  double _xToTime(double x, double w) {
    if (w <= 0) return 0;
    return (x / w) * widget.duration;
  }

  void _onDragStart(DragStartDetails details) {
    final rb = context.findRenderObject() as RenderBox?;
    if (rb == null) return;
    final w = rb.size.width;
    final x = details.localPosition.dx;
    final startX = widget.selectionStart / widget.duration * w;
    final endX = widget.selectionEnd / widget.duration * w;
    if ((x - startX).abs() < 12) {
      _dragMode = 0;
    } else if ((x - endX).abs() < 12) {
      _dragMode = 1;
    } else {
      _dragMode = null;
    }
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (_dragMode == null) return;
    final rb = context.findRenderObject() as RenderBox?;
    if (rb == null) return;
    final w = rb.size.width;
    final x = details.localPosition.dx;
    final t = _xToTime(x, w);
    if (_dragMode == 0) {
      widget.onSelectionChanged
          ?.call(Rect.fromLTRB(t, 0, widget.selectionEnd, 0));
    } else {
      widget.onSelectionChanged
          ?.call(Rect.fromLTRB(widget.selectionStart, 0, t, 0));
    }
  }

  void _onDragEnd(DragEndDetails details) {
    _dragMode = null;
  }
}

class _WavePainter extends CustomPainter {
  final List<double> samples;
  final double duration;
  final double selectionStart;
  final double selectionEnd;
  final Color color;
  final Color selectionColor;

  _WavePainter({
    required this.samples,
    required this.duration,
    required this.selectionStart,
    required this.selectionEnd,
    required this.color,
    required this.selectionColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // 背景
    final bg = Paint()..color = const Color(0xFF1E1E1E);
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), bg);

    // 中线
    final midPaint = Paint()
      ..color = const Color(0x33FFFFFF)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, h / 2), Offset(w, h / 2), midPaint);

    if (samples.isEmpty || w <= 1) return;

    // 选区背景
    final sx = selectionStart / duration * w;
    final ex = selectionEnd / duration * w;
    final selPaint = Paint()..color = selectionColor;
    canvas.drawRect(Rect.fromLTRB(sx, 0, ex, h), selPaint);

    // 聚合样本：按像素宽度求峰值，避免过密。
    final bars = w.toInt().clamp(1, 2000);
    final step = (samples.length / bars).floor().clamp(1, samples.length);
    final barW = w / bars;
    final wavePaint = Paint()
      ..color = color
      ..strokeWidth = barW > 2 ? barW - 1 : 1
      ..strokeCap = StrokeCap.round;

    double maxAbs = 1e-6;
    for (final s in samples) {
      final a = s.abs();
      if (a > maxAbs) maxAbs = a;
    }

    for (int i = 0; i < bars; i++) {
      int start = i * step;
      int end = (start + step).clamp(0, samples.length);
      if (start >= samples.length) break;
      double peak = 0;
      for (int k = start; k < end; k++) {
        final a = samples[k].abs();
        if (a > peak) peak = a;
      }
      peak /= maxAbs;
      final x = i * barW + barW / 2;
      final top = h / 2 - peak * (h / 2 - 4);
      final bottom = h / 2 + peak * (h / 2 - 4);
      canvas.drawLine(Offset(x, top), Offset(x, bottom), wavePaint);
    }

    // 选区手柄
    final handlePaint = Paint()
      ..color = const Color(0xFFFFB74D)
      ..style = PaintingStyle.fill;
    canvas.drawRect(
        Rect.fromCenter(center: Offset(sx, h / 2), width: 4, height: h),
        handlePaint);
    canvas.drawRect(
        Rect.fromCenter(center: Offset(ex, h / 2), width: 4, height: h),
        handlePaint);
  }

  @override
  bool shouldRepaint(covariant _WavePainter oldDelegate) {
    return oldDelegate.samples != samples ||
        oldDelegate.selectionStart != selectionStart ||
        oldDelegate.selectionEnd != selectionEnd ||
        oldDelegate.duration != duration;
  }
}
