use p2p_cdn_common::{BandwidthInfo, GeoLocation};

const EARTH_RADIUS_KM: f64 = 6371.0;

pub fn calculate_node_score(
    bandwidth: &BandwidthInfo,
    location: &GeoLocation,
    client_location: Option<&GeoLocation>,
) -> f64 {
    let bandwidth_score = calculate_bandwidth_score(bandwidth);
    let latency_score = calculate_latency_score(bandwidth.latency_ms);
    let location_score = if let Some(client_loc) = client_location {
        calculate_location_score(location, client_loc)
    } else {
        1.0
    };

    bandwidth_score * 0.4 + latency_score * 0.3 + location_score * 0.3
}

fn calculate_bandwidth_score(bandwidth: &BandwidthInfo) -> f64 {
    let upload_mbps = bandwidth.upload_speed as f64 / 1_000_000.0;
    let download_mbps = bandwidth.download_speed as f64 / 1_000_000.0;

    let upload_score = (upload_mbps / 100.0).min(1.0);
    let download_score = (download_mbps / 100.0).min(1.0);

    (upload_score + download_score) / 2.0
}

fn calculate_latency_score(latency_ms: u32) -> f64 {
    if latency_ms == 0 {
        return 1.0;
    }
    let latency = latency_ms as f64;
    (1.0 - (latency / 500.0).min(1.0)).max(0.0)
}

fn calculate_location_score(node_loc: &GeoLocation, client_loc: &GeoLocation) -> f64 {
    let distance = haversine_distance(node_loc, client_loc);
    let max_distance = 20000.0;
    (1.0 - (distance / max_distance).min(1.0)).max(0.0)
}

fn haversine_distance(a: &GeoLocation, b: &GeoLocation) -> f64 {
    let lat1 = a.lat.to_radians();
    let lat2 = b.lat.to_radians();
    let delta_lat = (b.lat - a.lat).to_radians();
    let delta_lon = (b.lon - a.lon).to_radians();

    let a_val = (delta_lat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (delta_lon / 2.0).sin().powi(2);
    let c_val = 2.0 * a_val.sqrt().asin();

    EARTH_RADIUS_KM * c_val
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bandwidth_score() {
        let bw = BandwidthInfo {
            upload_speed: 50_000_000,
            download_speed: 100_000_000,
            latency_ms: 50,
        };
        let score = calculate_bandwidth_score(&bw);
        assert!((0.0..=1.0).contains(&score));
    }

    #[test]
    fn test_latency_score() {
        assert_eq!(calculate_latency_score(0), 1.0);
        assert_eq!(calculate_latency_score(500), 0.0);
        assert!(calculate_latency_score(100) > 0.5);
    }

    #[test]
    fn test_haversine_distance() {
        let beijing = GeoLocation {
            lat: 39.9042,
            lon: 116.4074,
            city: Some("Beijing".into()),
            country: Some("CN".into()),
        };
        let shanghai = GeoLocation {
            lat: 31.2304,
            lon: 121.4737,
            city: Some("Shanghai".into()),
            country: Some("CN".into()),
        };
        let distance = haversine_distance(&beijing, &shanghai);
        assert!(distance > 1000.0 && distance < 1500.0);
    }

    #[test]
    fn test_total_score() {
        let bw = BandwidthInfo {
            upload_speed: 100_000_000,
            download_speed: 100_000_000,
            latency_ms: 20,
        };
        let loc = GeoLocation {
            lat: 39.9042,
            lon: 116.4074,
            city: None,
            country: None,
        };
        let score = calculate_node_score(&bw, &loc, None);
        assert!((0.0..=1.0).contains(&score));
    }
}
