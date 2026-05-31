let polygon = [];
let mesh = null;
let solution = null;
let result = null;

let adaptiveSteps = [];
let currentStepIndex = 0;
let animationPlaying = false;
let animationInterval = null;
let currentStepData = null;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const presets = {
    square: 'M 0 0 L 1 0 L 1 1 L 0 1 Z',
    circle: 'M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z',
    triangle: 'M 0.5 0 L 1 1 L 0 1 Z',
    pentagon: 'M 0.5 0 L 0.95 0.35 L 0.78 0.9 L 0.22 0.9 L 0.05 0.35 Z',
    lshape: 'M 0 0 L 1 0 L 1 0.5 L 0.5 0.5 L 0.5 1 L 0 1 Z',
    notch: 'M 0 0 L 1 0 L 1 1 L 0.7 1 L 0.7 0.6 L 0.3 0.6 L 0.3 1 L 0 1 Z'
};

function setPreset(name) {
    document.getElementById('svgInput').value = presets[name];
}

function updateDensity() {
    const val = document.getElementById('density').value;
    document.getElementById('densityValue').textContent = val;
}

function setStatus(message, type = '') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
}

async function parseSVG() {
    const pathData = document.getElementById('svgInput').value.trim();
    if (!pathData) {
        setStatus('Please enter an SVG path', 'error');
        return;
    }

    setStatus('Parsing SVG...', 'loading');
    
    try {
        const response = await fetch('/api/parse-svg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pathData })
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        
        polygon = data.points;
        setStatus(`Parsed ${polygon.length} points from SVG path`);
        render();
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

async function generateMesh() {
    if (polygon.length < 3) {
        setStatus('Please parse an SVG path first', 'error');
        return;
    }

    const density = parseFloat(document.getElementById('density').value);
    
    setStatus('Generating and optimizing mesh...', 'loading');
    
    try {
        const response = await fetch('/api/generate-mesh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ polygon, density })
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        
        mesh = data.mesh;
        const quality = data.quality;
        solution = null;
        result = null;
        
        const qualityColor = quality.bad_element_count > 0 ? '#ef6c00' : '#2e7d32';
        document.getElementById('meshInfo').innerHTML = `
            <strong>Mesh Info:</strong><br>
            Nodes: ${mesh.points.length}<br>
            Triangles: ${mesh.triangles.length}<br>
            Boundary nodes: ${mesh.boundary_nodes.length}<br><br>
            <strong>Quality:</strong><br>
            Min angle: <span style="color: ${quality.min_angle < 25 ? '#e53935' : '#2e7d32'}">${quality.min_angle.toFixed(1)}°</span><br>
            Max angle: ${quality.max_angle.toFixed(1)}°<br>
            Avg quality: ${quality.avg_quality.toFixed(3)}<br>
            Bad elements: <span style="color: ${qualityColor}">${quality.bad_element_count}</span> / ${quality.total_elements}
        `;
        
        if (quality.bad_element_count > 0) {
            setStatus(`Warning: ${quality.bad_element_count} bad elements (min angle ${quality.min_angle.toFixed(1)}°)`, 'error');
        } else {
            setStatus(`Mesh optimized: ${mesh.points.length} nodes, min angle ${quality.min_angle.toFixed(1)}°`);
        }
        render();
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

async function solve() {
    if (!mesh) {
        setStatus('Please generate a mesh first', 'error');
        return;
    }

    const boundaryValue = parseFloat(document.getElementById('boundaryValue').value);
    const rhsValue = parseFloat(document.getElementById('rhsValue').value);
    const maxIter = parseInt(document.getElementById('maxIter').value);
    const tolerance = parseFloat(document.getElementById('tolerance').value);

    const boundaryValues = mesh.boundary_nodes.map(() => boundaryValue);
    
    const config = {
        max_iterations: maxIter,
        tolerance: tolerance,
        point_density: parseFloat(document.getElementById('density').value)
    };

    setStatus('Solving Poisson equation...', 'loading');
    
    try {
        const response = await fetch('/api/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mesh, boundaryValues, rhsValue, config })
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        
        result = data.result;
        solution = result.solution;
        
        const minVal = Math.min(...solution);
        const maxVal = Math.max(...solution);
        
        setStatus(`Solution complete! Min: ${minVal.toFixed(4)}, Max: ${maxVal.toFixed(4)}`);
        render();
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

async function adaptiveSolve() {
    if (!mesh) {
        setStatus('Please generate a mesh first', 'error');
        return;
    }

    const boundaryValue = parseFloat(document.getElementById('boundaryValue').value);
    const rhsValue = parseFloat(document.getElementById('rhsValue').value);
    const maxIter = parseInt(document.getElementById('maxIter').value);
    const tolerance = parseFloat(document.getElementById('tolerance').value);
    const targetError = parseFloat(document.getElementById('targetError').value);
    const maxAdaptiveSteps = parseInt(document.getElementById('maxAdaptiveSteps').value);
    const refineFraction = parseFloat(document.getElementById('refineFraction').value);

    const boundaryValues = mesh.boundary_nodes.map(() => boundaryValue);
    
    const config = {
        max_iterations: maxIter,
        cg_tolerance: tolerance,
        target_error: targetError,
        max_adaptive_steps: maxAdaptiveSteps,
        refine_fraction: refineFraction,
    };

    setStatus('Running adaptive solve... This may take a while.', 'loading');
    
    try {
        const response = await fetch('/api/adaptive-solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mesh, boundaryValues, rhsValue, config })
        });
        
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        
        adaptiveSteps = data.steps;
        currentStepIndex = 0;
        
        document.getElementById('adaptiveControls').style.display = 'block';
        document.getElementById('totalSteps').textContent = adaptiveSteps.length - 1;
        document.getElementById('stepSlider').max = adaptiveSteps.length - 1;
        
        let infoHtml = `<strong>Adaptive Results:</strong><br>`;
        infoHtml += `Converged: ${data.converged ? '✅ Yes' : '❌ No'}<br>`;
        infoHtml += `Steps: ${adaptiveSteps.length}<br><br>`;
        
        for (let i = 0; i < adaptiveSteps.length; i++) {
            const step = adaptiveSteps[i];
            infoHtml += `<strong>Step ${i}:</strong><br>`;
            infoHtml += `  Nodes: ${step.mesh.points.length}<br>`;
            infoHtml += `  Elements: ${step.mesh.triangles.length}<br>`;
            infoHtml += `  Rel Error: ${step.global_relative_error.toExponential(3)}<br>`;
            if (i < adaptiveSteps.length - 1) {
                infoHtml += `  Refining: ${step.elements_to_refine.length} elements<br><br>`;
            }
        }
        
        document.getElementById('adaptiveInfo').innerHTML = infoHtml;
        
        if (data.converged) {
            setStatus(`Adaptive solve converged in ${adaptiveSteps.length} steps! Final error: ${adaptiveSteps[adaptiveSteps.length-1].global_relative_error.toExponential(3)}`);
        } else {
            setStatus(`Adaptive solve did not converge after ${adaptiveSteps.length} steps. Final error: ${adaptiveSteps[adaptiveSteps.length-1].global_relative_error.toExponential(3)}`, 'error');
        }
        
        showStep(0);
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

function showStep(stepIdx) {
    stepIdx = parseInt(stepIdx);
    if (stepIdx < 0 || stepIdx >= adaptiveSteps.length) return;
    
    currentStepIndex = stepIdx;
    currentStepData = adaptiveSteps[stepIdx];
    
    document.getElementById('currentStep').textContent = stepIdx;
    document.getElementById('stepSlider').value = stepIdx;
    
    mesh = currentStepData.mesh;
    solution = currentStepData.solution;
    
    result = {
        mesh: mesh,
        solution: solution,
        rhs: currentStepData.rhs
    };
    
    render();
    
    const minVal = Math.min(...solution);
    const maxVal = Math.max(...solution);
    setStatus(`Step ${stepIdx}: ${mesh.points.length} nodes, ${mesh.triangles.length} elements, Error: ${currentStepData.global_relative_error.toExponential(3)}, Range: [${minVal.toFixed(4)}, ${maxVal.toFixed(4)}]`);
}

function playAnimation() {
    if (animationPlaying) return;
    if (adaptiveSteps.length === 0) return;
    
    animationPlaying = true;
    const speed = parseInt(document.getElementById('animSpeed').value);
    
    animationInterval = setInterval(() => {
        if (currentStepIndex < adaptiveSteps.length - 1) {
            showStep(currentStepIndex + 1);
        } else {
            pauseAnimation();
        }
    }, speed);
}

function pauseAnimation() {
    animationPlaying = false;
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

function resetAnimation() {
    pauseAnimation();
    showStep(0);
}

async function downloadCurrentStepVTK() {
    if (!currentStepData) {
        if (!result) {
            setStatus('Please run adaptive solve or standard solve first', 'error');
            return;
        }
        downloadVTK();
        return;
    }

    setStatus('Generating VTK file...', 'loading');
    
    try {
        const stepResult = {
            mesh: currentStepData.mesh,
            solution: currentStepData.solution,
            rhs: currentStepData.rhs
        };
        
        const response = await fetch('/api/get-vtk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: stepResult })
        });
        
        const vtkContent = await response.text();
        
        const blob = new Blob([vtkContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `poisson_step_${currentStepIndex}.vtk`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setStatus(`VTK file for step ${currentStepIndex} downloaded`);
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

async function downloadVTK() {
    if (!result) {
        setStatus('Please solve the equation first', 'error');
        return;
    }

    setStatus('Generating VTK file...', 'loading');
    
    try {
        const response = await fetch('/api/get-vtk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result })
        });
        
        const vtkContent = await response.text();
        
        const blob = new Blob([vtkContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'poisson_solution.vtk';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setStatus('VTK file downloaded');
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

function getBounds() {
    let allPoints = [];
    if (mesh) {
        allPoints = mesh.points;
    } else if (polygon.length > 0) {
        allPoints = polygon;
    } else {
        return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const p of allPoints) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    
    const padding = 0.1 * Math.max(maxX - minX, maxY - minY);
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding
    };
}

function worldToScreen(x, y, bounds) {
    const scaleX = canvas.width / (bounds.maxX - bounds.minX);
    const scaleY = canvas.height / (bounds.maxY - bounds.minY);
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (canvas.width - (bounds.maxX - bounds.minX) * scale) / 2;
    const offsetY = (canvas.height - (bounds.maxY - bounds.minY) * scale) / 2;
    
    return {
        x: (x - bounds.minX) * scale + offsetX,
        y: canvas.height - ((y - bounds.minY) * scale + offsetY)
    };
}

function colormap(value, minVal, maxVal, scale) {
    if (minVal === maxVal) {
        return 'rgb(128, 128, 128)';
    }
    
    const normalized = (value - minVal) / (maxVal - minVal);
    const v = Math.max(0, Math.min(1, normalized * scale));
    
    const r = Math.floor(255 * v);
    const g = Math.floor(255 * (1 - Math.abs(2 * v - 1)));
    const b = Math.floor(255 * (1 - v));
    
    return `rgb(${r}, ${g}, ${b})`;
}

function computeTriangleMinAngle(tri, points) {
    const p0 = points[tri.v0];
    const p1 = points[tri.v1];
    const p2 = points[tri.v2];
    
    const a = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
    const b = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const c = Math.sqrt((p0.x - p2.x) ** 2 + (p0.y - p2.y) ** 2);
    
    if (a < 1e-12 || b < 1e-12 || c < 1e-12) {
        return 0;
    }
    
    const cosC = (a * a + b * b - c * c) / (2 * a * b);
    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const cosB = (a * a + c * c - b * b) / (2 * a * c);
    
    const angleC = Math.acos(Math.max(-1, Math.min(1, cosC))) * 180 / Math.PI;
    const angleA = Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI;
    const angleB = Math.acos(Math.max(-1, Math.min(1, cosB))) * 180 / Math.PI;
    
    return Math.min(angleA, angleB, angleC);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const bounds = getBounds();
    const showMesh = document.getElementById('showMesh').checked;
    const showSolution = document.getElementById('showSolution').checked;
    const showErrors = document.getElementById('showErrors')?.checked ?? false;
    const colorScale = parseFloat(document.getElementById('colorScale').value);
    const highlightBad = document.getElementById('highlightBad')?.checked ?? true;
    const highlightRefine = document.getElementById('highlightRefine')?.checked ?? true;

    const refineSet = new Set();
    if (currentStepData && currentStepData.elements_to_refine) {
        currentStepData.elements_to_refine.forEach(idx => refineSet.add(idx));
    }

    const errorMap = new Map();
    if (currentStepData && currentStepData.element_errors) {
        currentStepData.element_errors.forEach(e => {
            errorMap.set(e.element_index, e.error_norm);
        });
    }

    if (mesh && (showSolution || showErrors) && solution) {
        const minVal = Math.min(...solution);
        const maxVal = Math.max(...solution);
        
        let maxError = 0;
        if (showErrors && errorMap.size > 0) {
            maxError = Math.max(...errorMap.values());
        }
        
        for (let i = 0; i < mesh.triangles.length; i++) {
            const tri = mesh.triangles[i];
            const p0 = worldToScreen(mesh.points[tri.v0].x, mesh.points[tri.v0].y, bounds);
            const p1 = worldToScreen(mesh.points[tri.v1].x, mesh.points[tri.v1].y, bounds);
            const p2 = worldToScreen(mesh.points[tri.v2].x, mesh.points[tri.v2].y, bounds);
            
            const minAngle = computeTriangleMinAngle(tri, mesh.points);
            const isBad = minAngle < 25;
            const toRefine = refineSet.has(i);
            
            let color;
            if (isBad && highlightBad) {
                color = '#ff0000';
            } else if (toRefine && highlightRefine && !showErrors) {
                color = '#ff9800';
            } else if (showErrors && errorMap.has(i)) {
                const err = errorMap.get(i);
                const normalized = maxError > 0 ? err / maxError : 0;
                const r = Math.floor(255 * normalized);
                const g = Math.floor(255 * (1 - normalized));
                color = `rgb(${r}, ${g}, 0)`;
            } else if (showSolution) {
                const avgValue = (solution[tri.v0] + solution[tri.v1] + solution[tri.v2]) / 3;
                color = colormap(avgValue, minVal, maxVal, colorScale);
            } else {
                color = 'rgba(200, 200, 200, 0.3)';
            }
            
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }
    }

    if (mesh && showMesh) {
        for (let i = 0; i < mesh.triangles.length; i++) {
            const tri = mesh.triangles[i];
            const p0 = worldToScreen(mesh.points[tri.v0].x, mesh.points[tri.v0].y, bounds);
            const p1 = worldToScreen(mesh.points[tri.v1].x, mesh.points[tri.v1].y, bounds);
            const p2 = worldToScreen(mesh.points[tri.v2].x, mesh.points[tri.v2].y, bounds);
            
            const minAngle = computeTriangleMinAngle(tri, mesh.points);
            const isBad = minAngle < 25;
            const toRefine = refineSet.has(i);
            
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            
            if (isBad && highlightBad) {
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
            } else if (toRefine && highlightRefine) {
                ctx.strokeStyle = '#ff9800';
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = 0.5;
            }
            ctx.stroke();
        }
    }

    if (polygon.length > 0) {
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const first = worldToScreen(polygon[0].x, polygon[0].y, bounds);
        ctx.moveTo(first.x, first.y);
        
        for (let i = 1; i < polygon.length; i++) {
            const p = worldToScreen(polygon[i].x, polygon[i].y, bounds);
            ctx.lineTo(p.x, p.y);
        }
        
        ctx.closePath();
        ctx.stroke();
        
        ctx.fillStyle = '#667eea';
        for (const p of polygon) {
            const sp = worldToScreen(p.x, p.y, bounds);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (mesh && mesh.boundary_nodes) {
        ctx.fillStyle = '#ef6c00';
        for (const idx of mesh.boundary_nodes) {
            const p = mesh.points[idx];
            const sp = worldToScreen(p.x, p.y, bounds);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

window.addEventListener('load', () => {
    setPreset('square');
    render();
});
