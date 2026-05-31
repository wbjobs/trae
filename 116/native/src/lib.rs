use std::sync::Mutex;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;

use serde::{Deserialize, Serialize};

pub mod types;
pub mod mbtiles;
pub mod renderer;
pub mod map;
pub mod gps;
pub mod routing;
pub mod tile_cache;
pub mod buildings;

use crate::types::*;
use crate::mbtiles::MBTilesReader;
use crate::renderer::Renderer;
use crate::map::MapController;
use crate::gps::GpsSimulator;
use crate::routing::RoutingEngine;
use crate::tile_cache::TileCache;
use crate::buildings::BuildingGenerator;

struct MapEngine {
    renderer: Renderer,
    map_controller: MapController,
    gps_simulator: GpsSimulator,
    routing_engine: RoutingEngine,
    mbtiles_reader: Option<MBTilesReader>,
    current_route: Option<Route>,
    tile_cache: TileCache,
    building_generator: BuildingGenerator,
    buildings_dirty: bool,
    last_zoom: f32,
    zoom_stable_time: std::time::Instant,
    is_initialized: bool,
    screen_width: u32,
    screen_height: u32,
}

impl MapEngine {
    fn new() -> Self {
        let mut routing_engine = RoutingEngine::new();
        routing_engine.load_sample_network();

        let mut building_generator = BuildingGenerator::new();
        let sample_buildings = buildings::create_sample_buildings();
        building_generator.add_buildings(sample_buildings);

        Self {
            renderer: Renderer::new(),
            map_controller: MapController::new(),
            gps_simulator: GpsSimulator::new(),
            routing_engine,
            mbtiles_reader: None,
            current_route: None,
            tile_cache: TileCache::new(),
            building_generator,
            buildings_dirty: true,
            last_zoom: 11.0,
            zoom_stable_time: std::time::Instant::now(),
            is_initialized: false,
            screen_width: 800,
            screen_height: 600,
        }
    }
}

lazy_static::lazy_static! {
    static ref MAP_ENGINE: Mutex<MapEngine> = Mutex::new(MapEngine::new());
}

