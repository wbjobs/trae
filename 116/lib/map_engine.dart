import 'dart:ffi';
import 'dart:io' show Platform;

import 'package:ffi/ffi.dart';

typedef InitEngineNative = Bool Function();
typedef InitEngineDart = bool Function();

typedef DestroyEngineNative = Void Function();
typedef DestroyEngineDart = void Function();

typedef LoadMBTilesNative = Bool Function(Pointer<Utf8> path);
typedef LoadMBTilesDart = bool Function(Pointer<Utf8> path);

typedef SetViewportSizeNative = Void Function(Uint32 width, Uint32 height);
typedef SetViewportSizeDart = void Function(int width, int height);

typedef RenderFrameNative = Void Function();
typedef RenderFrameDart = void Function();

typedef UpdateSimulationNative = Void Function();
typedef UpdateSimulationDart = void Function();

typedef SetMapCenterNative = Void Function(Double latitude, Double longitude);
typedef SetMapCenterDart = void Function(double latitude, double longitude);

typedef GetDoubleNative = Double Function();
typedef GetDoubleDart = double Function();

typedef GetFloatNative = Float Function();
typedef GetFloatDart = double Function();

typedef SetFloatNative = Void Function(Float value);
typedef SetFloatDart = void Function(double value);

typedef SetBoolNative = Void Function(Bool value);
typedef SetBoolDart = void Function(bool value);

typedef SetLightDirectionNative = Void Function(Float x, Float y, Float z);
typedef SetLightDirectionDart = void Function(double x, double y, double z);

typedef SetZoomNative = Void Function(Float zoom);
typedef SetZoomDart = void Function(double zoom);

typedef SetRotationNative = Void Function(Float rotation);
typedef SetRotationDart = void Function(double rotation);

typedef SetTiltNative = Void Function(Float tilt);
typedef SetTiltDart = void Function(double tilt);

typedef ZoomByNative = Void Function(Float delta);
typedef ZoomByDart = void Function(double delta);

typedef RotateByNative = Void Function(Float delta);
typedef RotateByDart = void Function(double delta);

typedef TiltByNative = Void Function(Float delta);
typedef TiltByDart = void Function(double delta);

typedef PanByNative = Void Function(Double dx, Double dy);
typedef PanByDart = void Function(double dx, double dy);

typedef ResetViewNative = Void Function();
typedef ResetViewDart = void Function();

typedef SetGpsPositionNative = Void Function(Double latitude, Double longitude);
typedef SetGpsPositionDart = void Function(double latitude, double longitude);

typedef GetBoolNative = Bool Function();
typedef GetBoolDart = bool Function();

typedef PlanRouteNative = Bool Function(
    Double startLat, Double startLon, Double endLat, Double endLon);
typedef PlanRouteDart = bool Function(
    double startLat, double startLon, double endLat, double endLon);

typedef ClearRouteNative = Void Function();
typedef ClearRouteDart = void Function();

typedef GetUint32Native = Uint32 Function();
typedef GetUint32Dart = int Function();

typedef ScreenToGeoNative = Double Function(Float screenX, Float screenY);
typedef ScreenToGeoDart = double Function(double screenX, double screenY);

class MapEngine {
  DynamicLibrary? _nativeLib;
  bool _isInitialized = false;

  late final InitEngineDart _initEngine;
  late final DestroyEngineDart _destroyEngine;
  late final LoadMBTilesDart _loadMBTiles;
  late final SetViewportSizeDart _setViewportSize;
  late final RenderFrameDart _renderFrame;
  late final UpdateSimulationDart _updateSimulation;
  late final SetMapCenterDart _setMapCenter;
  late final GetDoubleDart _getMapCenterLatitude;
  late final GetDoubleDart _getMapCenterLongitude;
  late final SetZoomDart _setZoom;
  late final GetFloatDart _getZoom;
  late final ZoomByDart _zoomBy;
  late final SetRotationDart _setRotation;
  late final GetFloatDart _getRotation;
  late final RotateByDart _rotateBy;
  late final SetTiltDart _setTilt;
  late final GetFloatDart _getTilt;
  late final TiltByDart _tiltBy;
  late final PanByDart _panBy;
  late final ResetViewDart _resetView;
  late final SetGpsPositionDart _setGpsPosition;
  late final GetDoubleDart _getGpsLatitude;
  late final GetDoubleDart _getGpsLongitude;
  late final GetFloatDart _getGpsHeading;
  late final GetFloatDart _getGpsSpeed;
  late final SetFloatDart _setGpsSpeed;
  late final ResetViewDart _startGpsSimulation;
  late final ResetViewDart _stopGpsSimulation;
  late final GetBoolDart _isGpsActive;
  late final PlanRouteDart _planRoute;
  late final GetDoubleDart _getRouteDistance;
  late final GetDoubleDart _getRouteDuration;
  late final ClearRouteDart _clearRoute;
  late final GetUint32Dart _getRoutePointCount;
  late final GetDoubleDart _getRoutePointLatitude;
  late final GetDoubleDart _getRoutePointLongitude;
  late final ScreenToGeoDart _screenToGeoLatitude;
  late final ScreenToGeoDart _screenToGeoLongitude;
  late final GetFloatDart _getMinZoom;
  late final GetFloatDart _getMaxZoom;
  late final GetFloatDart _getMinTilt;
  late final GetFloatDart _getMaxTilt;
  late final GetUint32Dart _getTileCacheSize;
  late final GetUint32Dart _getPendingTileCount;
  late final GetBoolDart _isZoomStable;
  late final ResetViewDart _clearTileCache;
  late final SetBoolNative _setBuildingsEnabled;
  late final GetBoolDart _isBuildingsEnabled;
  late final GetUint32Dart _getBuildingCount;
  late final SetFloatNative _setBuildingHeightScale;
  late final SetLightDirectionNative _setLightDirection;
  late final SetFloatNative _setAmbientIntensity;
  late final SetFloatNative _setDiffuseIntensity;
  late final ResetViewDart _addSampleBuildings;
  late final ResetViewDart _clearBuildings;

