use crate::types::{Mesh, Point, Triangle};
use nalgebra::{Point2, Matrix3, Vector3};

pub fn compute_stiffness_matrix(mesh: &Mesh) -> (Vec<usize>, Vec<usize>, Vec<f64>) {
    let n = mesh.num_nodes();
    let mut rows: Vec<usize> = Vec::new();
    let mut cols: Vec<usize> = Vec::new();
    let mut values: Vec<f64> = Vec::new();

    for tri in &mesh.triangles {
        let [i, j, k] = tri.vertices();
        let p0 = mesh.points[i].to_nalgebra();
        let p1 = mesh.points[j].to_nalgebra();
        let p2 = mesh.points[k].to_nalgebra();

        let (local_stiffness, _) = compute_local_stiffness(p0, p1, p2);

        let indices = [i, j, k];
        for a in 0..3 {
            for b in 0..3 {
                rows.push(indices[a]);
                cols.push(indices[b]);
                values.push(local_stiffness[(a, b)]);
            }
        }
    }

    (rows, cols, values)
}

fn compute_local_stiffness(
    p0: Point2<f64>,
    p1: Point2<f64>,
    p2: Point2<f64>,
) -> (Matrix3<f64>, f64) {
    let x0 = p0.x;
    let y0 = p0.y;
    let x1 = p1.x;
    let y1 = p1.y;
    let x2 = p2.x;
    let y2 = p2.y;

    let area = 0.5 * ((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)).abs();
    
    if area < 1e-12 {
        return (Matrix3::zeros(), area);
    }

    let b = Vector3::new(y1 - y2, y2 - y0, y0 - y1);
    let c = Vector3::new(x2 - x1, x0 - x2, x1 - x0);

    let mut local_stiffness = Matrix3::zeros();
    let factor = 1.0 / (4.0 * area);
    
    for i in 0..3 {
        for j in 0..3 {
            local_stiffness[(i, j)] = factor * (b[i] * b[j] + c[i] * c[j]);
        }
    }

    (local_stiffness, area)
}

pub fn compute_load_vector(
    mesh: &Mesh,
    f: impl Fn(Point) -> f64,
) -> Vec<f64> {
    let n = mesh.num_nodes();
    let mut load = vec![0.0; n];

    for tri in &mesh.triangles {
        let [i, j, k] = tri.vertices();
        let p0 = mesh.points[i];
        let p1 = mesh.points[j];
        let p2 = mesh.points[k];

        let local_load = compute_local_load(p0, p1, p2, &f);

        load[i] += local_load[0];
        load[j] += local_load[1];
        load[k] += local_load[2];
    }

    load
}

fn compute_local_load(
    p0: Point,
    p1: Point,
    p2: Point,
    f: &impl Fn(Point) -> f64,
) -> [f64; 3] {
    let area = 0.5 * ((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)).abs();
    
    if area < 1e-12 {
        return [0.0; 3];
    }

    let f0 = f(p0);
    let f1 = f(p1);
    let f2 = f(p2);

    let factor = area / 3.0;
    [
        factor * f0,
        factor * f1,
        factor * f2,
    ]
}

pub fn apply_boundary_conditions(
    rows: &mut Vec<usize>,
    cols: &mut Vec<usize>,
    values: &mut Vec<f64>,
    rhs: &mut Vec<f64>,
    boundary_nodes: &[usize],
    boundary_values: &[f64],
) {
    let n = rhs.len();
    let mut is_boundary = vec![false; n];
    let mut bc_value = vec![0.0; n];

    for (idx, &node) in boundary_nodes.iter().enumerate() {
        is_boundary[node] = true;
        bc_value[node] = boundary_values[idx];
    }

    for i in 0..values.len() {
        let row = rows[i];
        let col = cols[i];
        
        if is_boundary[row] {
            if row == col {
                values[i] = 1.0;
            } else {
                values[i] = 0.0;
            }
        }
    }

    for i in 0..n {
        if is_boundary[i] {
            rhs[i] = bc_value[i];
        }
    }
}

pub fn sparse_matrix_vector_multiply(
    rows: &[usize],
    cols: &[usize],
    values: &[f64],
    x: &[f64],
    result: &mut [f64],
) {
    for val in result.iter_mut() {
        *val = 0.0;
    }

    for i in 0..values.len() {
        result[rows[i]] += values[i] * x[cols[i]];
    }
}
