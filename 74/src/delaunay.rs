use crate::types::{Mesh, Point, Triangle};
use nalgebra::{Point2, Vector2};
use std::collections::{HashMap, HashSet};

struct DelaunayTriangle {
    v0: usize,
    v1: usize,
    v2: usize,
    circumcenter: Point2<f64>,
    circumradius_sq: f64,
}

impl DelaunayTriangle {
    fn new(points: &[Point2<f64>], v0: usize, v1: usize, v2: usize) -> Self {
        let p0 = points[v0];
        let p1 = points[v1];
        let p2 = points[v2];

        let circumcenter = compute_circumcenter(p0, p1, p2);
        let circumradius_sq = (circumcenter - p0).norm_squared();

        Self {
            v0,
            v1,
            v2,
            circumcenter,
            circumradius_sq,
        }
    }

    fn contains_point(&self, p: Point2<f64>) -> bool {
        (p - self.circumcenter).norm_squared() <= self.circumradius_sq
    }

    fn vertices(&self) -> [usize; 3] {
        [self.v0, self.v1, self.v2]
    }

    fn edges(&self) -> [[usize; 2]; 3] {
        [
            [self.v0, self.v1],
            [self.v1, self.v2],
            [self.v2, self.v0],
        ]
    }
}

fn compute_circumcenter(p0: Point2<f64>, p1: Point2<f64>, p2: Point2<f64>) -> Point2<f64> {
    let d = 2.0 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y));
    
    let ux = ((p0.x * p0.x + p0.y * p0.y) * (p1.y - p2.y) +
              (p1.x * p1.x + p1.y * p1.y) * (p2.y - p0.y) +
              (p2.x * p2.x + p2.y * p2.y) * (p0.y - p1.y)) / d;
    
    let uy = ((p0.x * p0.x + p0.y * p0.y) * (p2.x - p1.x) +
              (p1.x * p1.x + p1.y * p1.y) * (p0.x - p2.x) +
              (p2.x * p2.x + p2.y * p2.y) * (p1.x - p0.x)) / d;
    
    Point2::new(ux, uy)
}

pub fn triangulate(points: &[Point]) -> Vec<Triangle> {
    if points.len() < 3 {
        return Vec::new();
    }

    let mut na_points: Vec<Point2<f64>> = points.iter().map(|p| p.to_nalgebra()).collect();

    let (min_x, max_x, min_y, max_y) = compute_bounding_box(&na_points);
    
    let dx = max_x - min_x;
    let dy = max_y - min_y;
    let delta_max = dx.max(dy);
    let mid_x = (min_x + max_x) / 2.0;
    let mid_y = (min_y + max_y) / 2.0;

    let super_p1 = Point2::new(mid_x - 20.0 * delta_max, mid_y - delta_max);
    let super_p2 = Point2::new(mid_x, mid_y + 20.0 * delta_max);
    let super_p3 = Point2::new(mid_x + 20.0 * delta_max, mid_y - delta_max);

    let n = na_points.len();
    na_points.push(super_p1);
    na_points.push(super_p2);
    na_points.push(super_p3);

    let super_tri = DelaunayTriangle::new(&na_points, n, n + 1, n + 2);
    let mut triangles: Vec<DelaunayTriangle> = vec![super_tri];

    for i in 0..n {
        let p = na_points[i];

        let mut bad_triangles: Vec<usize> = Vec::new();
        for (j, tri) in triangles.iter().enumerate() {
            if tri.contains_point(p) {
                bad_triangles.push(j);
            }
        }

        let mut polygon: Vec<[usize; 2]> = Vec::new();
        for &idx in &bad_triangles {
            let tri = &triangles[idx];
            'edge_loop: for edge in tri.edges() {
                for &other_idx in &bad_triangles {
                    if other_idx == idx {
                        continue;
                    }
                    let other = &triangles[other_idx];
                    if edge_belongs_to_triangle(edge, other) {
                        continue 'edge_loop;
                    }
                }
                polygon.push(edge);
            }
        }

        let mut new_triangles: Vec<DelaunayTriangle> = Vec::new();
        for edge in polygon {
            new_triangles.push(DelaunayTriangle::new(&na_points, edge[0], edge[1], i));
        }

        triangles = triangles.into_iter()
            .enumerate()
            .filter(|(idx, _)| !bad_triangles.contains(idx))
            .map(|(_, tri)| tri)
            .collect();
        
        triangles.extend(new_triangles);
    }

    triangles.into_iter()
        .filter(|tri| {
            tri.v0 < n && tri.v1 < n && tri.v2 < n
        })
        .map(|tri| Triangle::new(tri.v0, tri.v1, tri.v2))
        .collect()
}

