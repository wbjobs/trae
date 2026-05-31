import 'package:flutter/material.dart';

import 'map_engine.dart';
import 'map_view.dart';

void main() {
  runApp(const OfflineMapApp());
}

class OfflineMapApp extends StatelessWidget {
  const OfflineMapApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '离线地图',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      home: const MapHomePage(),
    );
  }
}

class MapHomePage extends StatefulWidget {
  const MapHomePage({super.key});

  @override
  State<MapHomePage> createState() => _MapHomePageState();
}

class _MapHomePageState extends State<MapHomePage> {
  final MapEngine _engine = MapEngine();
  bool _showControls = true;

  double _zoom = 12.0;
  double _rotation = 0.0;
  double _tilt = 0.0;

  final _startLatController = TextEditingController(text: '39.9042');
  final _startLonController = TextEditingController(text: '116.4074');
  final _endLatController = TextEditingController(text: '39.9500');
  final _endLonController = TextEditingController(text: '116.4500');

  bool _isGpsActive = false;
  double _gpsSpeed = 10.0;

  bool _buildingsEnabled = true;
  double _ambientIntensity = 0.4;
  double _diffuseIntensity = 0.6;
  double _buildingHeightScale = 1.0;

  @override
  void initState() {
    super.initState();
    _zoom = _engine.zoom;
    _rotation = _engine.rotation;
    _tilt = _engine.tilt;
    _isGpsActive = _engine.isGpsActive;
  }

