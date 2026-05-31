import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'dart:ui' as ui;

import 'map_engine.dart';

class MapView extends StatefulWidget {
  const MapView({super.key});

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView>
    with SingleTickerProviderStateMixin {
  final MapEngine _engine = MapEngine();
  late AnimationController _animationController;
  bool _isReady = false;

  Offset? _dragStart;
  double _initialScale = 1.0;
  double _currentScale = 1.0;
  Offset? _lastFocalPoint;

  Offset? _dragStartPosition;

  double _currentRotation = 0.0;
  double _initialRotation = 0.0;

  bool _isScaling = false;
  bool _isRotating = false;

  DateTime? _lastZoomTime;
  double _accumulatedZoomDelta = 0.0;
  static const int ZOOM_DEBOUNCE_MS = 16;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 16),
    )..addListener(_onAnimationTick);

    _initializeEngine();
  }

  Future<void> _initializeEngine() async {
    final success = _engine.initialize();
    if (success) {
      setState(() {
        _isReady = true;
      });
      _animationController.repeat();
    }
  }

  void _onAnimationTick() {
    _engine.updateSimulation();
    setState(() {});
  }

  @override
  void dispose() {
    _animationController.dispose();
    _engine.dispose();
    super.dispose();
  }

  void _onScaleStart(ScaleStartDetails details) {
    _lastFocalPoint = details.focalPoint;
  }

  Offset? _lastFocalPoint;

  void _onScaleUpdate(ScaleUpdateDetails details) {
    if (details.scale != 1.0) {
      _isScaling = true;
      final zoomDelta = (details.scale - 1.0) * 0.5;

      _accumulatedZoomDelta += zoomDelta;
      final now = DateTime.now();

      if (_lastZoomTime == null ||
          now.difference(_lastZoomTime!).inMilliseconds >= ZOOM_DEBOUNCE_MS) {
        if (_accumulatedZoomDelta.abs() > 0.01) {
          _engine.zoomBy(_accumulatedZoomDelta);
          _accumulatedZoomDelta = 0.0;
        }
        _lastZoomTime = now;
      }
    }

    if (details.rotation != 0.0) {
      _isRotating = true;
      _engine.rotateBy(details.rotation * 180 / 3.14159);
    }

    if (_lastFocalPoint != null && details.scale == 1.0) {
      final delta = details.focalPoint - _lastFocalPoint!;
      _engine.panBy(delta.dx * 0.001, delta.dy * 0.001);
    }

    _lastFocalPoint = details.focalPoint;
  }

  void _onScaleEnd(ScaleEndDetails details) {
    _isScaling = false;
    _isRotating = false;
    _lastFocalPoint = null;

    if (_accumulatedZoomDelta.abs() > 0.01) {
      _engine.zoomBy(_accumulatedZoomDelta);
      _accumulatedZoomDelta = 0.0;
    }
    _lastZoomTime = null;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onScaleStart: _onScaleStart,
      onScaleUpdate: _onScaleUpdate,
      onScaleEnd: _onScaleEnd,
      child: CustomPaint(
        painter: _MapPainter(_engine, _isReady),
        size: Size.infinite,
      ),
    );
  }
}

class _MapPainter extends CustomPainter {
  final MapEngine engine;
  final bool isReady;

  _MapPainter(this.engine, this.isReady);

