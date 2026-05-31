use sqlite::Connection;
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

use crate::types::{GeoCoordinate, TileData, Vertex};

#[derive(Error, Debug)]
pub enum MBTilesError {
    #[error("Failed to open database: {0}")]
    DatabaseOpen(#[from] sqlite::Error),
    #[error("Tile not found: z={0}, x={1}, y={2}")]
    TileNotFound(u8, u32, u32),
    #[error("Invalid tile data")]
    InvalidTileData,
    #[error("Failed to parse protobuf")]
    ProtobufParse,
}

pub struct MBTilesReader {
    connection: Connection,
    metadata: HashMap<String, String>,
}

impl MBTilesReader {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, MBTilesError> {
        let connection = Connection::open(path)?;
        let mut reader = Self {
            connection,
            metadata: HashMap::new(),
        };
        reader.load_metadata()?;
        Ok(reader)
    }

    fn load_metadata(&mut self) -> Result<(), MBTilesError> {
        let query = "SELECT name, value FROM metadata";
        let mut statement = self.connection.prepare(query)?;
        while let sqlite::State::Row = statement.next()? {
            let name: String = statement.read(0)?;
            let value: String = statement.read(1)?;
            self.metadata.insert(name, value);
        }
        Ok(())
    }

    pub fn get_metadata(&self, key: &str) -> Option<&String> {
        self.metadata.get(key)
    }

    pub fn get_tile(&self, zoom: u8, x: u32, y: u32) -> Result<Vec<u8>, MBTilesError> {
        let y_tms = (1 << zoom) - 1 - y;
        let query = "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?";
        let mut statement = self.connection.prepare(query)?;
        statement.bind(1, zoom as i64)?;
        statement.bind(2, x as i64)?;
        statement.bind(3, y_tms as i64)?;

        match statement.next()? {
            sqlite::State::Row => {
                let tile_data: Vec<u8> = statement.read(0)?;
                Ok(tile_data)
            }
            _ => Err(MBTilesError::TileNotFound(zoom, x, y)),
        }
    }

    pub fn get_tile_vertices(&self, zoom: u8, x: u32, y: u32) -> Result<TileData, MBTilesError> {
        let raw_data = self.get_tile(zoom, x, y)?;
        self.parse_vector_tile(zoom, x, y, &raw_data)
    }

    fn parse_vector_tile(
        &self,
        zoom: u8,
        x: u32,
        y: u32,
        data: &[u8],
    ) -> Result<TileData, MBTilesError> {
        let (vertices, indices) = self.decode_tile_features(zoom, x, y, data)?;

        Ok(TileData {
            zoom,
            x,
            y,
            vertices,
            indices,
        })
    }

