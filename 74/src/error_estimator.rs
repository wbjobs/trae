use crate::types::{Mesh, Point, Triangle};
use nalgebra::{Point2, Vector2};
use std::collections::HashMap;

pub struct ElementError {
    pub element_index: usize,
    pub error_norm: f64,
    pub relative_error: f64,
}

pub struct ErrorEstimationResult {
    pub element_errors: Vec<ElementError>,
    pub global_error: f64,
    pub global_relative_error: f64,
    pub elements_to_refine: Vec<usize>,
}

pub fn estimate_error(
    mesh: &Mesh,
    solution: &[f64],
    refine_fraction: f64,
) -> ErrorEstimationResult {
    let n_nodes = mesh.num_nodes();
    let n_elements = mesh.num_elements();

    let gradients = compute_element_gradients(mesh, solution);

    let recovered_gradients = recover_gradients(mesh, &gradients);

    let mut element_errors = Vec::with_capacity(n_elements);
    let mut total_error_sq = 0.0;
    let mut total_solution_norm_sq = 0.0;

    for (i, tri) in mesh.triangles.iter().enumerate() {
        let [v0, v1, v2] = tri.vertices();
        let p0 = mesh.points[v0].to_nalgebra();
        let p1 = mesh.points[v1].to_nalgebra();
        let p2 = mesh.points[v2].to_nalgebra();

        let area = compute_triangle_area(p0, p1, p2);

        let grad_u = gradients[i];

        let g0 = recovered_gradients[v0];
        let g1 = recovered_gradients[v1];
        let g2 = recovered_gradients[v2];

        let (grad_star_u, _) = compute_element_gradient_from_nodes(p0, p1, p2, g0, g1, g2);

        let error = grad_u - grad_star_u;
        let error_norm = error.norm() * area.sqrt();

        total_error_sq += error_norm * error_norm;

        let u0 = solution[v0];
        let u1 = solution[v1];
        let u2 = solution[v2];
        let avg_u = (u0 + u1 + u2) / 3.0;
        total_solution_norm_sq += avg_u * avg_u * area;
    }

    let global_error = total_error_sq.sqrt();
    let global_relative_error = if total_solution_norm_sq > 0.0 {
        global_error / total_solution_norm_sq.sqrt()
    } else {
        global_error
    };

    let mut errors: Vec<ElementError> = mesh.triangles.iter().enumerate().map(|(i, tri)| {
        let [v0, v1, v2] = tri.vertices();
        let p0 = mesh.points[v0].to_nalgebra();
        let p1 = mesh.points[v1].to_nalgebra();
        let p2 = mesh.points[v2].to_nalgebra();

        let area = compute_triangle_area(p0, p1, p2);

        let grad_u = gradients[i];

        let g0 = recovered_gradients[v0];
        let g1 = recovered_gradients[v1];
        let g2 = recovered_gradients[v2];

        let (grad_star_u, _) = compute_element_gradient_from_nodes(p0, p1, p2, g0, g1, g2);

        let error = grad_u - grad_star_u;
        let error_norm = error.norm() * area.sqrt();

        let relative_error = if global_error > 0.0 {
            error_norm / global_error
        } else {
            0.0
        };

        ElementError {
            element_index: i,
            error_norm,
            relative_error,
        }
    }).collect();

    errors.sort_by(|a, b| b.error_norm.partial_cmp(&a.error_norm).unwrap());

    let n_to_refine = (n_elements as f64 * refine_fraction).round() as usize;
    let n_to_refine = n_to_refine.max(1).min(n_elements);

    let elements_to_refine: Vec<usize> = errors.iter()
        .take(n_to_refine)
        .map(|e| e.element_index)
        .collect();

    ErrorEstimationResult {
        element_errors: errors,
        global_error,
        global_relative_error,
        elements_to_refine,
    }
}

fn compute_element_gradients(
    mesh: &Mesh,
    solution: &[f64],
) -> Vec<Vector2<f64>> {
    let mut gradients = Vec::with_capacity(mesh.triangles.len());

    for tri in &mesh.triangles {
        let [v0, v1, v2] = tri.vertices();
        let p0 = mesh.points[v0].to_nalgebra();
        let p1 = mesh.points[v1].to_nalgebra();
        let p2 = mesh.points[v2].to_nalgebra();

        let u0 = solution[v0];
        let u1 = solution[v1];
        let u2 = solution[v2];

        let (grad, _) = compute_element_gradient(p0, p1, p2, u0, u1, u2);
        gradients.push(grad);
    }

    gradients
}