#[no_mangle]
pub extern "C" fn init_engine() -> bool {
    let mut engine = MAP_ENGINE.lock().unwrap();
    match engine.renderer.init() {
        Ok(()) => {
            engine.is_initialized = true;
            log::info!("Map engine initialized successfully");
            true
        }
        Err(e) => {
            log::error!("Failed to initialize renderer: {}", e);
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn destroy_engine() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.renderer.cleanup();
    engine.is_initialized = false;
    log::info!("Map engine destroyed");
}

#[no_mangle]
pub extern "C" fn load_mbtiles(path: *const c_char) -> bool {
    if path.is_null() {
        return false;
    }

    let c_str = unsafe { CStr::from_ptr(path) };
    let path_str = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return false,
    };

    let mut engine = MAP_ENGINE.lock().unwrap();
    match MBTilesReader::open(path_str) {
        Ok(reader) => {
            engine.mbtiles_reader = Some(reader);
            log::info!("MBTiles file loaded: {}", path_str);
            true
        }
        Err(e) => {
            log::error!("Failed to load MBTiles: {}", e);
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn set_viewport_size(width: u32, height: u32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.screen_width = width;
    engine.screen_height = height;
}

#[no_mangle]
pub extern "C" fn render_frame() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    if !engine.is_initialized {
        return;
    }

    let current_zoom = engine.map_controller.get_zoom();

    if (current_zoom - engine.last_zoom).abs() > 0.01 {
        engine.last_zoom = current_zoom;
        engine.zoom_stable_time = std::time::Instant::now();
        engine.tile_cache.set_target_zoom(current_zoom);
        engine.tile_cache.cancel_outdated_requests(current_zoom);
    }

    let zoom_is_stable = engine.zoom_stable_time.elapsed().as_millis() > 100;

    let view_state = MapViewState {
        viewport: *engine.map_controller.get_viewport(),
        width: engine.screen_width,
        height: engine.screen_height,
    };

    let viewport = engine.map_controller.get_viewport();

    engine.tile_cache.set_current_zoom(current_zoom);

    if zoom_is_stable {
        engine.tile_cache.get_visible_tiles(
            viewport,
            engine.screen_width,
            engine.screen_height,
        );
    }

    let render_zoom = if zoom_is_stable {
        current_zoom.round() as u8
    } else {
        current_zoom.round() as u8
    };

    let (mut vertices, mut indices) =
        renderer::create_grid_vertices(engine.map_controller.get_viewport());

    if let Some(reader) = &engine.mbtiles_reader {
        let tiles = engine.tile_cache.get_renderable_tiles(viewport);
        for tile_data in tiles {
            if tile_data.zoom == render_zoom || (zoom_is_stable && (tile_data.zoom as f32 - current_zoom).abs() < 1.0) {
                let idx_offset = vertices.len() as u32;
                for &idx in &tile_data.indices {
                    indices.push(idx + idx_offset);
                }
                vertices.extend(&tile_data.vertices);
            }
        }

        if zoom_is_stable {
            let pending = engine.tile_cache.get_next_pending(4);
            for key in pending {
                if let Ok(tile) = reader.get_tile_vertices(key.zoom, key.x, key.y) {
                    engine.tile_cache.insert(tile);
                    engine.tile_cache.remove_pending(key);
                } else {
                    let default_tiles = tile_cache::create_default_grid_tiles(key.zoom, key.x, key.y);
                    for tile in default_tiles {
                        engine.tile_cache.insert(tile);
                    }
                    engine.tile_cache.remove_pending(key);
                }
            }
        }
    } else {
        let default_tiles = tile_cache::create_default_grid_tiles(
            render_zoom,
            (viewport.center.longitude + 180.0) as u32 % 256,
            (viewport.center.latitude + 90.0) as u32 % 256,
        );
        for tile in default_tiles {
            let idx_offset = vertices.len() as u32;
            for &idx in &tile.indices {
                indices.push(idx + idx_offset);
            }
            vertices.extend(&tile.vertices);
        }
    }

    if let Some(route) = &engine.current_route {
        let route_coords: Vec<GeoCoordinate> =
            route.points.iter().map(|p| p.coordinate).collect();
        let (route_vertices, route_indices) =
            renderer::create_route_vertices(&route_coords, Color::ROUTE);

        let idx_offset = vertices.len() as u32;
        for idx in route_indices {
            indices.push(idx + idx_offset);
        }
        vertices.extend(route_vertices);
    }

    let gps_state = engine.gps_simulator.get_state();
    let (gps_vertices, gps_indices) =
        renderer::create_gps_marker_vertices(gps_state.coordinate, Color::GPS_MARKER);

    let gps_idx_offset = vertices.len() as u32;
    for idx in gps_indices {
        indices.push(idx + gps_idx_offset);
    }
    vertices.extend(gps_vertices);

    engine.renderer.update_2d_data(&vertices, &indices);

    if engine.buildings_dirty || zoom_is_stable {
        let visible_buildings = engine.building_generator.get_visible_buildings(
            viewport,
            engine.screen_width,
            engine.screen_height,
        );

        let mut building_vertices = Vec::new();
        let mut building_indices = Vec::new();

        for building in visible_buildings {
            let mesh = engine.building_generator.generate_mesh(building);
            let idx_offset = building_vertices.len() as u32;

            for idx in &mesh.indices {
                building_indices.push(idx + idx_offset);
            }
            building_vertices.extend(mesh.vertices);
        }

        engine.renderer.update_3d_data(&building_vertices, &building_indices);
        engine.buildings_dirty = false;
    }

    engine.renderer.render(view_state);
}

#[no_mangle]
pub extern "C" fn update_simulation() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.update();
}

#[no_mangle]
pub extern "C" fn set_map_center(latitude: f64, longitude: f64) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine
        .map_controller
        .set_center(GeoCoordinate::new(latitude, longitude));
}

#[no_mangle]
pub extern "C" fn get_map_center_latitude() -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.get_center().latitude
}

#[no_mangle]
pub extern "C" fn get_map_center_longitude() -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.get_center().longitude
}

#[no_mangle]
pub extern "C" fn set_zoom(zoom: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.set_zoom(zoom);
}

#[no_mangle]
pub extern "C" fn get_zoom() -> f32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.get_zoom()
}

#[no_mangle]
pub extern "C" fn zoom_by(delta: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.zoom_by(delta);
}

#[no_mangle]
pub extern "C" fn set_rotation(rotation: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.set_rotation(rotation);
}

#[no_mangle]
pub extern "C" fn get_rotation() -> f32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.get_rotation()
}

