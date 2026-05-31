const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

let addon = null;
try {
  addon = require('./target/release/poisson_solver');
  console.log('Loaded release build');
} catch (e) {
  try {
    addon = require('./target/debug/poisson_solver');
    console.log('Loaded debug build');
  } catch (e2) {
    console.log('Native addon not found. Run `npm run build` first.');
    console.log('Error:', e2.message);
  }
}

app.post('/api/parse-svg', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { pathData } = req.body;
    const points = addon.parseSvgPathToPoints(pathData);
    res.json({ points });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/generate-mesh', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { polygon, density } = req.body;
    const result = addon.generateMeshFromPolygon(polygon, density);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/get-mesh-quality', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { mesh } = req.body;
    const quality = addon.getMeshQuality(mesh);
    res.json(quality);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/adaptive-solve', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { mesh, boundaryValues, rhsValue, config } = req.body;
    const result = addon.adaptiveSolvePoisson(mesh, boundaryValues, rhsValue, config);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/estimate-error', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { mesh, solution, refineFraction } = req.body;
    const errors = addon.estimateMeshError(mesh, solution, refineFraction);
    res.json({ errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/solve', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { mesh, boundaryValues, rhsValue, config } = req.body;
    const result = addon.solvePoissonEquation(mesh, boundaryValues, rhsValue, config);
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/save-vtk', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { result, filename } = req.body;
    const success = addon.saveVtkFile(result, filename);
    res.json({ success });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/get-vtk', (req, res) => {
  if (!addon) {
    return res.status(500).json({ error: 'Native addon not loaded' });
  }
  try {
    const { result } = req.body;
    const vtkContent = addon.getVtkString(result);
    res.setHeader('Content-Type', 'text/plain');
    res.send(vtkContent);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    addonLoaded: addon !== null 
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!addon) {
    console.log('Warning: Native addon not loaded. Build it with `npm run build`');
  }
});
