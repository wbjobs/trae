use crate::types::{GeoCoordinate, MapViewport, MAX_ZOOM, MAX_TILT, MIN_ZOOM, MIN_TILT};

pub struct MapController {
    viewport: MapViewport,
    min_zoom: f32,
    max_zoom: f32,
    min_tilt: f32,
    max_tilt: f32,
}

impl MapController {
    pub fn new() -> Self {
        Self {
            viewport: MapViewport::default(),
            min_zoom: MIN_ZOOM,
            max_zoom: MAX_ZOOM,
            min_tilt: MIN_TILT,
            max_tilt: MAX_TILT,
        }
    }

    pub fn get_viewport(&self) -> &MapViewport {
        &self.viewport
    }

    pub fn set_viewport(&mut self, viewport: MapViewport) {
        self.viewport = viewport;
        self.clamp_viewport();
    }

    pub fn set_center(&mut self, coordinate: GeoCoordinate) {
        self.viewport.center = coordinate;
    }

    pub fn get_center(&self) -> GeoCoordinate {
        self.viewport.center
    }

    pub fn set_zoom(&mut self, zoom: f32) {
        self.viewport.zoom = zoom.clamp(self.min_zoom, self.max_zoom);
    }

    pub fn get_zoom(&self) -> f32 {
        self.viewport.zoom
    }

    pub fn zoom_by(&mut self, delta: f32) {
        self.viewport.zoom = (self.viewport.zoom + delta).clamp(self.min_zoom, self.max_zoom);
    }

    pub fn zoom_to(&mut self, zoom: f32, focus_point: Option<GeoCoordinate>) {
        if let Some(focus) = focus_point {
            let scale = 2.0f32.powf(zoom - self.viewport.zoom);
            let new_lat = self.viewport.center.latitude
                + (focus.latitude - self.viewport.center.latitude) * (1.0 - 1.0 / scale as f64);
            let new_lon = self.viewport.center.longitude
                + (focus.longitude - self.viewport.center.longitude) * (1.0 - 1.0 / scale as f64);
            self.viewport.center = GeoCoordinate::new(new_lat, new_lon);
        }
        self.viewport.zoom = zoom.clamp(self.min_zoom, self.max_zoom);
    }

    pub fn set_rotation(&mut self, rotation: f32) {
        self.viewport.rotation = normalize_angle(rotation);
    }

    pub fn get_rotation(&self) -> f32 {
        self.viewport.rotation
    }

    pub fn rotate_by(&mut self, delta: f32) {
        self.viewport.rotation = normalize_angle(self.viewport.rotation + delta);
    }

    pub fn set_tilt(&mut self, tilt: f32) {
        self.viewport.tilt = tilt.clamp(self.min_tilt, self.max_tilt);
    }

    pub fn get_tilt(&self) -> f32 {
        self.viewport.tilt
    }

    pub fn tilt_by(&mut self, delta: f32) {
        self.viewport.tilt = (self.viewport.tilt + delta).clamp(self.min_tilt, self.max_tilt);
    }

    pub fn pan_by(&mut self, dx: f64, dy: f64) {
        let scale = 2.0f64.powi(self.viewport.zoom as i32 - 11);
        let factor = 1.0 / scale / 256.0;

        self.viewport.center.latitude -= dy * factor;
        self.viewport.center.longitude += dx * factor;
    }

    pub fn pan_to(&mut self, coordinate: GeoCoordinate) {
        self.viewport.center = coordinate;
    }

    pub fn reset(&mut self) {
        self.viewport = MapViewport::default();
    }

    fn clamp_viewport(&mut self) {
        self.viewport.zoom = self.viewport.zoom.clamp(self.min_zoom, self.max_zoom);
        self.viewport.tilt = self.viewport.tilt.clamp(self.min_tilt, self.max_tilt);
        self.viewport.rotation = normalize_angle(self.viewport.rotation);
    }

    pub fn screen_to_geo(
        &self,
        screen_x: f32,
        screen_y: f32,
        screen_width: f32,
        screen_height: f32,
    ) -> GeoCoordinate {
        let scale = 2.0f32.powf(self.viewport.zoom - 11.0);
        let aspect = screen_width / screen_height;

        let center = &self.viewport.center;
        let (cx, cy) = crate::mbtiles::geo_to_mercator(center.latitude, center.longitude);

        let half_height = 1.0 / scale;
        let half_width = half_height * aspect;

        let rotation = self.viewport.rotation.to_radians();
        let (sin_r, cos_r) = rotation.sin_cos();

        let ndc_x = (screen_x / screen_width) * 2.0 - 1.0;
        let ndc_y = 1.0 - (screen_y / screen_height) * 2.0;

        let world_x = ndc_x * half_width;
        let world_y = ndc_y * half_height;

        let rotated_x = world_x * cos_r - world_y * sin_r;
        let rotated_y = world_x * sin_r + world_y * cos_r;

        let mercator_x = cx as f32 + rotated_x;
        let mercator_y = cy as f32 + rotated_y;

        crate::mbtiles::mercator_to_geo(mercator_x as f64, mercator_y as f64)
    }
}

impl Default for MapController {
    fn default() -> Self {
        Self::new()
    }
}

fn normalize_angle(angle: f32) -> f32 {
    let mut a = angle % 360.0;
    if a > 180.0 {
        a -= 360.0;
    }
    if a < -180.0 {
        a += 360.0;
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zoom_clamping() {
        let mut controller = MapController::new();
        controller.set_zoom(20.0);
        assert!((controller.get_zoom() - MAX_ZOOM).abs() < f32::EPSILON);

        controller.set_zoom(1.0);
        assert!((controller.get_zoom() - MIN_ZOOM).abs() < f32::EPSILON);
    }

    #[test]
    fn test_tilt_clamping() {
        let mut controller = MapController::new();
        controller.set_tilt(70.0);
        assert!((controller.get_tilt() - MAX_TILT).abs() < f32::EPSILON);

        controller.set_tilt(-10.0);
        assert!((controller.get_tilt() - MIN_TILT).abs() < f32::EPSILON);
    }

    #[test]
    fn test_rotation_normalization() {
        let mut controller = MapController::new();
        controller.set_rotation(400.0);
        assert!((controller.get_rotation() - 40.0).abs() < f32::EPSILON);

        controller.set_rotation(-200.0);
        assert!((controller.get_rotation() - 160.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_pan() {
        let mut controller = MapController::new();
        let initial = controller.get_center();
        controller.pan_by(0.0, 0.0);
        let after = controller.get_center();
        assert!((initial.latitude - after.latitude).abs() < f64::EPSILON);
    }
}