#[no_mangle]
pub extern "C" fn rotate_by(delta: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.rotate_by(delta);
}

#[no_mangle]
pub extern "C" fn set_tilt(tilt: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.set_tilt(tilt);
}

#[no_mangle]
pub extern "C" fn get_tilt() -> f32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.get_tilt()
}

#[no_mangle]
pub extern "C" fn tilt_by(delta: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.tilt_by(delta);
}

#[no_mangle]
pub extern "C" fn pan_by(dx: f64, dy: f64) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.pan_by(dx, dy);
}

#[no_mangle]
pub extern "C" fn reset_view() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.map_controller.reset();
}

#[no_mangle]
pub extern "C" fn set_gps_position(latitude: f64, longitude: f64) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine
        .gps_simulator
        .set_position(GeoCoordinate::new(latitude, longitude));
}

#[no_mangle]
pub extern "C" fn get_gps_latitude() -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.get_state().coordinate.latitude
}

#[no_mangle]
pub extern "C" fn get_gps_longitude() -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.get_state().coordinate.longitude
}

#[no_mangle]
pub extern "C" fn get_gps_heading() -> f32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.get_state().heading
}

#[no_mangle]
pub extern "C" fn get_gps_speed() -> f32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.get_state().speed
}

#[no_mangle]
pub extern "C" fn set_gps_speed(speed: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.set_speed(speed);
}

#[no_mangle]
pub extern "C" fn start_gps_simulation() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.start();
}

#[no_mangle]
pub extern "C" fn stop_gps_simulation() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.stop();
}

#[no_mangle]
pub extern "C" fn is_gps_active() -> bool {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.gps_simulator.is_active()
}

#[no_mangle]
pub extern "C" fn plan_route(start_lat: f64, start_lon: f64, end_lat: f64, end_lon: f64) -> bool {
    let mut engine = MAP_ENGINE.lock().unwrap();
    let start = GeoCoordinate::new(start_lat, start_lon);
    let end = GeoCoordinate::new(end_lat, end_lon);

    match engine.routing_engine.find_route(start, end) {
        Some(route) => {
            let route_copy = route.clone();
            engine.current_route = Some(route);
            engine.gps_simulator.follow_route(&route_copy);
            log::info!(
                "Route planned: distance={:.2}m, duration={:.2}s",
                route_copy.distance,
                route_copy.duration
            );
            true
        }
        None => {
            log::warn!("Failed to plan route");
            false
        }
    }
}

#[no_mangle]
pub extern "C" fn get_route_distance() -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine
        .current_route
        .as_ref()
        .map(|r| r.distance)
        .unwrap_or(0.0)
}

#[no_mangle]
pub extern "C" fn get_route_duration() -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine
        .current_route
        .as_ref()
        .map(|r| r.duration)
        .unwrap_or(0.0)
}

#[no_mangle]
pub extern "C" fn clear_route() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.current_route = None;
    engine.gps_simulator.stop();
    log::info!("Route cleared");
}

#[no_mangle]
pub extern "C" fn get_route_point_count() -> u32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine
        .current_route
        .as_ref()
        .map(|r| r.points.len() as u32)
        .unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_route_point_latitude(index: u32) -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine
        .current_route
        .as_ref()
        .and_then(|r| r.points.get(index as usize))
        .map(|p| p.coordinate.latitude)
        .unwrap_or(0.0)
}

#[no_mangle]
pub extern "C" fn get_route_point_longitude(index: u32) -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine
        .current_route
        .as_ref()
        .and_then(|r| r.points.get(index as usize))
        .map(|p| p.coordinate.longitude)
        .unwrap_or(0.0)
}

#[no_mangle]
pub extern "C" fn screen_to_geo_latitude(screen_x: f32, screen_y: f32) -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    let coord = engine.map_controller.screen_to_geo(
        screen_x,
        screen_y,
        engine.screen_width as f32,
        engine.screen_height as f32,
    );
    coord.latitude
}

#[no_mangle]
pub extern "C" fn screen_to_geo_longitude(screen_x: f32, screen_y: f32) -> f64 {
    let engine = MAP_ENGINE.lock().unwrap();
    let coord = engine.map_controller.screen_to_geo(
        screen_x,
        screen_y,
        engine.screen_width as f32,
        engine.screen_height as f32,
    );
    coord.longitude
}

#[no_mangle]
pub extern "C" fn get_min_zoom() -> f32 {
    MIN_ZOOM
}