  void _updateView() {
    setState(() {
      _zoom = _engine.zoom;
      _rotation = _engine.rotation;
      _tilt = _engine.tilt;
      _isGpsActive = _engine.isGpsActive;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const MapView(),
          if (_showControls) _buildControlPanel(),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          setState(() {
            _showControls = !_showControls;
          });
        },
        child: Icon(_showControls ? Icons.hide_source : Icons.settings),
      ),
    );
  }

  Widget _buildControlPanel() {
    return Positioned(
      left: 16,
      top: 16,
      child: Container(
        width: 280,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface.withOpacity(0.95),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildSectionHeader('地图视图'),
              const SizedBox(height: 8),
              _buildZoomControl(),
              const SizedBox(height: 12),
              _buildRotationControl(),
              const SizedBox(height: 12),
              _buildTiltControl(),
              const SizedBox(height: 8),
              _buildResetButton(),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 16),
              _buildSectionHeader('GPS 模拟'),
              const SizedBox(height: 8),
              _buildGpsControl(),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 16),
              _buildSectionHeader('路径规划'),
              const SizedBox(height: 8),
              _buildRouteInput(),
              const SizedBox(height: 8),
              _buildRouteButtons(),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 16),
              _buildSectionHeader('地图数据'),
              const SizedBox(height: 8),
              _buildMBTilesButton(),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 16),
              _buildSectionHeader('3D 建筑'),
              const SizedBox(height: 8),
              _buildBuildingControl(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: Theme.of(context).colorScheme.primary,
      ),
    );
  }

  Widget _buildZoomControl() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('缩放级别'),
            Text(
              _zoom.toStringAsFixed(1),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        Slider(
          value: _zoom,
          min: _engine.minZoom,
          max: _engine.maxZoom,
          onChanged: (value) {
            setState(() {
              _zoom = value;
              _engine.setZoom(value);
            });
          },
        ),
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () {
                  _engine.zoomBy(-1.0);
                  _updateView();
                },
                icon: const Icon(Icons.zoom_out),
                label: const Text('缩小'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () {
                  _engine.zoomBy(1.0);
                  _updateView();
                },
                icon: const Icon(Icons.zoom_in),
                label: const Text('放大'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRotationControl() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('旋转角度'),
            Text(
              '${_rotation.toStringAsFixed(1)}°',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        Slider(
          value: _rotation,
          min: -180,
          max: 180,
          onChanged: (value) {
            setState(() {
              _rotation = value;
              _engine.setRotation(value);
            });
          },
        ),
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () {
                  _engine.rotateBy(-15);
                  _updateView();
                },
                icon: const Icon(Icons.rotate_left),
                label: const Text('-15°'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () {
                  _engine.rotateBy(15);
                  _updateView();
                },
                icon: const Icon(Icons.rotate_right),
                label: const Text('+15°'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTiltControl() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('倾斜角度'),
            Text(
              '${_tilt.toStringAsFixed(1)}°',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        Slider(
          value: _tilt,
          min: _engine.minTilt,
          max: _engine.maxTilt,
          onChanged: (value) {
            setState(() {
              _tilt = value;
              _engine.setTilt(value);
            });
          },
        ),
      ],
    );
  }

  Widget _buildResetButton() {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: () {
          _engine.resetView();
          _updateView();
        },
        icon: const Icon(Icons.refresh),
        label: const Text('重置视图'),
      ),
    );
  }

  Widget _buildGpsControl() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('模拟状态'),
            Switch(
              value: _isGpsActive,
              onChanged: (value) {
                if (value) {
                  _engine.startGpsSimulation();
                } else {
                  _engine.stopGpsSimulation();
                }
                setState(() {
                  _isGpsActive = value;
                });
              },
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Text('移动速度 (km/h)'),
        Slider(
          value: _gpsSpeed,
          min: 0,
          max: 120,
          onChanged: (value) {
            setState(() {
              _gpsSpeed = value;
              _engine.setGpsSpeed(value);
            });
          },
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () {
              _engine.setGpsPosition(
                39.9042,
                116.4074,
              );
            },
            icon: const Icon(Icons.my_location),
            label: const Text('设置为起点'),
          ),
        ),
      ],
    );
  }

  Widget _buildRouteInput() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _startLatController,
                decoration: const InputDecoration(
                  labelText: '起点纬度',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                keyboardType: TextInputType.number,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _startLonController,
                decoration: const InputDecoration(
                  labelText: '起点经度',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                keyboardType: TextInputType.number,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _endLatController,
                decoration: const InputDecoration(
                  labelText: '终点纬度',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                keyboardType: TextInputType.number,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _endLonController,
                decoration: const InputDecoration(
                  labelText: '终点经度',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                keyboardType: TextInputType.number,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildRouteButtons() {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () {
              final startLat = double.tryParse(_startLatController.text) ?? 0;
              final startLon = double.tryParse(_startLonController.text) ?? 0;
              final endLat = double.tryParse(_endLatController.text) ?? 0;
              final endLon = double.tryParse(_endLonController.text) ?? 0;

              final success = _engine.planRoute(
                startLat,
                startLon,
                endLat,
                endLon,
              );

              if (success) {
                _showRouteInfo();
              } else {
                _showError('路径规划失败');
              }
            },
            icon: const Icon(Icons.directions),
            label: const Text('规划路径'),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () {
              _engine.clearRoute();
              _showMessage('路径已清除');
            },
            icon: const Icon(Icons.clear),
            label: const Text('清除路径'),
          ),
        ),
      ],
    );
  }

  Widget _buildMBTilesButton() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _loadMBTiles,
            icon: const Icon(Icons.map),
            label: const Text('加载 MBTiles'),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey.shade100,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.grey.shade300),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '瓦片缓存状态',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(height: 8),
              _buildCacheInfoRow('缓存瓦片数', '${_engine.tileCacheSize}'),
              _buildCacheInfoRow('待加载数', '${_engine.pendingTileCount}'),
              _buildCacheInfoRow(
                '缩放稳定',
                _engine.isZoomStable ? '是' : '否',
                color: _engine.isZoomStable ? Colors.green : Colors.orange,
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            onPressed: () {
              _engine.clearTileCache();
              _showMessage('瓦片缓存已清空');
            },
            icon: const Icon(Icons.delete_sweep, size: 20),
            label: const Text('清空瓦片缓存'),
            style: TextButton.styleFrom(
              foregroundColor: Colors.red,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCacheInfoRow(String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: Colors.black54),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color ?? Colors.black87,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _loadMBTiles() async {
    _showMessage('请将 MBTiles 文件放置在应用目录');
  }

  void _showRouteInfo() {
    final distance = _engine.routeDistance;
    final duration = _engine.routeDuration;
    final pointCount = _engine.routePointCount;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '路径规划成功！\n距离: ${distance.toStringAsFixed(1)} 米\n预计时间: ${(duration / 60).toStringAsFixed(1)} 分钟\n路径点数: $pointCount',
        ),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 5),
      ),
    );
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Widget _buildBuildingControl() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('启用3D建筑'),
            Switch(
              value: _buildingsEnabled,
              onChanged: (value) {
                setState(() {
                  _buildingsEnabled = value;
                  _engine.setBuildingsEnabled(value);
                });
              },
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '建筑数量: ${_engine.buildingCount}',
          style: const TextStyle(fontSize: 12, color: Colors.black54),
        ),
        const SizedBox(height: 12),
        const Text('建筑高度缩放'),
        Slider(
          value: _buildingHeightScale,
          min: 0.5,
          max: 3.0,
          onChanged: (value) {
            setState(() {
              _buildingHeightScale = value;
              _engine.setBuildingHeightScale(value * 12.0);
            });
          },
        ),
        const SizedBox(height: 8),
        const Text('环境光强度'),
        Slider(
          value: _ambientIntensity,
          min: 0.0,
          max: 1.0,
          onChanged: (value) {
            setState(() {
              _ambientIntensity = value;
              _engine.setAmbientIntensity(value);
            });
          },
        ),
        const SizedBox(height: 8),
        const Text('漫反射强度'),
        Slider(
          value: _diffuseIntensity,
          min: 0.0,
          max: 1.0,
          onChanged: (value) {
            setState(() {
              _diffuseIntensity = value;
              _engine.setDiffuseIntensity(value);
            });
          },
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () {
                  _engine.addSampleBuildings();
                  _showMessage('已添加示例建筑');
                },
                icon: const Icon(Icons.add_location_alt),
                label: const Text('添加示例'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () {
                  _engine.clearBuildings();
                  _showMessage('已清除所有建筑');
                },
                icon: const Icon(Icons.delete),
                label: const Text('清除'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
