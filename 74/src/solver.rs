use crate::fem::sparse_matrix_vector_multiply;

pub fn conjugate_gradient(
    rows: &[usize],
    cols: &[usize],
    values: &[f64],
    b: &[f64],
    max_iterations: usize,
    tolerance: f64,
) -> Vec<f64> {
    let n = b.len();
    let mut x = vec![0.0; n];
    let mut r = vec![0.0; n];
    let mut p = vec![0.0; n];
    let mut ap = vec![0.0; n];

    sparse_matrix_vector_multiply(rows, cols, values, &x, &mut ap);
    for i in 0..n {
        r[i] = b[i] - ap[i];
        p[i] = r[i];
    }

    let mut rs_old = dot(&r, &r);
    
    if rs_old.sqrt() < tolerance {
        return x;
    }

    for _ in 0..max_iterations {
        sparse_matrix_vector_multiply(rows, cols, values, &p, &mut ap);
        
        let pap = dot(&p, &ap);
        if pap.abs() < 1e-12 {
            break;
        }
        
        let alpha = rs_old / pap;
        
        for i in 0..n {
            x[i] += alpha * p[i];
            r[i] -= alpha * ap[i];
        }

        let rs_new = dot(&r, &r);
        let rs_new_sqrt = rs_new.sqrt();
        
        if rs_new_sqrt < tolerance {
            break;
        }

        let beta = rs_new / rs_old;
        
        for i in 0..n {
            p[i] = r[i] + beta * p[i];
        }

        rs_old = rs_new;
    }

    x
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

pub fn check_solution(
    rows: &[usize],
    cols: &[usize],
    values: &[f64],
    x: &[f64],
    b: &[f64],
) -> f64 {
    let n = b.len();
    let mut ax = vec![0.0; n];
    sparse_matrix_vector_multiply(rows, cols, values, x, &mut ax);
    
    let mut residual = 0.0;
    for i in 0..n {
        let diff = ax[i] - b[i];
        residual += diff * diff;
    }
    
    residual.sqrt()
}
