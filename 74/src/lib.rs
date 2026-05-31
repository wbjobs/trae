use napi_derive::napi;
use serde::{Deserialize, Serialize};

pub mod types;
pub mod delaunay;
pub mod svg_parser;
pub mod fem;
pub mod solver;
pub mod vtk_writer;
pub mod error_estimator;

use types::{Mesh, Point, PoissonResult};

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPoint {
    pub x: f64,
    pub y: f64,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsTriangle {
    pub v0: i64,
    pub v1: i64,
    pub v2: i64,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsMesh {
    pub points: Vec<JsPoint>,
    pub triangles: Vec<JsTriangle>,
    pub boundary_nodes: Vec<i64>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPoissonResult {
    pub mesh: JsMesh,
    pub solution: Vec<f64>,
    pub rhs: Vec<f64>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverConfig {
    pub max_iterations: i64,
    pub tolerance: f64,
    pub point_density: f64,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshQuality {
    pub min_angle: f64,
    pub max_angle: f64,
    pub avg_quality: f64,
    pub min_quality: f64,
    pub bad_element_count: i64,
    pub total_elements: i64,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshWithQuality {
    pub mesh: JsMesh,
    pub quality: MeshQuality,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveStep {
    pub step: i64,
    pub mesh: JsMesh,
    pub solution: Vec<f64>,
    pub rhs: Vec<f64>,
    pub global_error: f64,
    pub global_relative_error: f64,
    pub element_errors: Vec<ElementError>,
    pub elements_to_refine: Vec<i64>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementError {
    pub element_index: i64,
    pub error_norm: f64,
    pub relative_error: f64,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveConfig {
    pub max_iterations: i64,
    pub cg_tolerance: f64,
    pub target_error: f64,
    pub max_adaptive_steps: i64,
    pub refine_fraction: f64,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveResult {
    pub steps: Vec<AdaptiveStep>,
    pub converged: bool,
    pub final_step: i64,
}

#[napi]
pub fn estimate_mesh_error(
    mesh: JsMesh,
    solution: Vec<f64>,
    refine_fraction: f64,
) -> Vec<ElementError> {
    let rust_mesh = js_mesh_to_mesh(&mesh);
    let result = error_estimator::estimate_error(&rust_mesh, &solution, refine_fraction);
    
    result.element_errors.iter().map(|e| ElementError {
        element_index: e.element_index as i64,
        error_norm: e.error_norm,
        relative_error: e.relative_error,
    }).collect()
}

#[napi]
pub fn adaptive_solve_poisson(
    mesh: JsMesh,
    boundary_values: Vec<f64>,
    rhs_value: f64,
    config: AdaptiveConfig,
) -> AdaptiveResult {
    let rust_mesh = js_mesh_to_mesh(&mesh);
    
    let steps = error_estimator::adaptive_solve(
        &rust_mesh,
        &boundary_values,
        rhs_value,
        config.max_iterations as usize,
        config.cg_tolerance,
        config.target_error,
        config.max_adaptive_steps as usize,
        config.refine_fraction,
    );
    
    let converged = if let Some(last) = steps.last() {
        last.global_relative_error < config.target_error
    } else {
        false
    };
    
    let js_steps: Vec<AdaptiveStep> = steps.iter().map(|step_to_js).collect();
    
    AdaptiveResult {
        steps: js_steps,
        converged,
        final_step: (steps.len() as i64) - 1,
    }
}

fn step_to_js(step: &error_estimator::AdaptiveStep) -> AdaptiveStep {
    AdaptiveStep {
        step: step.step as i64,
        mesh: mesh_to_js_mesh(&step.mesh),
        solution: step.solution.clone(),
        rhs: step.rhs.clone(),
        global_error: step.global_error,
        global_relative_error: step.global_relative_error,
        element_errors: step.element_errors.iter().map(|(idx, err)| ElementError {
            element_index: *idx as i64,
            error_norm: *err,
            relative_error: if step.global_error > 0.0 {
                err / step.global_error
            } else {
                0.0
            },
        }).collect(),
        elements_to_refine: step.elements_to_refine.iter().map(|&x| x as i64).collect(),
    }
}

#[napi]
pub fn parse_svg_path_to_points(path_data: String) -> Vec<JsPoint> {
    let points = svg_parser::parse_svg_path(&path_data);
    points.iter().map(|p| JsPoint { x: p.x, y: p.y }).collect()
}

#[napi]
pub fn generate_mesh_from_polygon(
    polygon: Vec<JsPoint>,
    density: f64,
) -> MeshWithQuality {
    let poly_points: Vec<Point> = polygon.iter()
        .map(|p| Point::new(p.x, p.y))
        .collect();
    
    let min_angle_threshold = 25.0;
    let mesh = delaunay::generate_optimized_mesh(&poly_points, density, min_angle_threshold);
    let quality = compute_mesh_quality(&mesh);
    
    MeshWithQuality {
        mesh: mesh_to_js_mesh(&mesh),
        quality,
    }
}

#[napi]
pub fn get_mesh_quality(mesh: JsMesh) -> MeshQuality {
    let rust_mesh = js_mesh_to_mesh(&mesh);
    compute_mesh_quality(&rust_mesh)
}

fn compute_mesh_quality(mesh: &Mesh) -> MeshQuality {
    let mut min_angle = f64::INFINITY;
    let mut max_angle = f64::NEG_INFINITY;
    let mut min_quality = f64::INFINITY;
    let mut total_quality = 0.0;
    let mut bad_count = 0;
    let min_angle_threshold = 25.0;

    for tri in &mesh.triangles {
        let (ma, mxa, q) = delaunay::compute_triangle_quality(&mesh.points, tri);
        min_angle = min_angle.min(ma);
        max_angle = max_angle.max(mxa);
        min_quality = min_quality.min(q);
        total_quality += q;
        if ma < min_angle_threshold {
            bad_count += 1;
        }
    }

    let avg_quality = if mesh.triangles.is_empty() {
        0.0
    } else {
        total_quality / mesh.triangles.len() as f64
    };

    MeshQuality {
        min_angle,
        max_angle,
        avg_quality,
        min_quality,
        bad_element_count: bad_count as i64,
        total_elements: mesh.triangles.len() as i64,
    }
}

#[napi]
pub fn solve_poisson_equation(
    mesh: JsMesh,
    boundary_values: Vec<f64>,
    rhs_value: f64,
    config: SolverConfig,
) -> JsPoissonResult {
    let rust_mesh = js_mesh_to_mesh(&mesh);
    
    let (mut rows, mut cols, mut values) = fem::compute_stiffness_matrix(&rust_mesh);
    
    let f = move |_p: Point| rhs_value;
    let mut rhs = fem::compute_load_vector(&rust_mesh, f);
    
    let boundary_nodes: Vec<usize> = mesh.boundary_nodes.iter()
        .map(|&x| x as usize)
        .collect();
    
    fem::apply_boundary_conditions(
        &mut rows,
        &mut cols,
        &mut values,
        &mut rhs,
        &boundary_nodes,
        &boundary_values,
    );
    
    let solution = solver::conjugate_gradient(
        &rows,
        &cols,
        &values,
        &rhs,
        config.max_iterations as usize,
        config.tolerance,
    );
    
    let result = PoissonResult {
        mesh: rust_mesh,
        solution,
        rhs,
    };
    
    poisson_result_to_js(&result)
}

#[napi]
pub fn save_vtk_file(
    result: JsPoissonResult,
    filename: String,
) -> bool {
    let rust_result = js_poisson_result_to_rust(&result);
    match vtk_writer::write_vtk(&rust_result, &filename) {
        Ok(_) => true,
        Err(e) => {
            eprintln!("Error writing VTK file: {}", e);
            false
        }
    }
}

#[napi]
pub fn get_vtk_string(result: JsPoissonResult) -> String {
    let rust_result = js_poisson_result_to_rust(&result);
    
    let mut vtk = vtk_writer::mesh_to_vtk_string(&rust_result.mesh);
    
    vtk.push_str(&format!("POINT_DATA {}\n", rust_result.solution.len()));
    vtk.push_str("SCALARS solution float 1\n");
    vtk.push_str("LOOKUP_TABLE default\n");
    for &val in &rust_result.solution {
        vtk.push_str(&format!("{}\n", val));
    }
    
    vtk.push_str("SCALARS rhs float 1\n");
    vtk.push_str("LOOKUP_TABLE default\n");
    for &val in &rust_result.rhs {
        vtk.push_str(&format!("{}\n", val));
    }
    
    vtk
}

fn mesh_to_js_mesh(mesh: &Mesh) -> JsMesh {
    JsMesh {
        points: mesh.points.iter()
            .map(|p| JsPoint { x: p.x, y: p.y })
            .collect(),
        triangles: mesh.triangles.iter()
            .map(|t| JsTriangle {
                v0: t.v0 as i64,
                v1: t.v1 as i64,
                v2: t.v2 as i64,
            })
            .collect(),
        boundary_nodes: mesh.boundary_nodes.iter()
            .map(|&x| x as i64)
            .collect(),
    }
}

fn js_mesh_to_mesh(js_mesh: &JsMesh) -> Mesh {
    Mesh {
        points: js_mesh.points.iter()
            .map(|p| Point::new(p.x, p.y))
            .collect(),
        triangles: js_mesh.triangles.iter()
            .map(|t| types::Triangle::new(
                t.v0 as usize,
                t.v1 as usize,
                t.v2 as usize,
            ))
            .collect(),
        boundary_nodes: js_mesh.boundary_nodes.iter()
            .map(|&x| x as usize)
            .collect(),
    }
}

fn poisson_result_to_js(result: &PoissonResult) -> JsPoissonResult {
    JsPoissonResult {
        mesh: mesh_to_js_mesh(&result.mesh),
        solution: result.solution.clone(),
        rhs: result.rhs.clone(),
    }
}

fn js_poisson_result_to_rust(js_result: &JsPoissonResult) -> PoissonResult {
    PoissonResult {
        mesh: js_mesh_to_mesh(&js_result.mesh),
        solution: js_result.solution.clone(),
        rhs: js_result.rhs.clone(),
    }
}