  @override
  void paint(Canvas canvas, Size size) {
    if (!isReady) {
      final paint = Paint()..color = const Color(0xFFF0EDE8);
      canvas.drawRect(Offset.zero & size, paint);

      final textPainter = TextPainter(
        text: const TextSpan(
          text: '初始化地图引擎...',
          style: TextStyle(
            color: Colors.black54,
            fontSize: 18,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      textPainter.paint(
        canvas,
        Offset(
          (size.width - textPainter.width) / 2,
          (size.height - textPainter.height) / 2,
        ),
      );
      return;
    }

    engine.setViewportSize(size.width.toInt(), size.height.toInt());
    engine.renderFrame();

    _drawMapElements(canvas, size);
  }

  void _drawMapElements(Canvas canvas, Size size) {
    final centerLat = engine.mapCenterLatitude;
    final centerLon = engine.mapCenterLongitude;
    final zoom = engine.zoom;
    final rotation = engine.rotation;
    final tilt = engine.tilt;

    final bgPaint = Paint()..color = const Color(0xFFF0EDE8);
    canvas.drawRect(Offset.zero & size, bgPaint);

    final gridPaint = Paint()
      ..color = Colors.grey.withOpacity(0.2)
      ..strokeWidth = 1.0;

    final gridStep = _calculateGridStep(zoom);
    final center = Offset(size.width / 2, size.height / 2);

    for (int i = -10; i <= 10; i++) {
      final focal = center.dx + i * gridStep;
      canvas.drawLine(
        Offset(focal, 0),
        Offset(focal, size.height),
        gridPaint,
      );
      final focalY = center.dy + i * gridStep;
      canvas.drawLine(
        Offset(0, focalY),
        Offset(size.width, focalY),
        gridPaint,
      );
    }

    final routePointCount = engine.routePointCount;
    if (routePointCount > 1) {
      final routePaint = Paint()
        ..color = Colors.blue.withOpacity(0.7)
        ..strokeWidth = 4.0
        ..style = PaintingStyle.stroke;

      final path = Path();
      for (int i = 0; i < routePointCount; i++) {
        final lat = engine.getRoutePointLatitude(i);
        final lon = engine.getRoutePointLongitude(i);
        final focal = _geoToScreen(lat, lon, center, zoom, size);

        if (i == 0) {
          path.moveTo(focal.dx, focal.dy);
        } else {
          path.lineTo(focal.dx, focal.dy);
        }
      }
      canvas.drawPath(path, routePaint);

      if (routePointCount > 0) {
        final startLat = engine.getRoutePointLatitude(0);
        final startLon = engine.getRoutePointLongitude(0);
        final startFocal = _geoToScreen(startLat, startLon, center, zoom, size);
        final startPaint = Paint()..color = Colors.green;
        canvas.drawCircle(startFocal, 8, startPaint);

        final endLat = engine.getRoutePointLatitude(routePointCount - 1);
        final endLon = engine.getRoutePointLongitude(routePointCount - 1);
        final endFocal = _geoToScreen(endLat, endLon, center, zoom, size);
        final endPaint = Paint()..color = Colors.red;
        canvas.drawCircle(endFocal, 8, endPaint);
      }
    }

    final gpsLat = engine.gpsLatitude;
    final gpsLon = engine.gpsLongitude;
    final gpsFocal = _geoToScreen(gpsLat, gpsLon, center, zoom, size);

    final gpsAccuracyPaint = Paint()
      ..color = Colors.red.withOpacity(0.2)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(gpsFocal, 30, gpsAccuracyPaint);

    final gpsPaint = Paint()..color = Colors.red;
    canvas.drawCircle(gpsFocal, 12, gpsPaint);

    final gpsBorderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawCircle(gpsFocal, 12, gpsBorderPaint);

    final heading = engine.gpsHeading;
    final headingPaint = Paint()
      ..color = Colors.red
      ..strokeWidth = 3;

    final arrowLength = 25.0;
    final endX = gpsFocal.dx + arrowLength * (heading * 3.14159 / 180).sin();
    final endY = gpsFocal.dy - arrowLength * (heading * 3.14159 / 180).cos();

    canvas.drawLine(gpsFocal, Offset(endX, endY), headingPaint);

    if (engine.isBuildingsEnabled) {
      _drawBuildingInfo(canvas, size);
    }

    _drawInfoPanel(canvas, size, centerLat, centerLon, zoom, rotation, tilt);
  }

  void _drawBuildingInfo(Canvas canvas, Size size) {
    final buildingCount = engine.buildingCount;
    if (buildingCount == 0) return;

    final infoText = TextSpan(
      style: const TextStyle(
        color: Colors.black54,
        fontSize: 11,
        fontFamily: 'monospace',
      ),
      children: [
        TextSpan(
          text: '3D建筑: $buildingCount 栋',
        ),
      ],
    );

    final textPainter = TextPainter(
      text: infoText,
      textDirection: TextDirection.ltr,
    )..layout();

    textPainter.paint(
      canvas,
      Offset(16, size.height - 30),
    );
  }

  double _calculateGridStep(double zoom) {
    final baseStep = 100.0;
    final scale = pow(2.0, 11.0 - zoom);
    return baseStep * scale;
  }

  Offset _geoToScreen(
    double lat,
    double lon,
    Offset center,
    double zoom,
    Size size,
  ) {
    final centerLat = engine.mapCenterLatitude;
    final centerLon = engine.mapCenterLongitude;

    final scale = pow(2.0, zoom - 11.0) * 256.0;

    final dx = (lon - centerLon) * scale * 0.01;
    final dy = -(lat - centerLat) * scale * 0.01;

    return Offset(center.dx + dx, center.dy + dy);
  }

  void _drawInfoPanel(
    Canvas canvas,
    Size size,
    double lat,
    double lon,
    double zoom,
    double rotation,
    double tilt,
  ) {
    final panelWidth = 200.0;
    final panelHeight = 110.0;
    final panelRect = Rect.fromLTWH(
      size.width - panelWidth - 16,
      16,
      panelWidth,
      panelHeight,
    );

    final panelPaint = Paint()
      ..color = Colors.white.withOpacity(0.9)
      ..style = PaintingStyle.fill;
    canvas.drawRect(panelRect, panelPaint);

    final borderPaint = Paint()
      ..color = Colors.grey.shade300
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawRect(panelRect, borderPaint);

    final infoText = TextSpan(
      style: const TextStyle(
        color: Colors.black87,
        fontSize: 12,
        fontFamily: 'monospace',
      ),
      children: [
        TextSpan(
          text:
              '纬度: ${lat.toStringAsFixed(6)}\n经度: ${lon.toStringAsFixed(6)}\n缩放: ${zoom.toStringAsFixed(2)}\n旋转: ${rotation.toStringAsFixed(1)}°\n倾斜: ${tilt.toStringAsFixed(1)}°',
        ),
      ],
    );

    final textPainter = TextPainter(
      text: infoText,
      textDirection: TextDirection.ltr,
    )..layout();

    textPainter.paint(
      canvas,
      Offset(panelRect.left + 12, panelRect.top + 12),
    );
  }

  double pow(double base, double exponent) {
    return base.pow(exponent);
  }

  @override
  bool shouldRepaint(covariant _MapPainter oldDelegate) => true;
}