  bool get isInitialized => _isInitialized;

  static final MapEngine _instance = MapEngine._internal();

  factory MapEngine() => _instance;

  MapEngine._internal();

  bool initialize() {
    if (_isInitialized) return true;

    _nativeLib = _loadNativeLib();
    if (_nativeLib == null) {
      return false;
    }

    _initEngine =
        _nativeLib!.lookupFunction<InitEngineNative, InitEngineDart>('init_engine');
    _destroyEngine =
        _nativeLib!.lookupFunction<DestroyEngineNative, DestroyEngineDart>('destroy_engine');
    _loadMBTiles =
        _nativeLib!.lookupFunction<LoadMBTilesNative, LoadMBTilesDart>('load_mbtiles');
    _setViewportSize =
        _nativeLib!.lookupFunction<SetViewportSizeNative, SetViewportSizeDart>('set_viewport_size');
    _renderFrame =
        _nativeLib!.lookupFunction<RenderFrameNative, RenderFrameDart>('render_frame');
    _updateSimulation =
        _nativeLib!.lookupFunction<UpdateSimulationNative, UpdateSimulationDart>('update_simulation');
    _setMapCenter =
        _nativeLib!.lookupFunction<SetMapCenterNative, SetMapCenterDart>('set_map_center');
    _getMapCenterLatitude =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_map_center_latitude');
    _getMapCenterLongitude =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_map_center_longitude');
    _setZoom =
        _nativeLib!.lookupFunction<SetZoomNative, SetZoomDart>('set_zoom');
    _getZoom =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_zoom');
    _zoomBy =
        _nativeLib!.lookupFunction<ZoomByNative, ZoomByDart>('zoom_by');
    _setRotation =
        _nativeLib!.lookupFunction<SetRotationNative, SetRotationDart>('set_rotation');
    _getRotation =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_rotation');
    _rotateBy =
        _nativeLib!.lookupFunction<RotateByNative, RotateByDart>('rotate_by');
    _setTilt =
        _nativeLib!.lookupFunction<SetTiltNative, SetTiltDart>('set_tilt');
    _getTilt =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_tilt');
    _tiltBy =
        _nativeLib!.lookupFunction<TiltByNative, TiltByDart>('tilt_by');
    _panBy =
        _nativeLib!.lookupFunction<PanByNative, PanByDart>('pan_by');
    _resetView =
        _nativeLib!.lookupFunction<ResetViewNative, ResetViewDart>('reset_view');
    _setGpsPosition =
        _nativeLib!.lookupFunction<SetGpsPositionNative, SetGpsPositionDart>('set_gps_position');
    _getGpsLatitude =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_gps_latitude');
    _getGpsLongitude =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_gps_longitude');
    _getGpsHeading =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_gps_heading');
    _getGpsSpeed =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_gps_speed');
    _setGpsSpeed =
        _nativeLib!.lookupFunction<SetFloatNative, SetFloatDart>('set_gps_speed');
    _startGpsSimulation =
        _nativeLib!.lookupFunction<ResetViewNative, ResetViewDart>('start_gps_simulation');
    _stopGpsSimulation =
        _nativeLib!.lookupFunction<ResetViewNative, ResetViewDart>('stop_gps_simulation');
    _isGpsActive =
        _nativeLib!.lookupFunction<GetBoolNative, GetBoolDart>('is_gps_active');
    _planRoute =
        _nativeLib!.lookupFunction<PlanRouteNative, PlanRouteDart>('plan_route');
    _getRouteDistance =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_route_distance');
    _getRouteDuration =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_route_duration');
    _clearRoute =
        _nativeLib!.lookupFunction<ClearRouteNative, ClearRouteDart>('clear_route');
    _getRoutePointCount =
        _nativeLib!.lookupFunction<GetUint32Native, GetUint32Dart>('get_route_point_count');
    _getRoutePointLatitude =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_route_point_latitude');
    _getRoutePointLongitude =
        _nativeLib!.lookupFunction<GetDoubleNative, GetDoubleDart>('get_route_point_longitude');
    _screenToGeoLatitude =
        _nativeLib!.lookupFunction<ScreenToGeoNative, ScreenToGeoDart>('screen_to_geo_latitude');
    _screenToGeoLongitude =
        _nativeLib!.lookupFunction<ScreenToGeoNative, ScreenToGeoDart>('screen_to_geo_longitude');
    _getMinZoom =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_min_zoom');
    _getMaxZoom =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_max_zoom');
    _getMinTilt =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_min_tilt');
    _getMaxTilt =
        _nativeLib!.lookupFunction<GetFloatNative, GetFloatDart>('get_max_tilt');
    _getTileCacheSize =
        _nativeLib!.lookupFunction<GetUint32Native, GetUint32Dart>('get_tile_cache_size');
    _getPendingTileCount =
        _nativeLib!.lookupFunction<GetUint32Native, GetUint32Dart>('get_pending_tile_count');
    _isZoomStable =
        _nativeLib!.lookupFunction<GetBoolNative, GetBoolDart>('is_zoom_stable');
    _clearTileCache =
        _nativeLib!.lookupFunction<ResetViewNative, ResetViewDart>('clear_tile_cache');
    _setBuildingsEnabled =
        _nativeLib!.lookupFunction<SetBoolNative, SetBoolDart>('set_buildings_enabled');
    _isBuildingsEnabled =
        _nativeLib!.lookupFunction<GetBoolNative, GetBoolDart>('is_buildings_enabled');
    _getBuildingCount =
        _nativeLib!.lookupFunction<GetUint32Native, GetUint32Dart>('get_building_count');
    _setBuildingHeightScale =
        _nativeLib!.lookupFunction<SetFloatNative, SetFloatDart>('set_building_height_scale');
    _setLightDirection =
        _nativeLib!.lookupFunction<SetLightDirectionNative, SetLightDirectionDart>('set_light_direction');
    _setAmbientIntensity =
        _nativeLib!.lookupFunction<SetFloatNative, SetFloatDart>('set_ambient_intensity');
    _setDiffuseIntensity =
        _nativeLib!.lookupFunction<SetFloatNative, SetFloatDart>('set_diffuse_intensity');
    _addSampleBuildings =
        _nativeLib!.lookupFunction<ResetViewNative, ResetViewDart>('add_sample_buildings');
    _clearBuildings =
        _nativeLib!.lookupFunction<ResetViewNative, ResetViewDart>('clear_buildings');

    _isInitialized = _initEngine();
    return _isInitialized;
  }

