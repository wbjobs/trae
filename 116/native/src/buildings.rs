use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::types::{Color, GeoCoordinate, Vertex};
use crate::mbtiles::geo_to_mercator;

#[repr(C)]
#[derive(Debug, Clone)]
pub struct BuildingVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub color: [f32; 4],
}

#[derive(Debug, Clone)]
pub struct Building {
    pub id: String,
    pub footprint: Vec<GeoCoordinate>,
    pub height: f32,
    pub min_height: f32,
    pub color: Color,
    pub levels: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct BuildingMesh {
    pub vertices: Vec<BuildingVertex>,
    pub indices: Vec<u32>,
    pub bounding_box: BoundingBox,
}

#[derive(Debug, Clone, Copy)]
pub struct BoundingBox {
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lon: f64,
    pub max_lon: f64,
    pub min_height: f32,
    pub max_height: f32,
}

pub struct BuildingGenerator {
    buildings: Vec<Building>,
    mesh_cache: HashMap<String, BuildingMesh>,
    default_height: f32,
    default_color: Color,
    level_height: f32,
}

impl BuildingGenerator {
    pub fn new() -> Self {
        Self {
            buildings: Vec::new(),
            mesh_cache: HashMap::new(),
            default_height: 12.0,
            default_color: Color::BUILDING,
            level_height: 3.2,
        }
    }

    pub fn add_building(&mut self, building: Building) {
        self.mesh_cache.remove(&building.id);
        self.buildings.push(building);
    }

    pub fn add_buildings(&mut self, buildings: Vec<Building>) {
        for building in buildings {
            self.add_building(building);
        }
    }

    pub fn clear(&mut self) {
        self.buildings.clear();
        self.mesh_cache.clear();
    }

    pub fn building_count(&self) -> usize {
        self.buildings.len()
    }

    pub fn generate_mesh(&mut self, building: &Building) -> BuildingMesh {
        if let Some(cached) = self.mesh_cache.get(&building.id) {
            return cached.clone();
        }

        let mesh = self.extrude_building(building);
        self.mesh_cache.insert(building.id.clone(), mesh.clone());
        mesh
    }

    pub fn generate_all_meshes(&mut self) -> Vec<BuildingMesh> {
        let buildings = self.buildings.clone();
        buildings
            .iter()
            .map(|b| self.generate_mesh(b))
            .collect()
    }

    pub fn get_visible_buildings(
        &self,
        viewport: &crate::types::MapViewport,
        screen_width: u32,
        screen_height: u32,
    ) -> Vec<&Building> {
        let (center_x, center_y) =
            geo_to_mercator(viewport.center.latitude, viewport.center.longitude);

        let scale = 2.0f64.powi(viewport.zoom as i32 - 11);
        let aspect = screen_width as f64 / screen_height as f64;
        let half_height = 1.0 / scale;
        let half_width = half_height * aspect;

        let padding = 0.1;

        let visible_bounds = BoundingBox {
            min_lat: mercator_y_to_lat(center_y + half_height + padding),
            max_lat: mercator_y_to_lat(center_y - half_height - padding),
            min_lon: (center_x - half_width - padding) * 180.0,
            max_lon: (center_x + half_width + padding) * 180.0,
            min_height: 0.0,
            max_height: f32::MAX,
        };

        self.buildings
            .iter()
            .filter(|b| is_building_visible(b, &visible_bounds))
            .collect()
    }

    fn extrude_building(&self, building: &Building) -> BuildingMesh {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();

        if building.footprint.len() < 3 {
            return BuildingMesh {
                vertices,
                indices,
                bounding_box: compute_bounding_box(&building.footprint, building.min_height, building.height),
            };
        }

        let footprint_mercator: Vec<(f32, f32)> = building
            .footprint
            .iter()
            .map(|c| {
                let (x, y) = geo_to_mercator(c.latitude, c.longitude);
                (x as f32, y as f32)
            })
            .collect();

        let base_z = building.min_height;
        let top_z = building.height;

        let top_color = adjust_color(building.color, 1.1);
        let side_color = adjust_color(building.color, 0.85);
        let bottom_color = adjust_color(building.color, 0.6);

        self.add_roof_face(
            &footprint_mercator,
            top_z,
            top_color,
            &mut vertices,
            &mut indices,
        );

        self.add_bottom_face(
            &footprint_mercator,
            base_z,
            bottom_color,
            &mut vertices,
            &mut indices,
        );

        self.add_side_faces(
            &footprint_mercator,
            base_z,
            top_z,
            side_color,
            &mut vertices,
            &mut indices,
        );

        let bounding_box = compute_bounding_box(
            &building.footprint,
            building.min_height,
            building.height,
        );

        BuildingMesh {
            vertices,
            indices,
            bounding_box,
        }
    }

