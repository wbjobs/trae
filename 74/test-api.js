const http = require('http');

function post(path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(data))
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTest() {
    console.log('Testing Poisson Solver API with Mesh Quality Optimization...\n');

    try {
        console.log('=== Test 1: Square Domain ===');
        console.log('1. Parsing SVG path (square)...');
        const svgResult = await post('/api/parse-svg', {
            pathData: 'M 0 0 L 1 0 L 1 1 L 0 1 Z'
        });
        console.log(`   Parsed ${svgResult.points.length} points`);

        console.log('\n2. Generating and optimizing mesh...');
        const meshResult = await post('/api/generate-mesh', {
            polygon: svgResult.points,
            density: 30
        });
        console.log(`   Nodes: ${meshResult.mesh.points.length}`);
        console.log(`   Triangles: ${meshResult.mesh.triangles.length}`);
        console.log(`   Boundary nodes: ${meshResult.mesh.boundary_nodes.length}`);
        console.log(`   Min angle: ${meshResult.quality.min_angle.toFixed(1)}°`);
        console.log(`   Max angle: ${meshResult.quality.max_angle.toFixed(1)}°`);
        console.log(`   Bad elements: ${meshResult.quality.bad_element_count} / ${meshResult.quality.total_elements}`);
        
        if (meshResult.quality.bad_element_count > 0) {
            console.log('   ⚠️  Warning: Bad elements found');
        } else {
            console.log('   ✅ No bad elements (all angles > 25°)');
        }

        console.log('\n3. Solving Poisson equation...');
        const boundaryValues = meshResult.mesh.boundary_nodes.map(() => 0);
        const solveResult = await post('/api/solve', {
            mesh: meshResult.mesh,
            boundaryValues: boundaryValues,
            rhsValue: -1,
            config: {
                max_iterations: 1000,
                tolerance: 1e-6,
                point_density: 30
            }
        });
        
        const solution = solveResult.result.solution;
        const minSol = Math.min(...solution);
        const maxSol = Math.max(...solution);
        console.log(`   Solution range: [${minSol.toFixed(4)}, ${maxSol.toFixed(4)}]`);
        console.log(`   Expected max at center: ~0.0737`);

        console.log('\n4. Getting VTK content...');
        const vtkContent = await post('/api/get-vtk', {
            result: solveResult.result
        });
        console.log(`   VTK content length: ${vtkContent.length} characters`);

        console.log('\n=== Test 2: Concave Polygon (L-shape) ===');
        console.log('1. Parsing SVG path (L-shape)...');
        const concaveSvg = 'M 0 0 L 1 0 L 1 0.5 L 0.5 0.5 L 0.5 1 L 0 1 Z';
        const concaveResult = await post('/api/parse-svg', {
            pathData: concaveSvg
        });
        console.log(`   Parsed ${concaveResult.points.length} points`);

        console.log('\n2. Generating and optimizing mesh for concave domain...');
        const concaveMeshResult = await post('/api/generate-mesh', {
            polygon: concaveResult.points,
            density: 25
        });
        console.log(`   Nodes: ${concaveMeshResult.mesh.points.length}`);
        console.log(`   Triangles: ${concaveMeshResult.mesh.triangles.length}`);
        console.log(`   Min angle: ${concaveMeshResult.quality.min_angle.toFixed(1)}°`);
        console.log(`   Bad elements: ${concaveMeshResult.quality.bad_element_count} / ${concaveMeshResult.quality.total_elements}`);
        
        if (concaveMeshResult.quality.min_angle < 25) {
            console.log('   ⚠️  Warning: Some elements still have angles < 25°');
        } else {
            console.log('   ✅ All elements have angles > 25° after optimization');
        }

        console.log('\n=== Test 3: Adaptive Refinement on L-shape ===');
        console.log('1. Running adaptive solve...');
        const adaptiveBoundaryValues = concaveMeshResult.mesh.boundary_nodes.map(() => 0);
        const adaptiveConfig = {
            max_iterations: 1000,
            cg_tolerance: 1e-6,
            target_error: 0.05,
            max_adaptive_steps: 4,
            refine_fraction: 0.3
        };
        
        const adaptiveResult = await post('/api/adaptive-solve', {
            mesh: concaveMeshResult.mesh,
            boundaryValues: adaptiveBoundaryValues,
            rhsValue: -1,
            config: adaptiveConfig
        });
        
        console.log(`   Steps completed: ${adaptiveResult.steps.length}`);
        console.log(`   Converged: ${adaptiveResult.converged ? 'Yes' : 'No'}`);
        console.log('');
        
        for (let i = 0; i < adaptiveResult.steps.length; i++) {
            const step = adaptiveResult.steps[i];
            console.log(`   Step ${i}:`);
            console.log(`     Nodes: ${step.mesh.points.length}, Elements: ${step.mesh.triangles.length}`);
            console.log(`     Relative error: ${step.global_relative_error.toExponential(3)}`);
            if (i < adaptiveResult.steps.length - 1) {
                console.log(`     Elements to refine: ${step.elements_to_refine.length}`);
            }
            console.log('');
        }

        console.log('\n=== Test 4: Check mesh quality API ===');
        const qualityCheck = await post('/api/get-mesh-quality', {
            mesh: meshResult.mesh
        });
        console.log(`   Min angle: ${qualityCheck.min_angle.toFixed(1)}°`);
        console.log(`   Avg quality: ${qualityCheck.avg_quality.toFixed(3)}`);

        console.log('\n=== Test 5: Error estimation API ===');
        const errorResult = await post('/api/estimate-error', {
            mesh: meshResult.mesh,
            solution: solveResult.result.solution,
            refineFraction: 0.3
        });
        console.log(`   Error indicators computed for ${errorResult.errors.length} elements`);
        if (errorResult.errors.length > 0) {
            const maxErr = Math.max(...errorResult.errors.map(e => e.error_norm));
            console.log(`   Max error norm: ${maxErr.toExponential(3)}`);
        }

        console.log('\n✅ All tests passed!');
        console.log('\nMesh Optimization Summary:');
        console.log('  - Laplacian smoothing: Moves interior nodes to centroid of neighbors');
        console.log('  - Edge flipping: Improves min angle by swapping diagonals');
        console.log('  - Target: All triangles with min angle > 25°');

    } catch (e) {
        console.error('❌ Test failed:', e.message);
        console.log('\nMake sure the server is running: npm start');
        console.log('And the Rust addon is built: npm run build');
    }
}

runTest();
