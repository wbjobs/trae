# 2D Poisson Equation Solver

A complete 2D Poisson equation solver supporting arbitrary polygonal domains with:
- Delaunay triangulation mesh generation (Bowyer-Watson algorithm)
- **Mesh quality optimization** (Laplacian smoothing + edge flipping)
- **Adaptive mesh refinement** (Z-Z gradient recovery error estimation)
- Finite element method (FEM) stiffness matrix assembly
- Conjugate gradient linear solver
- Heatmap visualization with error and refinement highlighting
- **Animation of adaptive refinement process**
- VTK file output per adaptive step

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                         │
│  HTML/CSS/JS - Interactive UI, Canvas visualization    │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP API
┌────────────────────────────▼────────────────────────────┐
│                     Node.js Server                      │
│  Express.js - REST API, serves frontend                │
└────────────────────────────┬────────────────────────────┘
                             │ N-API
┌────────────────────────────▼────────────────────────────┐
│                    Rust Native Addon                    │
│  - SVG path parsing                                     │
│  - Delaunay triangulation                               │
│  - FEM stiffness matrix assembly                        │
│  - Conjugate gradient solver                            │
│  - VTK file I/O                                         │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### 1. Install Rust
```powershell
# Using winget (Windows)
winget install --id Rustlang.Rustup -e

# Or download from https://rustup.rs/
rustup default stable
```

### 2. Install Node.js
- Node.js 18+ (already installed)
- npm (already installed)

## Building the Project

### Step 1: Install JavaScript dependencies
```bash
npm install
```

### Step 2: Build the Rust native addon
```bash
# Release build (recommended)
npm run build

# Or debug build
npm run build-debug
```

### Step 3: Start the server
```bash
npm start
```

### Step 4: Open the application
Visit `http://localhost:3000` in your browser.

## Usage

### Workflow
1. **Input SVG Path**: Enter an SVG path string or use a preset shape (square, circle, triangle, pentagon)
2. **Generate Mesh**: Adjust point density and generate triangular mesh
3. **Set Boundary Conditions**: Specify Dirichlet boundary values
4. **Configure Solver**: Set RHS value, max iterations, and tolerance
5. **Solve**: Click to solve the Poisson equation
6. **Visualize**: View the heatmap solution
7. **Export**: Download VTK file for further analysis

### SVG Path Format
The parser supports standard SVG path commands:
- `M x y` / `m dx dy` - Move to
- `L x y` / `l dx dy` - Line to
- `H x` / `h dx` - Horizontal line
- `V y` / `v dy` - Vertical line
- `Z` / `z` - Close path
- `C cx1 cy1 cx2 cy2 x y` / `c ...` - Cubic Bezier
- `Q cx cy x y` / `q ...` - Quadratic Bezier
- `A rx ry rot large sweep x y` / `a ...` - Arc

### Example SVG Paths
- Square: `M 0 0 L 1 0 L 1 1 L 0 1 Z`
- Triangle: `M 0.5 0 L 1 1 L 0 1 Z`
- Circle: `M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z`

## Mathematical Background

### Poisson Equation
The solver solves the 2D Poisson equation:
```
-∇²u(x,y) = f(x,y)   in Ω
     u(x,y) = g(x,y)   on ∂Ω
```

### Finite Element Method
- Uses linear triangular finite elements (P1 elements)
- Stiffness matrix computed via element-wise assembly
- Dirichlet boundary conditions enforced by modifying the linear system

### Conjugate Gradient Method
- Iterative solver for symmetric positive definite systems
- Preconditioning: None (diagonal preconditioning can be added)
- Convergence criteria: ||r||₂ < tolerance or max iterations reached

## Project Structure

```
e:\trae\74\
├── src/
│   ├── lib.rs          # Main library, Node.js bindings
│   ├── types.rs        # Data structures (Point, Triangle, Mesh, etc.)
│   ├── delaunay.rs     # Delaunay triangulation (Bowyer-Watson)
│   ├── svg_parser.rs   # SVG path parsing
│   ├── fem.rs          # Finite element matrix assembly
│   ├── solver.rs       # Conjugate gradient solver
│   └── vtk_writer.rs   # VTK file output
├── public/
│   ├── index.html      # Frontend HTML
│   ├── style.css       # Styling
│   └── app.js          # Frontend JavaScript
├── server.js           # Express.js server
├── Cargo.toml          # Rust dependencies
├── package.json        # Node.js dependencies
└── build.rs            # Build script for N-API
```

## API Endpoints

### POST /api/parse-svg
Parse SVG path string to polygon points
```json
{ "pathData": "M 0 0 L 1 0 L 1 1 L 0 1 Z" }
```

### POST /api/generate-mesh
Generate and optimize triangular mesh from polygon
```json
{ 
  "polygon": [{ "x": 0, "y": 0 }, ...],
  "density": 50
}
```
**Response:**
```json
{
  "mesh": { ... },
  "quality": {
    "min_angle": 28.5,
    "max_angle": 115.2,
    "avg_quality": 0.82,
    "min_quality": 0.65,
    "bad_element_count": 0,
    "total_elements": 456
  }
}
```

### POST /api/get-mesh-quality
Analyze mesh quality
```json
{ "mesh": { ... } }
```

### POST /api/adaptive-solve
Run adaptive Poisson solver with automatic mesh refinement
```json
{
  "mesh": { ... },
  "boundaryValues": [0, 0, ...],
  "rhsValue": -1,
  "config": {
    "max_iterations": 1000,
    "cg_tolerance": 1e-6,
    "target_error": 0.01,
    "max_adaptive_steps": 5,
    "refine_fraction": 0.3
  }
}
```
**Response:**
```json
{
  "steps": [
    {
      "step": 0,
      "mesh": { ... },
      "solution": [...],
      "rhs": [...],
      "global_error": 0.052,
      "global_relative_error": 0.089,
      "element_errors": [
        {"element_index": 0, "error_norm": 0.001, "relative_error": 0.02}
      ],
      "elements_to_refine": [5, 12, 23, ...]
    },
    ...
  ],
  "converged": true,
  "final_step": 4
}
```

### POST /api/estimate-error
Estimate solution error without refinement
```json
{
  "mesh": { ... },
  "solution": [...],
  "refineFraction": 0.3
}
```

### POST /api/solve
Solve Poisson equation (single mesh)
```json
{
  "mesh": { ... },
  "boundaryValues": [0, 0, ...],
  "rhsValue": -1,
  "config": {
    "max_iterations": 1000,
    "tolerance": 1e-6,
    "point_density": 50
  }
}
```

### POST /api/save-vtk
Save solution to VTK file
```json
{ "result": { ... }, "filename": "output.vtk" }
```

### POST /api/get-vtk
Get VTK content as string
```json
{ "result": { ... } }
```

## Performance Considerations

- **Mesh Size**: For best performance, keep point density moderate (50-100 for quick tests)
- **Solver**: Conjugate gradient converges faster with better initial guesses
- **Memory**: Sparse matrix storage used - O(nnz) instead of O(n²)

## Troubleshooting

### Rust build fails
- Ensure Rust is properly installed: `rustc --version`
- Update Rust: `rustup update`
- Clean build: `cargo clean && npm run build`

### Node.js cannot find addon
- Check that `target/release/poisson_solver.node` exists
- Try debug build: `npm run build-debug`
- Restart the server after building

### Poor mesh quality
- Increase point density
- Ensure SVG path is a simple closed polygon
- Avoid very sharp corners or self-intersections

### Solver fails to converge
- Increase max iterations
- Increase tolerance slightly
- Check that boundary conditions are properly set

## License

MIT