fn edge_belongs_to_triangle(edge: [usize; 2], tri: &DelaunayTriangle) -> bool {
    let [a, b] = edge;
    let [v0, v1, v2] = tri.vertices();
    (a == v0 || a == v1 || a == v2) && (b == v0 || b == v1 || b == v2)
}

fn compute_bounding_box(points: &[Point2<f64>]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for p in points {
        min_x = min_x.min(p.x);
        max_x = max_x.max(p.x);
        min_y = min_y.min(p.y);
        max_y = max_y.max(p.y);
    }

    (min_x, max_x, min_y, max_y)
}

pub fn generate_internal_points(polygon: &[Point], density: f64) -> Vec<Point> {
    if polygon.is_empty() {
        return Vec::new();
    }

    let (min_x, max_x, min_y, max_y) = compute_bounding_box(
        &polygon.iter().map(|p| p.to_nalgebra()).collect::<Vec<_>>()
    );

    let mut points: Vec<Point> = polygon.to_vec();
    let step = 1.0 / density.sqrt();

    let mut x = min_x + step;
    while x < max_x {
        let mut y = min_y + step;
        while y < max_y {
            let p = Point::new(x, y);
            if is_point_inside_polygon(p, polygon) {
                points.push(p);
            }
            y += step;
        }
        x += step;
    }

    points
}

fn is_point_inside_polygon(point: Point, polygon: &[Point]) -> bool {
    let mut inside = false;
    let n = polygon.len();
    
    for i in 0..n {
        let j = (i + 1) % n;
        let vi = polygon[i];
        let vj = polygon[j];
        
        if ((vi.y > point.y) != (vj.y > point.y)) &&
           (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x) {
            inside = !inside;
        }
    }
    
    inside
}

pub fn find_boundary_nodes(mesh: &Mesh, polygon: &[Point]) -> Vec<usize> {
    let mut boundary = Vec::new();
    let threshold = 1e-6;
    
    for (idx, point) in mesh.points.iter().enumerate() {
        if is_point_on_polygon_boundary(*point, polygon, threshold) {
            boundary.push(idx);
        }
    }
    
    boundary
}

fn is_point_on_polygon_boundary(point: Point, polygon: &[Point], threshold: f64) -> bool {
    let n = polygon.len();
    
    for i in 0..n {
        let j = (i + 1) % n;
        let p1 = polygon[i];
        let p2 = polygon[j];
        
        let dist = point_to_segment_distance(point, p1, p2);
        if dist < threshold {
            return true;
        }
    }
    
    false
}

fn point_to_segment_distance(p: Point, a: Point, b: Point) -> f64 {
    let ab = Vector2::new(b.x - a.x, b.y - a.y);
    let ap = Vector2::new(p.x - a.x, p.y - a.y);
    
    let proj = ap.dot(&ab) / ab.dot(&ab);
    let proj_clamped = proj.max(0.0).min(1.0);
    
    let closest = Vector2::new(a.x + proj_clamped * ab.x, a.y + proj_clamped * ab.y);
    let dist = Vector2::new(p.x - closest.x, p.y - closest.y);
    
    dist.norm()
}