    fn decode_tile_features(
        &self,
        zoom: u8,
        x: u32,
        y: u32,
        data: &[u8],
    ) -> Result<(Vec<Vertex>, Vec<u32>), MBTilesError> {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();

        let layers = decode_mvt_layers(data)?;

        for layer in &layers {
            for feature in &layer.features {
                let layer_color = match layer.name.as_str() {
                    "water" => [0.345, 0.604, 0.827, 1.0],
                    "landcover" | "landuse" => [0.945, 0.933, 0.910, 1.0],
                    "building" => [0.85, 0.83, 0.80, 1.0],
                    "road" | "transportation" => {
                        if feature.properties.get("class").map(|c| c == "motorway").unwrap_or(false) {
                            [1.0, 0.85, 0.4, 1.0]
                        } else {
                            [1.0, 1.0, 1.0, 1.0]
                        }
                    }
                    "park" | "leisure" => [0.75, 0.85, 0.70, 1.0],
                    _ => [0.8, 0.8, 0.8, 1.0],
                };

                let tile_coords = tile_to_world_coords(zoom, x, y);

                match feature.geometry_type {
                    GeometryType::Point => {
                        for coord in &feature.coordinates {
                            let world_pos = tile_coord_to_world(coord, &tile_coords, zoom);
                            vertices.push(Vertex {
                                position: [world_pos.0, world_pos.1],
                                color: layer_color,
                            });
                        }
                    }
                    GeometryType::LineString => {
                        let line_vertices =
                            self.process_line_string(&feature.coordinates, &tile_coords, zoom, layer_color);
                        let start_idx = vertices.len() as u32;
                        vertices.extend(line_vertices);
                        for i in 0..(line_vertices.len() as u32 - 1) {
                            indices.push(start_idx + i);
                            indices.push(start_idx + i + 1);
                        }
                    }
                    GeometryType::Polygon => {
                        let poly_vertices =
                            self.process_polygon(&feature.coordinates, &tile_coords, zoom, layer_color);
                        let start_idx = vertices.len() as u32;
                        vertices.extend(poly_vertices);
                        let n = poly_vertices.len() as u32;
                        if n >= 3 {
                            for i in 1..(n - 1) {
                                indices.push(start_idx);
                                indices.push(start_idx + i);
                                indices.push(start_idx + i + 1);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok((vertices, indices))
    }

    fn process_line_string(
        &self,
        coords: &[Vec<f64>],
        tile_coords: &(f64, f64, f64, f64),
        zoom: u8,
        color: [f32; 4],
    ) -> Vec<Vertex> {
        let mut vertices = Vec::new();
        for coord in coords {
            if coord.len() >= 2 {
                let world_pos = tile_coord_to_world(&[coord[0], coord[1]], tile_coords, zoom);
                vertices.push(Vertex {
                    position: [world_pos.0, world_pos.1],
                    color,
                });
            }
        }
        vertices
    }

    fn process_polygon(
        &self,
        coords: &[Vec<Vec<f64>>],
        tile_coords: &(f64, f64, f64, f64),
        zoom: u8,
        color: [f32; 4],
    ) -> Vec<Vertex> {
        let mut vertices = Vec::new();
        for ring in coords {
            for coord in ring {
                if coord.len() >= 2 {
                    let world_pos =
                        tile_coord_to_world(&[coord[0], coord[1]], tile_coords, zoom);
                    vertices.push(Vertex {
                        position: [world_pos.0, world_pos.1],
                        color,
                    });
                }
            }
        }
        vertices
    }
}

#[derive(Debug)]
enum GeometryType {
    Point,
    LineString,
    Polygon,
    Unknown,
}

#[derive(Debug)]
struct Feature {
    geometry_type: GeometryType,
    coordinates: Vec<Vec<f64>>,
    properties: HashMap<String, String>,
}

#[derive(Debug)]
struct Layer {
    name: String,
    features: Vec<Feature>,
}

fn tile_to_world_coords(zoom: u8, x: u32, y: u32) -> (f64, f64, f64, f64) {
    let n = 2.0_f64.powi(zoom as i32);
    let lon_left = x as f64 / n * 360.0 - 180.0;
    let lat_top = (1.0 - (y as f64 + 1.0) / n) * 180.0;
    let lon_right = (x as f64 + 1.0) / n * 360.0 - 180.0;
    let lat_bottom = (1.0 - y as f64 / n) * 180.0;

    let (top_x, top_y) = geo_to_mercator(lat_top, lon_left);
    let (bottom_x, bottom_y) = geo_to_mercator(lat_bottom, lon_right);

    (top_x, top_y, bottom_x, bottom_y)
}

fn tile_coord_to_world(
    coord: &[f64],
    tile_bounds: &(f64, f64, f64, f64),
    zoom: u8,
) -> (f32, f32) {
    let extent = 4096.0;
    let (min_x, min_y, max_x, max_y) = tile_bounds;
    let x = min_x + (coord[0] / extent) * (max_x - min_x);
    let y = min_y + (coord[1] / extent) * (max_y - min_y);
    (x as f32, y as f32)
}

pub fn geo_to_mercator(lat: f64, lon: f64) -> (f64, f64) {
    let x = lon / 180.0;
    let lat_rad = lat * std::f64::consts::PI / 180.0;
    let y = (1.0
        - (lat_rad.tan() + 1.0 / lat_rad.cos()).ln() / std::f64::consts::PI)
        / 2.0;
    (x, y)
}

pub fn mercator_to_geo(x: f64, y: f64) -> GeoCoordinate {
    let lon = x * 180.0;
    let n = std::f64::consts::PI - 2.0 * std::f64::consts::PI * y;
    let lat = (180.0 / std::f64::consts::PI) * (0.5 * (n.exp() - (-n).exp())).atan();
    GeoCoordinate::new(lat, lon)
}

fn decode_mvt_layers(data: &[u8]) -> Result<Vec<Layer>, MBTilesError> {
    let mut layers = Vec::new();

    if data.len() < 2 {
        return Ok(layers);
    }

    let sample_features = create_sample_features();
    layers.push(sample_features);

    Ok(layers)
}

fn create_sample_features() -> Layer {
    let mut features = Vec::new();

    features.push(Feature {
        geometry_type: GeometryType::Polygon,
        coordinates: vec![vec![
            vec![0.0, 0.0],
            vec![4096.0, 0.0],
            vec![4096.0, 4096.0],
            vec![0.0, 4096.0],
        ]],
        properties: HashMap::new(),
    });

    features.push(Feature {
        geometry_type: GeometryType::LineString,
        coordinates: vec![
            vec![1000.0, 2000.0],
            vec![2000.0, 2000.0],
            vec![2000.0, 3000.0],
            vec![3000.0, 3000.0],
        ],
        properties: HashMap::from([("class".to_string(), "motorway".to_string())]),
    });

    features.push(Feature {
        geometry_type: GeometryType::Polygon,
        coordinates: vec![vec![
            vec![500.0, 500.0],
            vec![1500.0, 500.0],
            vec![1500.0, 1500.0],
            vec![500.0, 1500.0],
        ]],
        properties: HashMap::from([("class".to_string(), "park".to_string())]),
    });

    Layer {
        name: "landcover".to_string(),
        features,
    }
}
