use rand::Rng;
use std::time::{Duration, Instant};

use crate::types::{GeoCoordinate, GpsState, Route, RoutePoint};

pub struct GpsSimulator {
    state: GpsState,
    target_coordinate: Option<GeoCoordinate>,
    waypoints: Vec<GeoCoordinate>,
    current_waypoint_index: usize,
    speed: f32,
    is_active: bool,
    last_update: Instant,
    path: Option<Vec<GeoCoordinate>>,
    path_index: usize,
}

impl GpsSimulator {
    pub fn new() -> Self {
        Self {
            state: GpsState::default(),
            target_coordinate: None,
            waypoints: Vec::new(),
            current_waypoint_index: 0,
            speed: 10.0,
            is_active: false,
            last_update: Instant::now(),
            path: None,
            path_index: 0,
        }
    }

    pub fn start(&mut self) {
        self.is_active = true;
        self.last_update = Instant::now();
    }

    pub fn stop(&mut self) {
        self.is_active = false;
        self.state.speed = 0.0;
    }

    pub fn is_active(&self) -> bool {
        self.is_active
    }

    pub fn get_state(&self) -> &GpsState {
        &self.state
    }

    pub fn set_position(&mut self, coordinate: GeoCoordinate) {
        self.state.coordinate = coordinate;
    }

    pub fn set_speed(&mut self, speed: f32) {
        self.speed = speed.max(0.0);
    }

    pub fn get_speed(&self) -> f32 {
        self.speed
    }

    pub fn set_waypoints(&mut self, waypoints: Vec<GeoCoordinate>) {
        self.waypoints = waypoints;
        self.current_waypoint_index = 0;
    }

    pub fn follow_route(&mut self, route: &Route) {
        self.path = Some(
            route
                .points
                .iter()
                .map(|p| p.coordinate)
                .collect(),
        );
        self.path_index = 0;
        if let Some(path) = &self.path {
            if !path.is_empty() {
                self.state.coordinate = path[0];
            }
        }
        self.start();
    }

    pub fn update(&mut self) {
        if !self.is_active {
            return;
        }

        let now = Instant::now();
        let delta = now.duration_since(self.last_update).as_secs_f32();
        self.last_update = now;

        if let Some(path) = &self.path {
            if self.path_index < path.len() - 1 {
                let target = path[self.path_index + 1];
                self.move_toward(target, delta);

                if self.reached_coordinate(target) {
                    self.path_index += 1;
                }
            } else {
                self.stop();
            }
        } else if self.current_waypoint_index < self.waypoints.len() {
            let target = self.waypoints[self.current_waypoint_index];
            self.move_toward(target, delta);

            if self.reached_coordinate(target) {
                self.current_waypoint_index += 1;
            }
        }

        self.add_noise();
    }

    fn move_toward(&mut self, target: GeoCoordinate, delta: f32) {
        let current = self.state.coordinate;
        let dlat = target.latitude - current.latitude;
        let dlon = target.longitude - current.longitude;
        let distance = (dlat * dlat + dlon * dlon).sqrt();

        if distance < 0.000001 {
            return;
        }

        let meters_per_deg_lat = 111320.0;
        let meters_per_deg_lon = 111320.0 * current.latitude.to_radians().cos();

        let lat_offset = (self.speed * delta / meters_per_deg_lat) as f64;
        let lon_offset = (self.speed * delta / meters_per_deg_lon) as f64;

        let ratio = (lat_offset / distance).min(1.0);
        let new_lat = current.latitude + dlat * ratio;
        let new_lon = current.longitude + dlon * ratio;

        self.state.heading = dlon.atan2(dlat).to_degrees() as f32;
        self.state.coordinate = GeoCoordinate::new(new_lat, new_lon);
        self.state.speed = self.speed;
    }

    fn reached_coordinate(&self, target: GeoCoordinate) -> bool {
        let threshold = 0.00001;
        let dlat = self.state.coordinate.latitude - target.latitude;
        let dlon = self.state.coordinate.longitude - target.longitude;
        (dlat * dlat + dlon * dlon).sqrt() < threshold
    }

    fn add_noise(&mut self) {
        let mut rng = rand::thread_rng();
        let noise_lat: f64 = rng.gen_range(-0.000001..0.000001);
        let noise_lon: f64 = rng.gen_range(-0.000001..0.000001);
        self.state.coordinate.latitude += noise_lat;
        self.state.coordinate.longitude += noise_lon;
        self.state.accuracy = 5.0 + rng.gen_range(-1.0..1.0);
    }

    pub fn reset(&mut self) {
        self.state = GpsState::default();
        self.waypoints.clear();
        self.current_waypoint_index = 0;
        self.path = None;
        self.path_index = 0;
        self.is_active = false;
    }
}

impl Default for GpsSimulator {
    fn default() -> Self {
        Self::new()
    }
}

pub fn create_sample_route() -> Route {
    let start = GeoCoordinate::new(39.9042, 116.4074);
    let waypoints = vec![
        GeoCoordinate::new(39.9100, 116.4100),
        GeoCoordinate::new(39.9200, 116.4200),
        GeoCoordinate::new(39.9300, 116.4300),
        GeoCoordinate::new(39.9400, 116.4400),
        GeoCoordinate::new(39.9500, 116.4500),
    ];

    let mut points = vec![RoutePoint {
        coordinate: start,
        index: 0,
    }];

    for (i, wp) in waypoints.iter().enumerate() {
        points.push(RoutePoint {
            coordinate: *wp,
            index: (i + 1) as u32,
        });
    }

    let mut distance = 0.0;
    for i in 1..points.len() {
        let d = haversine_distance(&points[i - 1].coordinate, &points[i].coordinate);
        distance += d;
    }

    let avg_speed = 30.0;
    let duration = distance / avg_speed;

    Route {
        points,
        distance,
        duration,
    }
}

pub fn haversine_distance(a: &GeoCoordinate, b: &GeoCoordinate) -> f64 {
    let earth_radius = 6371000.0;
    let lat1 = a.latitude.to_radians();
    let lat2 = b.latitude.to_radians();
    let dlat = (b.latitude - a.latitude).to_radians();
    let dlon = (b.longitude - a.longitude).to_radians();

    let a_val = (dlat / 2.0).sin() * (dlat / 2.0).sin()
        + lat1.cos() * lat2.cos() * (dlon / 2.0).sin() * (dlon / 2.0).sin();
    let c_val = 2.0 * a_val.sqrt().atan2((1.0 - a_val).sqrt());

    earth_radius * c_val
}