pub fn compute_triangle_quality(points: &[Point], tri: &Triangle) -> (f64, f64, f64) {
    let p0 = points[tri.v0].to_nalgebra();
    let p1 = points[tri.v1].to_nalgebra();
    let p2 = points[tri.v2].to_nalgebra();

    let a = (p1 - p0).norm();
    let b = (p2 - p1).norm();
    let c = (p0 - p2).norm();

    let s = (a + b + c) / 2.0;
    let area = (s * (s - a) * (s - b) * (s - c)).max(0.0).sqrt();

    let mut angles = [
        compute_angle(b, c, a),
        compute_angle(a, c, b),
        compute_angle(a, b, c),
    ];

    let min_angle = angles.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_angle = angles.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    let quality = if (a * b * c) > 1e-12 {
        4.0 * std::f64::consts::SQRT_3 * area / (a * a + b * b + c * c)
    } else {
        0.0
    };

    (min_angle, max_angle, quality)
}

fn compute_angle(a_side: f64, b_side: f64, c_side: f64) -> f64 {
    let cos_c = (a_side * a_side + b_side * b_side - c_side * c_side) / (2.0 * a_side * b_side);
    cos_c.clamp(-1.0, 1.0).acos() * 180.0 / std::f64::consts::PI
}

pub fn find_bad_elements(mesh: &Mesh, min_angle_threshold: f64) -> Vec<usize> {
    let mut bad = Vec::new();
    for (i, tri) in mesh.triangles.iter().enumerate() {
        let (min_angle, _, _) = compute_triangle_quality(&mesh.points, tri);
        if min_angle < min_angle_threshold {
            bad.push(i);
        }
    }
    bad
}

pub fn build_adjacency(mesh: &Mesh) -> HashMap<[usize; 2], Vec<usize>> {
    let mut edge_map: HashMap<[usize; 2], Vec<usize>> = HashMap::new();

    for (tri_idx, tri) in mesh.triangles.iter().enumerate() {
        let edges = [
            [tri.v0, tri.v1],
            [tri.v1, tri.v2],
            [tri.v2, tri.v0],
        ];

        for mut edge in edges {
            if edge[0] > edge[1] {
                edge.swap(0, 1);
            }
            edge_map.entry(edge).or_insert_with(Vec::new).push(tri_idx);
        }
    }

    edge_map
}

pub fn laplacian_smooth(
    mesh: &mut Mesh,
    polygon: &[Point],
    iterations: usize,
    relaxation: f64,
) {
    let n = mesh.points.len();
    let is_boundary: HashSet<usize> = mesh.boundary_nodes.iter().cloned().collect();

    let mut adjacency: Vec<HashSet<usize>> = (0..n).map(|_| HashSet::new()).collect();
    for tri in &mesh.triangles {
        let [v0, v1, v2] = tri.vertices();
        adjacency[v0].insert(v1);
        adjacency[v0].insert(v2);
        adjacency[v1].insert(v0);
        adjacency[v1].insert(v2);
        adjacency[v2].insert(v0);
        adjacency[v2].insert(v1);
    }

    for _ in 0..iterations {
        let mut new_positions: Vec<Option<Point2<f64>>> = (0..n).map(|_| None).collect();

        for i in 0..n {
            if is_boundary.contains(&i) {
                continue;
            }

            let neighbors = &adjacency[i];
            if neighbors.is_empty() {
                continue;
            }

            let mut sum_x = 0.0;
            let mut sum_y = 0.0;

            for &j in neighbors {
                sum_x += mesh.points[j].x;
                sum_y += mesh.points[j].y;
            }

            let avg_x = sum_x / neighbors.len() as f64;
            let avg_y = sum_y / neighbors.len() as f64;

            let old_x = mesh.points[i].x;
            let old_y = mesh.points[i].y;

            let new_x = old_x + relaxation * (avg_x - old_x);
            let new_y = old_y + relaxation * (avg_y - old_y);

            let candidate = Point::new(new_x, new_y);
            if is_point_inside_polygon(candidate, polygon) {
                new_positions[i] = Some(Point2::new(new_x, new_y));
            }
        }

        for i in 0..n {
            if let Some(pos) = new_positions[i] {
                mesh.points[i].x = pos.x;
                mesh.points[i].y = pos.y;
            }
        }
    }
}

