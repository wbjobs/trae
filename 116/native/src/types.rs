use serde::{Deserialize, Serialize};

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GeoCoordinate {
    pub latitude: f64,
    pub longitude: f64,
}

impl GeoCoordinate {
    pub fn new(latitude: f64, longitude: f64) -> Self {
        Self { latitude, longitude }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct MapViewport {
    pub center: GeoCoordinate,
    pub zoom: f32,
    pub rotation: f32,
    pub tilt: f32,
}

impl Default for MapViewport {
    fn default() -> Self {
        Self {
            center: GeoCoordinate::new(39.9042, 116.4074),
            zoom: 12.0,
            rotation: 0.0,
            tilt: 0.0,
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct MapViewState {
    pub viewport: MapViewport,
    pub width: u32,
    pub height: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutePoint {
    pub coordinate: GeoCoordinate,
    pub index: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    pub points: Vec<RoutePoint>,
    pub distance: f64,
    pub duration: f64,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct GpsState {
    pub coordinate: GeoCoordinate,
    pub heading: f32,
    pub speed: f32,
    pub accuracy: f32,
}

impl Default for GpsState {
    fn default() -> Self {
        Self {
            coordinate: GeoCoordinate::new(39.9042, 116.4074),
            heading: 0.0,
            speed: 0.0,
            accuracy: 5.0,
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const WATER: Color = Color { r: 0.345, g: 0.604, b: 0.827, a: 1.0 };
    pub const LAND: Color = Color { r: 0.945, g: 0.933, b: 0.910, a: 1.0 };
    pub const ROAD: Color = Color { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const HIGHWAY: Color = Color { r: 1.0, g: 0.85, b: 0.4, a: 1.0 };
    pub const BUILDING: Color = Color { r: 0.85, g: 0.83, b: 0.80, a: 1.0 };
    pub const PARK: Color = Color { r: 0.75, g: 0.85, b: 0.70, a: 1.0 };
    pub const ROUTE: Color = Color { r: 0.2, g: 0.6, b: 1.0, a: 0.8 };
    pub const GPS_MARKER: Color = Color { r: 1.0, g: 0.3, b: 0.3, a: 1.0 };
}

#[derive(Debug, Clone, Copy)]
pub struct Vertex {
    pub position: [f32; 2],
    pub color: [f32; 4],
}

#[derive(Debug, Clone)]
pub struct TileData {
    pub zoom: u8,
    pub x: u32,
    pub y: u32,
    pub vertices: Vec<Vertex>,
    pub indices: Vec<u32>,
}

pub const MIN_ZOOM: f32 = 3.0;
pub const MAX_ZOOM: f32 = 18.0;
pub const MIN_TILT: f32 = 0.0;
pub const MAX_TILT: f32 = 60.0;
pub const TILE_SIZE: f32 = 256.0;