    fn add_roof_face(
        &self,
        footprint: &[(f32, f32)],
        z: f32,
        color: Color,
        vertices: &mut Vec<BuildingVertex>,
        indices: &mut Vec<u32>,
    ) {
        let normal = [0.0, 0.0, 1.0];
        let color_arr = [color.r, color.g, color.b, color.a];
        let base_idx = vertices.len() as u32;

        for (x, y) in footprint {
            vertices.push(BuildingVertex {
                position: [*x, *y, z],
                normal,
                color: color_arr,
            });
        }

        if footprint.len() >= 3 {
            for i in 1..(footprint.len() as u32 - 1) {
                indices.push(base_idx);
                indices.push(base_idx + i);
                indices.push(base_idx + i + 1);
            }
        }
    }

    fn add_bottom_face(
        &self,
        footprint: &[(f32, f32)],
        z: f32,
        color: Color,
        vertices: &mut Vec<BuildingVertex>,
        indices: &mut Vec<u32>,
    ) {
        let normal = [0.0, 0.0, -1.0];
        let color_arr = [color.r, color.g, color.b, color.a];
        let base_idx = vertices.len() as u32;

        for (x, y) in footprint.iter().rev() {
            vertices.push(BuildingVertex {
                position: [*x, *y, z],
                normal,
                color: color_arr,
            });
        }

        if footprint.len() >= 3 {
            for i in 1..(footprint.len() as u32 - 1) {
                indices.push(base_idx);
                indices.push(base_idx + i);
                indices.push(base_idx + i + 1);
            }
        }
    }

    fn add_side_faces(
        &self,
        footprint: &[(f32, f32)],
        base_z: f32,
        top_z: f32,
        color: Color,
        vertices: &mut Vec<BuildingVertex>,
        indices: &mut Vec<u32>,
    ) {
        let color_arr = [color.r, color.g, color.b, color.a];
        let n = footprint.len();

        for i in 0..n {
            let j = (i + 1) % n;

            let (x1, y1) = footprint[i];
            let (x2, y2) = footprint[j];

            let edge_x = x2 - x1;
            let edge_y = y2 - y1;
            let edge_len = (edge_x * edge_x + edge_y * edge_y).sqrt();
            if edge_len < 0.000001 {
                continue;
            }

            let normal_x = -edge_y / edge_len;
            let normal_y = edge_x / edge_len;
            let normal = [normal_x, normal_y, 0.0];

            let base_idx = vertices.len() as u32;

            vertices.push(BuildingVertex {
                position: [x1, y1, base_z],
                normal,
                color: color_arr,
            });
            vertices.push(BuildingVertex {
                position: [x2, y2, base_z],
                normal,
                color: color_arr,
            });
            vertices.push(BuildingVertex {
                position: [x2, y2, top_z],
                normal,
                color: color_arr,
            });
            vertices.push(BuildingVertex {
                position: [x1, y1, top_z],
                normal,
                color: color_arr,
            });

            indices.push(base_idx);
            indices.push(base_idx + 1);
            indices.push(base_idx + 2);

            indices.push(base_idx);
            indices.push(base_idx + 2);
            indices.push(base_idx + 3);
        }
    }

    pub fn set_default_height(&mut self, height: f32) {
        self.default_height = height;
    }

    pub fn set_default_color(&mut self, color: Color) {
        self.default_color = color;
    }

    pub fn set_level_height(&mut self, height: f32) {
        self.level_height = height;
    }