#[no_mangle]
pub extern "C" fn get_max_zoom() -> f32 {
    MAX_ZOOM
}

#[no_mangle]
pub extern "C" fn get_min_tilt() -> f32 {
    MIN_TILT
}

#[no_mangle]
pub extern "C" fn get_max_tilt() -> f32 {
    MAX_TILT
}

#[no_mangle]
pub extern "C" fn get_tile_cache_size() -> u32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.tile_cache.cache_size() as u32
}

#[no_mangle]
pub extern "C" fn get_pending_tile_count() -> u32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.tile_cache.pending_count() as u32
}

#[no_mangle]
pub extern "C" fn is_zoom_stable() -> bool {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.tile_cache.is_zoom_stable()
}

#[no_mangle]
pub extern "C" fn clear_tile_cache() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.tile_cache.clear();
    log::info!("Tile cache cleared");
}

#[no_mangle]
pub extern "C" fn set_buildings_enabled(enabled: bool) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.renderer.set_buildings_enabled(enabled);
    engine.buildings_dirty = true;
    log::info!("Buildings enabled: {}", enabled);
}

#[no_mangle]
pub extern "C" fn is_buildings_enabled() -> bool {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.renderer.is_buildings_enabled()
}

#[no_mangle]
pub extern "C" fn get_building_count() -> u32 {
    let engine = MAP_ENGINE.lock().unwrap();
    engine.building_generator.building_count() as u32
}

#[no_mangle]
pub extern "C" fn set_building_height_scale(scale: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.building_generator.set_default_height(scale);
    engine.buildings_dirty = true;
}

#[no_mangle]
pub extern "C" fn set_light_direction(x: f32, y: f32, z: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.renderer.set_light_direction(x, y, z);
}

#[no_mangle]
pub extern "C" fn set_ambient_intensity(intensity: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.renderer.set_ambient_intensity(intensity);
}

#[no_mangle]
pub extern "C" fn set_diffuse_intensity(intensity: f32) {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.renderer.set_diffuse_intensity(intensity);
}

#[no_mangle]
pub extern "C" fn add_sample_buildings() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    let buildings = buildings::create_sample_buildings();
    engine.building_generator.add_buildings(buildings);
    engine.buildings_dirty = true;
    log::info!("Added {} sample buildings", buildings.len());
}

#[no_mangle]
pub extern "C" fn clear_buildings() {
    let mut engine = MAP_ENGINE.lock().unwrap();
    engine.building_generator.clear();
    engine.buildings_dirty = true;
    log::info!("Buildings cleared");
}

#[cfg(target_os = "android")]
pub mod android {
    use super::*;
    use jni::objects::{JClass, JString};
    use jni::sys::{jboolean, jdouble, jfloat, jlong};
    use jni::JNIEnv;

    #[no_mangle]
    pub extern "system" fn Java_com_example_offlinemap_MapEngine_init(
        _env: JNIEnv,
        _class: JClass,
    ) -> jboolean {
        init_engine() as jboolean
    }

    #[no_mangle]
    pub extern "system" fn Java_com_example_offlinemap_MapEngine_render(
        _env: JNIEnv,
        _class: JClass,
    ) {
        render_frame();
    }

    #[no_mangle]
    pub extern "system" fn Java_com_example_offlinemap_MapEngine_setZoom(
        _env: JNIEnv,
        _class: JClass,
        zoom: jfloat,
    ) {
        set_zoom(zoom);
    }

    #[no_mangle]
    pub extern "system" fn Java_com_example_offlinemap_MapEngine_getZoom(
        _env: JNIEnv,
        _class: JClass,
    ) -> jfloat {
        get_zoom()
    }

    #[no_mangle]
    pub extern "system" fn Java_com_example_offlinemap_MapEngine_setCenter(
        _env: JNIEnv,
        _class: JClass,
        latitude: jdouble,
        longitude: jdouble,
    ) {
        set_map_center(latitude, longitude);
    }

    #[no_mangle]
    pub extern "system" fn Java_com_example_offlinemap_MapEngine_planRoute(
        _env: JNIEnv,
        _class: JClass,
        start_lat: jdouble,
        start_lon: jdouble,
        end_lat: jdouble,
        end_lon: jdouble,
    ) -> jboolean {
        plan_route(start_lat, start_lon, end_lat, end_lon) as jboolean
    }
}
