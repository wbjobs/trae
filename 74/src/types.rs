use nalgebra::{Point2, Vector2};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn to_nalgebra(&self) -> Point2<f64> {
        Point2::new(self.x, self.y)
    }

    pub fn from_nalgebra(p: Point2<f64>) -> Self {
        Self { x: p.x, y: p.y }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Triangle {
    pub v0: usize,
    pub v1: usize,
    pub v2: usize,
}

impl Triangle {
    pub fn new(v0: usize, v1: usize, v2: usize) -> Self {
        Self { v0, v1, v2 }
    }

    pub fn vertices(&self) -> [usize; 3] {
        [self.v0, self.v1, self.v2]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mesh {
    pub points: Vec<Point>,
    pub triangles: Vec<Triangle>,
    pub boundary_nodes: Vec<usize>,
}

impl Mesh {
    pub fn new() -> Self {
        Self {
            points: Vec::new(),
            triangles: Vec::new(),
            boundary_nodes: Vec::new(),
        }
    }

    pub fn num_nodes(&self) -> usize {
        self.points.len()
    }

    pub fn num_elements(&self) -> usize {
        self.triangles.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundaryCondition {
    pub node_indices: Vec<usize>,
    pub values: Vec<f64>,
}

impl BoundaryCondition {
    pub fn new(node_indices: Vec<usize>, values: Vec<f64>) -> Self {
        Self {
            node_indices,
            values,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoissonResult {
    pub mesh: Mesh,
    pub solution: Vec<f64>,
    pub rhs: Vec<f64>,
}