    pub fn parse_osm_building(
        &mut self,
        osm_data: &OsmBuildingData,
    ) -> Building {
        let height = osm_data
            .height
            .or_else(|| {
                osm_data
                    .levels
                    .map(|levels| levels as f32 * self.level_height)
            })
            .unwrap_or(self.default_height);

        let min_height = osm_data.min_height.unwrap_or(0.0);

        let color = osm_data.color.unwrap_or(self.default_color);

        Building {
            id: osm_data.id.clone(),
            footprint: osm_data.footprint.clone(),
            height,
            min_height,
            color,
            levels: osm_data.levels,
        }
    }
}

impl Default for BuildingGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct OsmBuildingData {
    pub id: String,
    pub footprint: Vec<GeoCoordinate>,
    pub height: Option<f32>,
    pub min_height: Option<f32>,
    pub levels: Option<u32>,
    pub color: Option<Color>,
    pub tags: HashMap<String, String>,
}

impl OsmBuildingData {
    pub fn from_osm_tags(id: String, footprint: Vec<GeoCoordinate>, tags: &HashMap<String, String>) -> Self {
        let height = parse_height(tags.get("height"));
        let min_height = parse_height(tags.get("min_height"));
        let levels = tags.get("building:levels").and_then(|s| s.parse::<u32>().ok());
        let color = parse_color(tags.get("building:color"));

        Self {
            id,
            footprint,
            height,
            min_height,
            levels,
            color,
            tags: tags.clone(),
        }
    }
}

fn parse_height(s: Option<&String>) -> Option<f32> {
    s.and_then(|val| {
        let cleaned = val
            .replace("m", "")
            .replace("meters", "")
            .replace("meter", "")
            .trim()
            .to_string();
        cleaned.parse::<f32>().ok()
    })
}

fn parse_color(s: Option<&String>) -> Option<Color> {
    s.and_then(|val| {
        let val = val.trim().to_lowercase();
        match val.as_str() {
            "red" => Some(Color { r: 0.9, g: 0.3, b: 0.3, a: 1.0 }),
            "blue" => Some(Color { r: 0.3, g: 0.5, b: 0.9, a: 1.0 }),
            "green" => Some(Color { r: 0.3, g: 0.8, b: 0.4, a: 1.0 }),
            "yellow" => Some(Color { r: 1.0, g: 0.9, b: 0.3, a: 1.0 }),
            "white" => Some(Color { r: 0.95, g: 0.95, b: 0.95, a: 1.0 }),
            "black" => Some(Color { r: 0.2, g: 0.2, b: 0.2, a: 1.0 }),
            "gray" | "grey" => Some(Color { r: 0.6, g: 0.6, b: 0.6, a: 1.0 }),
            "brown" => Some(Color { r: 0.55, g: 0.4, b: 0.3, a: 1.0 }),
            _ => {
                if val.starts_with('#') && val.len() == 7 {
                    let r = u8::from_str_radix(&val[1..3], 16).ok()? as f32 / 255.0;
                    let g = u8::from_str_radix(&val[3..5], 16).ok()? as f32 / 255.0;
                    let b = u8::from_str_radix(&val[5..7], 16).ok()? as f32 / 255.0;
                    Some(Color { r, g, b, a: 1.0 })
                } else {
                    None
                }
            }
        }
    })
}

fn adjust_color(color: Color, factor: f32) -> Color {
    Color {
        r: (color.r * factor).clamp(0.0, 1.0),
        g: (color.g * factor).clamp(0.0, 1.0),
        b: (color.b * factor).clamp(0.0, 1.0),
        a: color.a,
    }
}

fn compute_bounding_box(footprint: &[GeoCoordinate], min_height: f32, max_height: f32) -> BoundingBox {
    if footprint.is_empty() {
        return BoundingBox {
            min_lat: 0.0,
            max_lat: 0.0,
            min_lon: 0.0,
            max_lon: 0.0,
            min_height,
            max_height,
        };
    }

    let mut min_lat = f64::MAX;
    let mut max_lat = f64::MIN;
    let mut min_lon = f64::MAX;
    let mut max_lon = f64::MIN;

    for coord in footprint {
        min_lat = min_lat.min(coord.latitude);
        max_lat = max_lat.max(coord.latitude);
        min_lon = min_lon.min(coord.longitude);
        max_lon = max_lon.max(coord.longitude);
    }

    BoundingBox {
        min_lat,
        max_lat,
        min_lon,
        max_lon,
        min_height,
        max_height,
    }
}

fn is_building_visible(building: &Building, view_bounds: &BoundingBox) -> bool {
    let bb = compute_bounding_box(&building.footprint, building.min_height, building.height);

    bb.max_lat >= view_bounds.min_lat
        && bb.min_lat <= view_bounds.max_lat
        && bb.max_lon >= view_bounds.min_lon
        && bb.min_lon <= view_bounds.max_lon
}

fn mercator_y_to_lat(y: f64) -> f64 {
    let n = std::f64::consts::PI - 2.0 * std::f64::consts::PI * y;
    (180.0 / std::f64::consts::PI) * (0.5 * (n.exp() - (-n).exp())).atan()
}

pub fn create_sample_buildings() -> Vec<Building> {
    let center = GeoCoordinate::new(39.9042, 116.4074);
    let mut buildings = Vec::new();

    let grid_size = 5;
    let spacing = 0.002;
    let base_lat = center.latitude - (grid_size as f64 * spacing) / 2.0;
    let base_lon = center.longitude - (grid_size as f64 * spacing) / 2.0;

    for i in 0..grid_size {
        for j in 0..grid_size {
            let lat = base_lat + i as f64 * spacing;
            let lon = base_lon + j as f64 * spacing;

            let size = 0.0005 + (i * grid_size + j) as f64 * 0.00005;
            let height = 15.0 + ((i * grid_size + j) % 8) as f32 * 5.0;

            let footprint = vec![
                GeoCoordinate::new(lat - size, lon - size),
                GeoCoordinate::new(lat + size, lon - size),
                GeoCoordinate::new(lat + size, lon + size),
                GeoCoordinate::new(lat - size, lon + size),
            ];

            let color = match (i + j) % 4 {
                0 => Color { r: 0.85, g: 0.83, b: 0.80, a: 1.0 },
                1 => Color { r: 0.90, g: 0.88, b: 0.85, a: 1.0 },
                2 => Color { r: 0.80, g: 0.78, b: 0.75, a: 1.0 },
                _ => Color { r: 0.88, g: 0.85, b: 0.82, a: 1.0 },
            };

            buildings.push(Building {
                id: format!("building_{}_{}", i, j),
                footprint,
                height,
                min_height: 0.0,
                color,
                levels: Some((height / 3.2) as u32),
            });
        }
    }

    buildings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_building_generation() {
        let mut generator = BuildingGenerator::new();

        let building = Building {
            id: "test".to_string(),
            footprint: vec![
                GeoCoordinate::new(0.0, 0.0),
                GeoCoordinate::new(0.001, 0.0),
                GeoCoordinate::new(0.001, 0.001),
                GeoCoordinate::new(0.0, 0.001),
            ],
            height: 20.0,
            min_height: 0.0,
            color: Color::BUILDING,
            levels: Some(6),
        };

        let mesh = generator.generate_mesh(&building);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_multiple_buildings() {
        let mut generator = BuildingGenerator::new();
        let buildings = create_sample_buildings();
        generator.add_buildings(buildings);

        assert_eq!(generator.building_count(), 25);

        let meshes = generator.generate_all_meshes();
        assert_eq!(meshes.len(), 25);
    }

    #[test]
    fn test_osm_parsing() {
        let mut generator = BuildingGenerator::new();
        let mut tags = HashMap::new();
        tags.insert("height".to_string(), "25".to_string());
        tags.insert("building:levels".to_string(), "8".to_string());
        tags.insert("building:color".to_string(), "red".to_string());

        let footprint = vec![
            GeoCoordinate::new(0.0, 0.0),
            GeoCoordinate::new(0.001, 0.0),
            GeoCoordinate::new(0.001, 0.001),
            GeoCoordinate::new(0.0, 0.001),
        ];

        let osm_data = OsmBuildingData::from_osm_tags("test".to_string(), footprint, &tags);
        let building = generator.parse_osm_building(&osm_data);

        assert_eq!(building.height, 25.0);
        assert_eq!(building.levels, Some(8));
        assert!(building.color.r > 0.5);
    }

    #[test]
    fn test_parse_height() {
        assert_eq!(parse_height(Some(&"10".to_string())), Some(10.0));
        assert_eq!(parse_height(Some(&"15m".to_string())), Some(15.0));
        assert_eq!(parse_height(Some(&"20 meters".to_string())), Some(20.0));
        assert_eq!(parse_height(None), None);
    }

    #[test]
    fn test_visible_buildings() {
        let mut generator = BuildingGenerator::new();
        let buildings = create_sample_buildings();
        generator.add_buildings(buildings);

        let viewport = crate::types::MapViewport {
            center: GeoCoordinate::new(39.9042, 116.4074),
            zoom: 15.0,
            rotation: 0.0,
            tilt: 30.0,
        };

        let visible = generator.get_visible_buildings(&viewport, 800, 600);
        assert!(!visible.is_empty());
    }
}
