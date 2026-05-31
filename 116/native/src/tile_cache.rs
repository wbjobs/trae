use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::types::{MapViewport, TileData, Vertex};

static TILE_CACHE_VERSION: AtomicU64 = AtomicU64::new(0);

const MAX_CACHE_SIZE: usize = 256;
const PRIORITY_BUFFER: u32 = 2;

#[derive(Debug, Clone)]
struct CachedTile {
    data: TileData,
    zoom: u8,
    timestamp: std::time::Instant,
    used_count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TileKey {
    zoom: u8,
    x: u32,
    y: u32,
}

impl TileKey {
    fn new(zoom: u8, x: u32, y: u32) -> Self {
        Self { zoom, x, y }
    }
}

#[derive(Debug, Clone)]
struct PendingTile {
    key: TileKey,
    priority: i32,
    request_time: std::time::Instant,
}

impl PartialEq for PendingTile {
    fn eq(&self, other: &Self) -> bool {
        self.key == other.key
    }
}

impl Eq for PendingTile {}

impl PartialOrd for PendingTile {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PendingTile {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority.cmp(&other.priority)
            .then_with(|| other.request_time.cmp(&self.request_time))
    }
}

pub struct TileCache {
    cache: HashMap<TileKey, CachedTile>,
    pending_requests: Vec<PendingTile>,
    current_zoom: f32,
    target_zoom: f32,
    last_zoom_change: std::time::Instant,
    version: u64,
    max_cache_size: usize,
}

impl TileCache {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
            pending_requests: Vec::new(),
            current_zoom: 11.0,
            target_zoom: 11.0,
            last_zoom_change: std::time::Instant::now(),
            version: TILE_CACHE_VERSION.fetch_add(1, Ordering::SeqCst),
            max_cache_size: MAX_CACHE_SIZE,
        }
    }

    pub fn invalidate(&mut self) {
        self.version = TILE_CACHE_VERSION.fetch_add(1, Ordering::SeqCst);
        self.pending_requests.clear();
        log::debug!("Tile cache invalidated, version: {}", self.version);
    }

    pub fn set_target_zoom(&mut self, zoom: f32) {
        if (zoom - self.target_zoom).abs() > 0.01 {
            self.target_zoom = zoom;
            self.last_zoom_change = std::time::Instant::now();
            self.prioritize_pending_requests();
            log::debug!("Target zoom changed to: {:.2}", zoom);
        }
    }

    pub fn set_current_zoom(&mut self, zoom: f32) {
        self.current_zoom = zoom;
    }

    pub fn is_zoom_stable(&self) -> bool {
        self.last_zoom_change.elapsed().as_millis() > 150
    }

    pub fn get(&self, zoom: u8, x: u32, y: u32) -> Option<&TileData> {
        let key = TileKey::new(zoom, x, y);
        self.cache.get(&key).map(|cached| &cached.data)
    }

    pub fn get_mut(&mut self, zoom: u8, x: u32, y: u32) -> Option<&mut TileData> {
        let key = TileKey::new(zoom, x, y);
        self.cache.get_mut(&key).map(|cached| &mut cached.data)
    }

    pub fn insert(&mut self, tile: TileData) {
        if self.cache.len() >= self.max_cache_size {
            self.evict_lowest_priority();
        }

        let key = TileKey::new(tile.zoom, tile.x, tile.y);
        self.cache.insert(
            key,
            CachedTile {
                data: tile,
                zoom: key.zoom,
                timestamp: std::time::Instant::now(),
                used_count: 0,
            },
        );
    }

    pub fn contains(&self, zoom: u8, x: u32, y: u32) -> bool {
        let key = TileKey::new(zoom, x, y);
        self.cache.contains_key(&key)
    }

    pub fn request_tile(&mut self, zoom: u8, x: u32, y: u32, priority: i32) {
        let key = TileKey::new(zoom, x, y);

        if self.cache.contains_key(&key) {
            if let Some(cached) = self.cache.get_mut(&key) {
                cached.used_count = cached.used_count.saturating_add(1);
                cached.timestamp = std::time::Instant::now();
            }
            return;
        }

        if let Some(existing) = self.pending_requests.iter_mut().find(|p| p.key == key) {
            existing.priority = existing.priority.max(priority);
            return;
        }

        self.pending_requests.push(PendingTile {
            key,
            priority,
            request_time: std::time::Instant::now(),
        });
    }

    pub fn get_next_pending(&mut self, max_count: usize) -> Vec<TileKey> {
        self.prioritize_pending_requests();

        let count = max_count.min(self.pending_requests.len());
        let mut result = Vec::with_capacity(count);

        for pending in self.pending_requests.iter().take(count) {
            result.push(pending.key);
        }

        result
    }

    pub fn remove_pending(&mut self, key: TileKey) {
        self.pending_requests.retain(|p| p.key != key);
    }

    pub fn clear_pending(&mut self) {
        self.pending_requests.clear();
    }

    pub fn cancel_outdated_requests(&mut self, current_zoom: f32) {
        let zoom_diff = (current_zoom - self.target_zoom).abs();

        if zoom_diff > 2.0 {
            self.pending_requests.retain(|pending| {
                let tile_zoom = pending.key.zoom as f32;
                (tile_zoom - current_zoom).abs() < 3.0
            });
        }

        self.pending_requests.sort();

        let now = std::time::Instant::now();
        self.pending_requests.retain(|pending| {
            pending.request_time.elapsed().as_secs() < 30
        });

        log::debug!(
            "Pending requests after cleanup: {}",
            self.pending_requests.len()
        );
    }

    pub fn get_visible_tiles(
        &mut self,
        viewport: &MapViewport,
        screen_width: u32,
        screen_height: u32,
    ) -> Vec<TileKey> {
        let zoom = viewport.zoom.round() as u8;
        self.set_target_zoom(viewport.zoom);

        let scale = 2.0f64.powi(zoom as i32 - 11);
        let aspect = screen_width as f64 / screen_height as f64;

        let (center_x, center_y) =
            crate::mbtiles::geo_to_mercator(viewport.center.latitude, viewport.center.longitude);

        let half_height = 1.0 / scale;
        let half_width = half_height * aspect;

        let world_left = center_x - half_width;
        let world_right = center_x + half_width;
        let world_bottom = center_y - half_height;
        let world_top = center_y + half_height;

        let n = 2.0f64.powi(zoom as i32);
        let tile_left = ((world_left + 1.0) * n / 2.0).floor() as i64;
        let tile_right = ((world_right + 1.0) * n / 2.0).ceil() as i64;
        let tile_bottom = ((1.0 - world_top) * n / 2.0).floor() as i64;
        let tile_top = ((1.0 - world_bottom) * n / 2.0).ceil() as i64;

        let mut visible_tiles = Vec::new();
        let max_tile = (1i64 << zoom) - 1;

        let center_tile_x = ((center_x + 1.0) * n / 2.0).round() as i64;
        let center_tile_y = ((1.0 - center_y) * n / 2.0).round() as i64;

        for ty in tile_bottom..=tile_top {
            for tx in tile_left..=tile_right {
                if tx < 0 || ty < 0 || tx > max_tile || ty > max_tile {
                    continue;
                }

                let distance = ((tx - center_tile_x).abs() + (ty - center_tile_y).abs()) as i32;
                let priority = -distance;

                let key = TileKey::new(zoom, tx as u32, ty as u32);
                visible_tiles.push(key);

                if !self.cache.contains_key(&key) {
                    self.request_tile(zoom, tx as u32, ty as u32, priority);
                }
            }
        }

        visible_tiles
    }

    pub fn get_renderable_tiles(
        &mut self,
        viewport: &MapViewport,
    ) -> Vec<&TileData> {
        let zoom = viewport.zoom.round() as u8;
        let mut renderable = Vec::new();

        for (key, cached) in self.cache.iter_mut() {
            if key.zoom == zoom {
                cached.used_count = cached.used_count.saturating_add(1);
                cached.timestamp = std::time::Instant::now();
                renderable.push(&cached.data);
            }
        }

        renderable
    }

    fn prioritize_pending_requests(&mut self) {
        let current_zoom_int = self.current_zoom.round() as i32;
        let target_zoom_int = self.target_zoom.round() as i32;

        for pending in self.pending_requests.iter_mut() {
            let tile_zoom = pending.key.zoom as i32;
            let zoom_diff_target = (tile_zoom - target_zoom_int).abs();
            let zoom_diff_current = (tile_zoom - current_zoom_int).abs();

            let zoom_penalty = if zoom_diff_target <= 1 {
                0
            } else if zoom_diff_target <= 2 {
                -10
            } else {
                -50
            };

            let current_bonus = if zoom_diff_current <= 1 { 5 } else { 0 };

            pending.priority = pending.priority + zoom_penalty + current_bonus;
        }

        self.pending_requests.sort();
    }

    fn evict_lowest_priority(&mut self) {
        let mut oldest_key = None;
        let mut oldest_time = std::time::Instant::now();
        let mut lowest_count = u32::MAX;

        for (key, cached) in &self.cache {
            if cached.used_count < lowest_count
                || (cached.used_count == lowest_count && cached.timestamp < oldest_time)
            {
                oldest_key = Some(*key);
                oldest_time = cached.timestamp;
                lowest_count = cached.used_count;
            }
        }

        if let Some(key) = oldest_key {
            self.cache.remove(&key);
            log::trace!("Evicted tile: z={}, x={}, y={}", key.zoom, key.x, key.y);
        }
    }

    pub fn clear(&mut self) {
        self.cache.clear();
        self.pending_requests.clear();
    }

    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }

    pub fn pending_count(&self) -> usize {
        self.pending_requests.len()
    }

    pub fn version(&self) -> u64 {
        self.version
    }
}

