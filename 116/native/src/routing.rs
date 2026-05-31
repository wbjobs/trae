use std::collections::{BinaryHeap, HashMap};
use std::cmp::Ordering;

use crate::types::{GeoCoordinate, Route, RoutePoint};

#[derive(Debug, Clone)]
struct GraphNode {
    id: u32,
    coordinate: GeoCoordinate,
    neighbors: Vec<(u32, f64)>,
}

#[derive(Debug, Clone)]
struct PathNode {
    id: u32,
    f_score: f64,
}

impl PartialEq for PathNode {
    fn eq(&self, other: &Self) -> bool {
        self.f_score == other.f_score
    }
}

impl Eq for PathNode {}

impl Ord for PathNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other.f_score.partial_cmp(&self.f_score).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for PathNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct RoutingEngine {
    nodes: HashMap<u32, GraphNode>,
    road_network_loaded: bool,
}

impl RoutingEngine {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            road_network_loaded: false,
        }
    }

    pub fn load_sample_network(&mut self) {
        self.nodes.clear();

        let grid_size = 10;
        let start_lat = 39.90;
        let start_lon = 116.40;
        let step = 0.005;

        let mut node_id = 0u32;
        let mut grid = Vec::new();

        for i in 0..grid_size {
            let mut row = Vec::new();
            for j in 0..grid_size {
                let coord = GeoCoordinate::new(
                    start_lat + i as f64 * step,
                    start_lon + j as f64 * step,
                );
                let node = GraphNode {
                    id: node_id,
                    coordinate: coord,
                    neighbors: Vec::new(),
                };
                self.nodes.insert(node_id, node);
                row.push(node_id);
                node_id += 1;
            }
            grid.push(row);
        }

        for i in 0..grid_size {
            for j in 0..grid_size {
                let current = grid[i][j];
                let coord = self.nodes[&current].coordinate;

                if j < grid_size - 1 {
                    let neighbor = grid[i][j + 1];
                    let neighbor_coord = self.nodes[&neighbor].coordinate;
                    let dist = crate::gps::haversine_distance(&coord, &neighbor_coord);
                    self.nodes.get_mut(&current).unwrap().neighbors.push((neighbor, dist));
                    self.nodes.get_mut(&neighbor).unwrap().neighbors.push((current, dist));
                }

                if i < grid_size - 1 {
                    let neighbor = grid[i + 1][j];
                    let neighbor_coord = self.nodes[&neighbor].coordinate;
                    let dist = crate::gps::haversine_distance(&coord, &neighbor_coord);
                    self.nodes.get_mut(&current).unwrap().neighbors.push((neighbor, dist));
                    self.nodes.get_mut(&neighbor).unwrap().neighbors.push((current, dist));
                }

                if i < grid_size - 1 && j < grid_size - 1 {
                    let neighbor = grid[i + 1][j + 1];
                    let neighbor_coord = self.nodes[&neighbor].coordinate;
                    let dist = crate::gps::haversine_distance(&coord, &neighbor_coord) * 1.3;
                    self.nodes.get_mut(&current).unwrap().neighbors.push((neighbor, dist));
                    self.nodes.get_mut(&neighbor).unwrap().neighbors.push((current, dist));
                }
            }
        }

        self.road_network_loaded = true;
    }

    pub fn is_network_loaded(&self) -> bool {
        self.road_network_loaded
    }

    pub fn find_route(&self, start: GeoCoordinate, end: GeoCoordinate) -> Option<Route> {
        if self.nodes.is_empty() {
            return None;
        }

        let start_node = self.find_nearest_node(start);
        let end_node = self.find_nearest_node(end);

        if start_node == end_node {
            return Some(Route {
                points: vec![
                    RoutePoint { coordinate: start, index: 0 },
                    RoutePoint { coordinate: end, index: 1 },
                ],
                distance: crate::gps::haversine_distance(&start, &end),
                duration: 0.0,
            });
        }

        let (path, distance) = self.astar(start_node, end_node)?;

        let mut points = Vec::with_capacity(path.len() + 2);
        points.push(RoutePoint { coordinate: start, index: 0 });

        for (idx, &node_id) in path.iter().enumerate() {
            if let Some(node) = self.nodes.get(&node_id) {
                points.push(RoutePoint {
                    coordinate: node.coordinate,
                    index: (idx + 1) as u32,
                });
            }
        }

        points.push(RoutePoint {
            coordinate: end,
            index: points.len() as u32,
        });

        let avg_speed = 30.0;
        let duration = distance / avg_speed;

        Some(Route {
            points,
            distance,
            duration,
        })
    }

    fn find_nearest_node(&self, coord: GeoCoordinate) -> u32 {
        let mut nearest_id = 0;
        let mut min_dist = f64::MAX;

        for (id, node) in &self.nodes {
            let dist = crate::gps::haversine_distance(&coord, &node.coordinate);
            if dist < min_dist {
                min_dist = dist;
                nearest_id = *id;
            }
        }

        nearest_id
    }

    fn astar(&self, start: u32, end: u32) -> Option<(Vec<u32>, f64)> {
        let mut open_set = BinaryHeap::new();
        let mut came_from = HashMap::new();
        let mut g_score = HashMap::new();
        let mut f_score = HashMap::new();

        let start_node = self.nodes.get(&start)?;
        let end_node = self.nodes.get(&end)?;

        let h = |a: &GeoCoordinate, b: &GeoCoordinate| -> f64 {
            crate::gps::haversine_distance(a, b)
        };

        g_score.insert(start, 0.0);
        f_score.insert(start, h(&start_node.coordinate, &end_node.coordinate));
        open_set.push(PathNode {
            id: start,
            f_score: f_score[&start],
        });

        while let Some(current) = open_set.pop() {
            if current.id == end {
                let mut path = vec![current.id];
                let mut curr = current.id;
                while let Some(&prev) = came_from.get(&curr) {
                    path.push(prev);
                    curr = prev;
                }
                path.reverse();
                return Some((path, g_score[&current.id]));
            }

            let current_node = match self.nodes.get(&current.id) {
                Some(n) => n,
                None => continue,
            };

            for &(neighbor, weight) in &current_node.neighbors {
                let tentative_g = g_score.get(&current.id).copied().unwrap_or(f64::MAX) + weight;

                if tentative_g < g_score.get(&neighbor).copied().unwrap_or(f64::MAX) {
                    came_from.insert(neighbor, current.id);
                    g_score.insert(neighbor, tentative_g);

                    let neighbor_node = match self.nodes.get(&neighbor) {
                        Some(n) => n,
                        None => continue,
                    };

                    let f = tentative_g + h(&neighbor_node.coordinate, &end_node.coordinate);
                    f_score.insert(neighbor, f);
                    open_set.push(PathNode {
                        id: neighbor,
                        f_score: f,
                    });
                }
            }
        }

        None
    }

    pub fn get_node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn get_all_coordinates(&self) -> Vec<GeoCoordinate> {
        self.nodes.values().map(|n| n.coordinate).collect()
    }
}

impl Default for RoutingEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_network() {
        let mut engine = RoutingEngine::new();
        engine.load_sample_network();
        assert!(engine.is_network_loaded());
        assert_eq!(engine.get_node_count(), 100);
    }

    #[test]
    fn test_find_route() {
        let mut engine = RoutingEngine::new();
        engine.load_sample_network();

        let start = GeoCoordinate::new(39.90, 116.40);
        let end = GeoCoordinate::new(39.945, 116.445);

        let route = engine.find_route(start, end);
        assert!(route.is_some());

        let route = route.unwrap();
        assert!(route.distance > 0.0);
        assert!(route.points.len() > 2);
    }

    #[test]
    fn test_route_same_point() {
        let mut engine = RoutingEngine::new();
        engine.load_sample_network();

        let coord = GeoCoordinate::new(39.90, 116.40);
        let route = engine.find_route(coord, coord);
        assert!(route.is_some());
    }

    #[test]
    fn test_no_network() {
        let engine = RoutingEngine::new();
        let route = engine.find_route(
            GeoCoordinate::new(39.90, 116.40),
            GeoCoordinate::new(39.95, 116.45),
        );
        assert!(route.is_none());
    }
}