  DynamicLibrary? _loadNativeLib() {
    if (Platform.isWindows) {
      return DynamicLibrary.open('offline_map_engine.dll');
    } else if (Platform.isLinux) {
      return DynamicLibrary.open('liboffline_map_engine.so');
    } else if (Platform.isMacOS) {
      return DynamicLibrary.open('liboffline_map_engine.dylib');
    }
    return null;
  }

  void dispose() {
    if (_isInitialized) {
      _destroyEngine();
      _isInitialized = false;
    }
  }

  bool loadMBTiles(String path) {
    if (!_isInitialized) return false;
    final pathPtr = path.toNativeUtf8();
    final result = _loadMBTiles(pathPtr);
    calloc.free(pathPtr);
    return result;
  }

  void setViewportSize(int width, int height) {
    if (!_isInitialized) return;
    _setViewportSize(width, height);
  }

  void renderFrame() {
    if (!_isInitialized) return;
    _renderFrame();
  }

  void updateSimulation() {
    if (!_isInitialized) return;
    _updateSimulation();
  }

  void setMapCenter(double latitude, double longitude) {
    if (!_isInitialized) return;
    _setMapCenter(latitude, longitude);
  }

  double get mapCenterLatitude => _isInitialized ? _getMapCenterLatitude() : 0.0;
  double get mapCenterLongitude => _isInitialized ? _getMapCenterLongitude() : 0.0;

  void setZoom(double zoom) {
    if (!_isInitialized) return;
    _setZoom(zoom);
  }