impl Default for TileCache {
    fn default() -> Self {
        Self::new()
    }
}

pub struct TileLoader {
    cache: Arc<Mutex<TileCache>>,
    loading: bool,
}

impl TileLoader {
    pub fn new(cache: Arc<Mutex<TileCache>>) -> Self {
        Self {
            cache,
            loading: false,
        }
    }

    pub fn is_loading(&self) -> bool {
        self.loading
    }

    pub fn update(&mut self) {
        if self.loading {
            return;
        }

        let pending_keys = {
            let mut cache = self.cache.lock().unwrap();
            cache.get_next_pending(4)
        };

        if pending_keys.is_empty() {
            return;
        }

        self.loading = true;

        log::debug!("Loading {} tiles", pending_keys.len());

        self.loading = false;
    }

    pub fn cancel_all(&mut self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear_pending();
        }
        self.loading = false;
    }
}

pub fn create_default_grid_tiles(zoom: u8, center_x: u32, center_y: u32) -> Vec<TileData> {
    let mut tiles = Vec::new();
    let range = 2i32;

    for dy in -range..=range {
        for dx in -range..=range {
            let x = (center_x as i64 + dx as i64) as u32;
            let y = (center_y as i64 + dy as i64) as u32;

            let vertices = create_default_tile_vertices(zoom, x, y);
            let indices = create_default_tile_indices(vertices.len());

            tiles.push(TileData {
                zoom,
                x,
                y,
                vertices,
                indices,
            });
        }
    }

    tiles
}