fn compute_element_gradient(
    p0: Point2<f64>,
    p1: Point2<f64>,
    p2: Point2<f64>,
    u0: f64,
    u1: f64,
    u2: f64,
) -> (Vector2<f64>, f64) {
    let area = compute_triangle_area(p0, p1, p2);

    if area < 1e-12 {
        return (Vector2::new(0.0, 0.0), 0.0);
    }

    let b = Vector2::new(p1.y - p2.y, p2.y - p0.y);
    let c = Vector2::new(p2.x - p1.x, p0.x - p2.x);

    let grad = (b * (u0 - u2) + c * (u0 - u1)) / (2.0 * area);

    (grad, area)
}

fn compute_element_gradient_from_nodes(
    p0: Point2<f64>,
    p1: Point2<f64>,
    p2: Point2<f64>,
    g0: Vector2<f64>,
    g1: Vector2<f64>,
    g2: Vector2<f64>,
) -> (Vector2<f64>, f64) {
    let area = compute_triangle_area(p0, p1, p2);

    if area < 1e-12 {
        return (Vector2::new(0.0, 0.0), 0.0);
    }

    let grad = (g0 + g1 + g2) / 3.0;

    (grad, area)
}

fn recover_gradients(
    mesh: &Mesh,
    element_gradients: &[Vector2<f64>],
) -> Vec<Vector2<f64>> {
    let n_nodes = mesh.num_nodes();
    let mut recovered_gradients: Vec<Vector2<f64>> = (0..n_nodes).map(|_| Vector2::new(0.0, 0.0)).collect();
    let mut weights: Vec<f64> = vec![0.0; n_nodes];

    for (i, tri) in mesh.triangles.iter().enumerate() {
        let [v0, v1, v2] = tri.vertices();
        let p0 = mesh.points[v0].to_nalgebra();
        let p1 = mesh.points[v1].to_nalgebra();
        let p2 = mesh.points[v2].to_nalgebra();

        let area = compute_triangle_area(p0, p1, p2);
        let grad = element_gradients[i];

        recovered_gradients[v0] += grad * area;
        recovered_gradients[v1] += grad * area;
        recovered_gradients[v2] += grad * area;

        weights[v0] += area;
        weights[v1] += area;
        weights[v2] += area;
    }

    for i in 0..n_nodes {
        if weights[i] > 0.0 {
            recovered_gradients[i] /= weights[i];
        }
    }

    recovered_gradients
}

fn compute_triangle_area(p0: Point2<f64>, p1: Point2<f64>, p2: Point2<f64>) -> f64 {
    0.5 * ((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)).abs()
}

pub fn adaptive_solve(
    mesh: &Mesh,
    boundary_values: &[f64],
    rhs_value: f64,
    max_iterations: usize,
    cg_tolerance: f64,
    target_error: f64,
    max_adaptive_steps: usize,
    refine_fraction: f64,
) -> Vec<AdaptiveStep> {
    let mut steps = Vec::new();
    let mut current_mesh = mesh.clone();
    let mut current_boundary_values = boundary_values.to_vec();

    for step in 0..max_adaptive_steps {
        let (mut rows, mut cols, mut values) = crate::fem::compute_stiffness_matrix(&current_mesh);

        let f = |_p: Point| rhs_value;
        let mut rhs = crate::fem::compute_load_vector(&current_mesh, f);

        let boundary_nodes: Vec<usize> = current_mesh.boundary_nodes.clone();
        crate::fem::apply_boundary_conditions(
            &mut rows,
            &mut cols,
            &mut values,
            &mut rhs,
            &boundary_nodes,
            &current_boundary_values,
        );

        let solution = crate::solver::conjugate_gradient(
            &rows,
            &cols,
            &values,
            &rhs,
            max_iterations,
            cg_tolerance,
        );

        let error_result = estimate_error(&current_mesh, &solution, refine_fraction);

        steps.push(AdaptiveStep {
            step,
            mesh: current_mesh.clone(),
            solution: solution.clone(),
            rhs: rhs.clone(),
            global_error: error_result.global_error,
            global_relative_error: error_result.global_relative_error,
            element_errors: error_result.element_errors.iter().map(|e| (e.element_index, e.error_norm)).collect(),
            elements_to_refine: error_result.elements_to_refine.clone(),
        });

        if error_result.global_relative_error < target_error {
            break;
        }

        if step < max_adaptive_steps - 1 {
            let (new_mesh, bc_map) = refine_mesh(&current_mesh, &error_result.elements_to_refine);

            let mut new_bc = vec![0.0; new_mesh.boundary_nodes.len()];
            for (i, &node_idx) in new_mesh.boundary_nodes.iter().enumerate() {
                if node_idx < current_boundary_values.len() {
                    let old_idx = bc_map.get(&node_idx).copied().unwrap_or(node_idx);
                    if old_idx < current_boundary_values.len() {
                        new_bc[i] = current_boundary_values[old_idx];
                    }
                }
            }

            current_mesh = new_mesh;
            current_boundary_values = new_bc;
        }
    }

    steps
}