  double get zoom => _isInitialized ? _getZoom() : 0.0;

  void zoomBy(double delta) {
    if (!_isInitialized) return;
    _zoomBy(delta);
  }

  void setRotation(double rotation) {
    if (!_isInitialized) return;
    _setRotation(rotation);
  }

  double get rotation => _isInitialized ? _getRotation() : 0.0;

  void rotateBy(double delta) {
    if (!_isInitialized) return;
    _rotateBy(delta);
  }

  void setTilt(double tilt) {
    if (!_isInitialized) return;
    _setTilt(tilt);
  }

  double get tilt => _isInitialized ? _getTilt() : 0.0;

  void tiltBy(double delta) {
    if (!_isInitialized) return;
    _tiltBy(delta);
  }

  void panBy(double dx, double dy) {
    if (!_isInitialized) return;
    _panBy(dx, dy);
  }

  void resetView() {
    if (!_isInitialized) return;
    _resetView();
  }

  void setGpsPosition(double latitude, double longitude) {
    if (!_isInitialized) return;
    _setGpsPosition(latitude, longitude);
  }

  double get gpsLatitude => _isInitialized ? _getGpsLatitude() : 0.0;
  double get gpsLongitude => _isInitialized ? _getGpsLongitude() : 0.0;
  double get gpsHeading => _isInitialized ? _getGpsHeading() : 0.0;
  double get gpsSpeed => _isInitialized ? _getGpsSpeed() : 0.0;

  void setGpsSpeed(double speed) {
    if (!_isInitialized) return;
    _setGpsSpeed(speed);
  }

  void startGpsSimulation() {
    if (!_isInitialized) return;
    _startGpsSimulation();
  }

  void stopGpsSimulation() {
    if (!_isInitialized) return;
    _stopGpsSimulation();
  }

  bool get isGpsActive => _isInitialized ? _isGpsActive() : false;

  bool planRoute(double startLat, double startLon, double endLat, double endLon) {
    if (!_isInitialized) return false;
    return _planRoute(startLat, startLon, endLat, endLon);
  }

  double get routeDistance => _isInitialized ? _getRouteDistance() : 0.0;
  double get routeDuration => _isInitialized ? _getRouteDuration() : 0.0;

  void clearRoute() {
    if (!_isInitialized) return;
    _clearRoute();
  }

  int get routePointCount => _isInitialized ? _getRoutePointCount() : 0;

  double getRoutePointLatitude(int index) =>
      _isInitialized ? _getRoutePointLatitude(index) : 0.0;

  double getRoutePointLongitude(int index) =>
      _isInitialized ? _getRoutePointLongitude(index) : 0.0;

  double screenToGeoLatitude(double screenX, double screenY) =>
      _isInitialized ? _screenToGeoLatitude(screenX, screenY) : 0.0;

  double screenToGeoLongitude(double screenX, double screenY) =>
      _isInitialized ? _screenToGeoLongitude(screenX, screenY) : 0.0;

  double get minZoom => _isInitialized ? _getMinZoom() : 3.0;
  double get maxZoom => _isInitialized ? _getMaxZoom() : 18.0;
  double get minTilt => _isInitialized ? _getMinTilt() : 0.0;
  double get maxTilt => _isInitialized ? _getMaxTilt() : 60.0;

  int get tileCacheSize => _isInitialized ? _getTileCacheSize() : 0;

  int get pendingTileCount => _isInitialized ? _getPendingTileCount() : 0;

  bool get isZoomStable => _isInitialized ? _isZoomStable() : true;

  void clearTileCache() {
    if (!_isInitialized) return;
    _clearTileCache();
  }

  void setBuildingsEnabled(bool enabled) {
    if (!_isInitialized) return;
    _setBuildingsEnabled(enabled);
  }

  bool get isBuildingsEnabled => _isInitialized ? _isBuildingsEnabled() : true;

  int get buildingCount => _isInitialized ? _getBuildingCount() : 0;

  void setBuildingHeightScale(double scale) {
    if (!_isInitialized) return;
    _setBuildingHeightScale(scale);
  }

  void setLightDirection(double x, double y, double z) {
    if (!_isInitialized) return;
    _setLightDirection(x, y, z);
  }

  void setAmbientIntensity(double intensity) {
    if (!_isInitialized) return;
    _setAmbientIntensity(intensity);
  }

  void setDiffuseIntensity(double intensity) {
    if (!_isInitialized) return;
    _setDiffuseIntensity(intensity);
  }

  void addSampleBuildings() {
    if (!_isInitialized) return;
    _addSampleBuildings();
  }

  void clearBuildings() {
    if (!_isInitialized) return;
    _clearBuildings();
  }
}