pub fn edge_flip(mesh: &mut Mesh) -> usize {
    let mut flips = 0;
    let edge_map = build_adjacency(mesh);

    let mut edges_to_flip: Vec<([usize; 2], usize, usize)> = Vec::new();

    for (edge, tris) in &edge_map {
        if tris.len() == 2 {
            let t0 = tris[0];
            let t1 = tris[1];

            let tri0 = &mesh.triangles[t0];
            let tri1 = &mesh.triangles[t1];

            let [a, b] = edge;

            let other0 = find_opposite_vertex(tri0, a, b);
            let other1 = find_opposite_vertex(tri1, a, b);

            if let (Some(c), Some(d)) = (other0, other1) {
                if would_improve_quality(mesh, a, b, c, d) {
                    edges_to_flip.push((*edge, t0, t1));
                }
            }
        }
    }

    for (edge, t0, t1) in edges_to_flip {
        let [a, b] = edge;
        let c = find_opposite_vertex(&mesh.triangles[t0], a, b).unwrap();
        let d = find_opposite_vertex(&mesh.triangles[t1], a, b).unwrap();

        mesh.triangles[t0] = Triangle::new(a, c, d);
        mesh.triangles[t1] = Triangle::new(b, d, c);

        flips += 1;
    }

    flips
}

fn find_opposite_vertex(tri: &Triangle, a: usize, b: usize) -> Option<usize> {
    let [v0, v1, v2] = tri.vertices();
    if v0 != a && v0 != b {
        return Some(v0);
    }
    if v1 != a && v1 != b {
        return Some(v1);
    }
    if v2 != a && v2 != b {
        return Some(v2);
    }
    None
}

fn would_improve_quality(
    mesh: &Mesh,
    a: usize,
    b: usize,
    c: usize,
    d: usize,
) -> bool {
    let p_a = mesh.points[a].to_nalgebra();
    let p_b = mesh.points[b].to_nalgebra();
    let p_c = mesh.points[c].to_nalgebra();
    let p_d = mesh.points[d].to_nalgebra();

    let old_angles_before = min_angle_three(p_a, p_b, p_c);
    let old_angles_after = min_angle_three(p_b, p_a, p_d);
    let old_min = old_angles_before.min(old_angles_after);

    let new_min1 = min_angle_three(p_a, p_c, p_d);
    let new_min2 = min_angle_three(p_b, p_d, p_c);
    let new_min = new_min1.min(new_min2);

    new_min > old_min + 0.5
}

fn min_angle_three(p0: Point2<f64>, p1: Point2<f64>, p2: Point2<f64>) -> f64 {
    let a = (p1 - p0).norm();
    let b = (p2 - p1).norm();
    let c = (p0 - p2).norm();

    if a < 1e-12 || b < 1e-12 || c < 1e-12 {
        return 0.0;
    }

    let angles = [
        compute_angle(b, c, a),
        compute_angle(a, c, b),
        compute_angle(a, b, c),
    ];

    angles.iter().cloned().fold(f64::INFINITY, f64::min)
}

pub fn optimize_mesh(
    mesh: &mut Mesh,
    polygon: &[Point],
    min_angle_threshold: f64,
    max_iterations: usize,
) {
    let mut iteration = 0;
    let mut last_bad_count = usize::MAX;

    while iteration < max_iterations {
        let bad = find_bad_elements(mesh, min_angle_threshold);
        if bad.is_empty() {
            break;
        }

        if bad.len() >= last_bad_count && iteration > 5 {
            break;
        }
        last_bad_count = bad.len();

        laplacian_smooth(mesh, polygon, 5, 0.5);

        let _ = edge_flip(mesh);

        iteration += 1;
    }
}

pub fn generate_optimized_mesh(
    polygon: &[Point],
    density: f64,
    min_angle_threshold: f64,
) -> Mesh {
    let all_points = generate_internal_points(polygon, density);
    let triangles = triangulate(&all_points);

    let mut mesh = Mesh::new();
    mesh.points = all_points.clone();
    mesh.triangles = triangles;
    mesh.boundary_nodes = find_boundary_nodes(&mesh, polygon);

    optimize_mesh(&mut mesh, polygon, min_angle_threshold, 50);

    mesh.boundary_nodes = find_boundary_nodes(&mesh, polygon);

    mesh
}