fn create_default_tile_vertices(zoom: u8, x: u32, y: u32) -> Vec<Vertex> {
    let tile_bounds = crate::mbtiles::tile_to_world_coords(zoom, x, y);

    let (min_x, min_y, max_x, max_y) = tile_bounds;

    let base_color = match (x + y) % 3 {
        0 => [0.95, 0.93, 0.91, 1.0],
        1 => [0.92, 0.90, 0.88, 1.0],
        _ => [0.94, 0.92, 0.90, 1.0],
    };

    let grid_color = [0.85, 0.85, 0.85, 0.5];

    let mut vertices = vec![
        Vertex { position: [min_x as f32, min_y as f32], color: base_color },
        Vertex { position: [max_x as f32, min_y as f32], color: base_color },
        Vertex { position: [max_x as f32, max_y as f32], color: base_color },
        Vertex { position: [min_x as f32, max_y as f32], color: base_color },
    ];

    let grid_lines = 4;
    for i in 1..grid_lines {
        let t = i as f32 / grid_lines as f32;
        let gx = min_x as f32 + (max_x as f32 - min_x as f32) * t;
        let gy = min_y as f32 + (max_y as f32 - min_y as f32) * t;

        vertices.push(Vertex { position: [gx, min_y as f32], color: grid_color });
        vertices.push(Vertex { position: [gx, max_y as f32], color: grid_color });
        vertices.push(Vertex { position: [min_x as f32, gy], color: grid_color });
        vertices.push(Vertex { position: [max_x as f32, gy], color: grid_color });
    }

    vertices
}

fn create_default_tile_indices(vertex_count: usize) -> Vec<u32> {
    let mut indices = vec![0, 1, 2, 0, 2, 3];

    for i in 0..((vertex_count - 4) / 4) {
        let base = 4 + i * 4;
        indices.push(base as u32);
        indices.push((base + 1) as u32);
        indices.push((base + 2) as u32);
        indices.push((base + 3) as u32);
    }

    indices
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tile_cache_insert_and_get() {
        let mut cache = TileCache::new();
        let tile = TileData {
            zoom: 10,
            x: 100,
            y: 200,
            vertices: vec![],
            indices: vec![],
        };

        cache.insert(tile);
        assert!(cache.contains(10, 100, 200));
        assert!(!cache.contains(10, 100, 201));
    }

    #[test]
    fn test_tile_cache_eviction() {
        let mut cache = TileCache::new();
        cache.max_cache_size = 10;

        for i in 0..20 {
            let tile = TileData {
                zoom: 10,
                x: i,
                y: 0,
                vertices: vec![],
                indices: vec![],
            };
            cache.insert(tile);
        }

        assert!(cache.cache_size() <= 10);
    }

    #[test]
    fn test_pending_request_priority() {
        let mut cache = TileCache::new();
        cache.request_tile(10, 0, 0, -5);
        cache.request_tile(10, 1, 0, -10);
        cache.request_tile(10, 2, 0, 0);

        let pending = cache.get_next_pending(3);
        assert_eq!(pending.len(), 3);
    }

    #[test]
    fn test_zoom_stability() {
        let mut cache = TileCache::new();
        assert!(cache.is_zoom_stable());

        cache.set_target_zoom(12.0);
        assert!(!cache.is_zoom_stable());
    }

    #[test]
    fn test_cache_invalidation() {
        let mut cache = TileCache::new();
        let v1 = cache.version();
        cache.invalidate();
        let v2 = cache.version();
        assert_ne!(v1, v2);
    }
}