pub struct AdaptiveStep {
    pub step: usize,
    pub mesh: Mesh,
    pub solution: Vec<f64>,
    pub rhs: Vec<f64>,
    pub global_error: f64,
    pub global_relative_error: f64,
    pub element_errors: Vec<(usize, f64)>,
    pub elements_to_refine: Vec<usize>,
}

pub fn refine_mesh(
    mesh: &Mesh,
    elements_to_refine: &[usize],
) -> (Mesh, HashMap<usize, usize>) {
    let mut new_points = mesh.points.clone();
    let mut new_triangles = Vec::new();
    let mut node_map = HashMap::new();

    let mut edge_midpoints: HashMap<[usize; 2], usize> = HashMap::new();

    for (i, tri) in mesh.triangles.iter().enumerate() {
        let [v0, v1, v2] = tri.vertices();

        if elements_to_refine.contains(&i) {
            let e01 = get_or_create_midpoint(v0, v1, &mut edge_midpoints, &mut new_points, mesh);
            let e12 = get_or_create_midpoint(v1, v2, &mut edge_midpoints, &mut new_points, mesh);
            let e20 = get_or_create_midpoint(v2, v0, &mut edge_midpoints, &mut new_points, mesh);

            new_triangles.push(Triangle::new(v0, e01, e20));
            new_triangles.push(Triangle::new(e01, v1, e12));
            new_triangles.push(Triangle::new(e20, e12, v2));
            new_triangles.push(Triangle::new(e01, e12, e20));
        } else {
            new_triangles.push(Triangle::new(v0, v1, v2));
        }
    }

    let old_boundary_set: HashSet<usize> = mesh.boundary_nodes.iter().cloned().collect();
    let mut new_boundary_nodes = Vec::new();
    let mut processed = HashSet::new();

    for (idx, point) in new_points.iter().enumerate() {
        if idx < mesh.points.len() {
            if old_boundary_set.contains(&idx) {
                new_boundary_nodes.push(idx);
            }
        } else {
            for (edge, &mid_idx) in &edge_midpoints {
                if mid_idx == idx {
                    let [a, b] = edge;
                    if old_boundary_set.contains(a) && old_boundary_set.contains(b) {
                        if !processed.contains(&idx) {
                            new_boundary_nodes.push(idx);
                            processed.insert(idx);
                        }
                        break;
                    }
                }
            }
        }
    }

    let mut refined_mesh = Mesh::new();
    refined_mesh.points = new_points;
    refined_mesh.triangles = new_triangles;
    refined_mesh.boundary_nodes = new_boundary_nodes;

    (refined_mesh, node_map)
}

fn get_or_create_midpoint(
    a: usize,
    b: usize,
    edge_midpoints: &mut HashMap<[usize; 2], usize>,
    points: &mut Vec<Point>,
    mesh: &Mesh,
) -> usize {
    let key = if a < b { [a, b] } else { [b, a] };

    if let Some(&idx) = edge_midpoints.get(&key) {
        return idx;
    }

    let pa = mesh.points[a];
    let pb = mesh.points[b];
    let mid = Point::new((pa.x + pb.x) / 2.0, (pa.y + pb.y) / 2.0);

    let idx = points.len();
    points.push(mid);
    edge_midpoints.insert(key, idx);

    idx
}

use std::collections::HashSet;
