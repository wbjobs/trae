use crate::types::{Mesh, PoissonResult};
use std::fs::File;
use std::io::{Result, Write};

pub fn write_vtk(result: &PoissonResult, filename: &str) -> Result<()> {
    let mut file = File::create(filename)?;
    
    write_vtk_header(&mut file)?;
    write_points(&mut file, &result.mesh.points)?;
    write_cells(&mut file, &result.mesh.triangles)?;
    write_point_data(&mut file, &result.solution, "solution")?;
    write_point_data(&mut file, &result.rhs, "rhs")?;
    
    Ok(())
}

fn write_vtk_header<W: Write>(w: &mut W) -> Result<()> {
    writeln!(w, "# vtk DataFile Version 3.0")?;
    writeln!(w, "Poisson Equation Solution")?;
    writeln!(w, "ASCII")?;
    writeln!(w, "DATASET UNSTRUCTURED_GRID")?;
    Ok(())
}

fn write_points<W: Write>(w: &mut W, points: &[crate::types::Point]) -> Result<()> {
    writeln!(w, "POINTS {} float", points.len())?;
    for p in points {
        writeln!(w, "{} {} 0.0", p.x, p.y)?;
    }
    Ok(())
}

fn write_cells<W: Write>(w: &mut W, triangles: &[crate::types::Triangle]) -> Result<()> {
    let num_cells = triangles.len();
    let total_size = num_cells * 4;
    
    writeln!(w, "CELLS {} {}", num_cells, total_size)?;
    for tri in triangles {
        writeln!(w, "3 {} {} {}", tri.v0, tri.v1, tri.v2)?;
    }
    
    writeln!(w, "CELL_TYPES {}", num_cells)?;
    for _ in 0..num_cells {
        writeln!(w, "5")?;
    }
    
    Ok(())
}

fn write_point_data<W: Write>(w: &mut W, data: &[f64], name: &str) -> Result<()> {
    writeln!(w, "POINT_DATA {}", data.len())?;
    writeln!(w, "SCALARS {} float 1", name)?;
    writeln!(w, "LOOKUP_TABLE default")?;
    for &val in data {
        writeln!(w, "{}", val)?;
    }
    Ok(())
}

pub fn mesh_to_vtk_string(mesh: &Mesh) -> String {
    let mut result = String::new();
    
    result.push_str("# vtk DataFile Version 3.0\n");
    result.push_str("Mesh Data\n");
    result.push_str("ASCII\n");
    result.push_str("DATASET UNSTRUCTURED_GRID\n");
    
    result.push_str(&format!("POINTS {} float\n", mesh.points.len()));
    for p in &mesh.points {
        result.push_str(&format!("{} {} 0.0\n", p.x, p.y));
    }
    
    let num_cells = mesh.triangles.len();
    let total_size = num_cells * 4;
    result.push_str(&format!("CELLS {} {}\n", num_cells, total_size));
    for tri in &mesh.triangles {
        result.push_str(&format!("3 {} {} {}\n", tri.v0, tri.v1, tri.v2));
    }
    
    result.push_str(&format!("CELL_TYPES {}\n", num_cells));
    for _ in 0..num_cells {
        result.push_str("5\n");
    }
    
    result
}
