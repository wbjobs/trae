import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createVolumeShader } from './shaders/volumeShader.js';
import { createSliceShader } from './shaders/sliceShader.js';
import { clusterDrillHoles, calculateSimilarity, KMeans } from './utils/kmeans.js';

let scene, camera, renderer, controls;
let volumeMesh, slicePlane, wireframeMesh;
let modelData = null;
let currentMode = 'volume';
let sliceMode = null;
let slicePosition = 0.5;
let drillMode = false;
let drillHoles = [];
let selectedDrillIndex = -1;
let raycaster, mouse;
let isDragging = false;
let touchStartPos = { x: 0, y: 0 };
let hasMoved = false;
let labelsVisible = true;
let clusterResult = null;

const MOVE_THRESHOLD = 10;
const container = document.getElementById('canvas-container');

const ROCK_PROPERTIES = {
    0: { name: '表土层', resistivity: 50, density: 1.8 },
    1: { name: '砂岩', resistivity: 200, density: 2.3 },
    2: { name: '页岩', resistivity: 80, density: 2.4 },
    3: { name: '石灰岩', resistivity: 500, density: 2.7 },
    4: { name: '花岗岩', resistivity: 1000, density: 2.65 },
    5: { name: '玄武岩', resistivity: 300, density: 2.9 },
    6: { name: '大理岩', resistivity: 800, density: 2.7 },
    7: { name: '煤层', resistivity: 10000, density: 1.3 },
    8: { name: '砾岩', resistivity: 150, density: 2.5 },
    9: { name: '黏土岩', resistivity: 30, density: 2.2 }
};

init();
loadModel();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(150, 150, 150);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    scene.add(directionalLight);
    
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    window.addEventListener('resize', onWindowResize);
    setupCanvasEvents();
    setupControls();
    animate();
}

function loadModel() {
    fetch('/api/model/sample')
        .then(response => response.json())
        .then(data => {
            modelData = data;
            createVolumeVisualization();
            createBoundingBox();
            document.getElementById('loading').classList.add('hidden');
        })
        .catch(error => {
            console.error('加载模型失败:', error);
            document.getElementById('loading').textContent = '加载失败，请刷新页面重试';
        });
}

function createVolumeVisualization() {
    const { dimensions, spacing, origin, voxelData, layers, bounds } = modelData;
    
    const geometry = new THREE.BoxGeometry(
        dimensions[0] * spacing[0],
        dimensions[1] * spacing[1],
        dimensions[2] * spacing[2]
    );
    
    const colorTexture = createColorTexture(layers);
    
    const volumeMaterial = createVolumeShader({
        dimensions,
        spacing,
        origin,
        colorTexture,
        sliceMode: new THREE.Vector3(0, 0, 0),
        slicePosition: 0,
        bounds
    });
    
    volumeMesh = new THREE.Mesh(geometry, volumeMaterial);
    volumeMesh.position.set(
        origin[0] + dimensions[0] * spacing[0] / 2,
        origin[1] + dimensions[1] * spacing[1] / 2,
        origin[2] + dimensions[2] * spacing[2] / 2
    );
    scene.add(volumeMesh);
    
    const wireframeGeometry = new THREE.BoxGeometry(
        dimensions[0] * spacing[0],
        dimensions[1] * spacing[1],
        dimensions[2] * spacing[2]
    );
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.1
    });
    wireframeMesh = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    wireframeMesh.position.copy(volumeMesh.position);
    wireframeMesh.visible = false;
    scene.add(wireframeMesh);
}

function createColorTexture(layers) {
    const colors = new Uint8Array(256 * 3);
    
    for (let i = 0; i < layers.length && i < 256; i++) {
        colors[i * 3] = Math.floor(layers[i].color[0] * 255);
        colors[i * 3 + 1] = Math.floor(layers[i].color[1] * 255);
        colors[i * 3 + 2] = Math.floor(layers[i].color[2] * 255);
    }
    
    const texture = new THREE.DataTexture(colors, 256, 1, THREE.RGBFormat);
    texture.needsUpdate = true;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    
    return texture;
}

function createBoundingBox() {
    const { bounds } = modelData;
    const boxGeometry = new THREE.BoxGeometry(
        bounds[1] - bounds[0],
        bounds[3] - bounds[2],
        bounds[5] - bounds[4]
    );
    const edges = new THREE.EdgesGeometry(boxGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    const boundingBox = new THREE.LineSegments(edges, lineMaterial);
    boundingBox.position.set(
        (bounds[0] + bounds[1]) / 2,
        (bounds[2] + bounds[3]) / 2,
        (bounds[4] + bounds[5]) / 2
    );
    scene.add(boundingBox);
    
    const arrowHelperX = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(bounds[0], bounds[2], bounds[4]),
        20,
        0xff0000
    );
    scene.add(arrowHelperX);
    
    const arrowHelperY = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(bounds[0], bounds[2], bounds[4]),
        20,
        0x00ff00
    );
    scene.add(arrowHelperY);
    
    const arrowHelperZ = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(bounds[0], bounds[2], bounds[4]),
        20,
        0x0000ff
    );
    scene.add(arrowHelperZ);
}

function createSlicePlane(axis) {
    if (slicePlane) {
        scene.remove(slicePlane);
    }
    
    const { bounds } = modelData;
    slicePosition = THREE.MathUtils.clamp(slicePosition, 0.001, 0.999);
    
    let geometry, material;
    
    const sliceMaterial = createSliceShader({
        modelData,
        sliceAxis: axis
    });
    
    if (axis === 'x') {
        geometry = new THREE.PlaneGeometry(
            bounds[3] - bounds[2],
            bounds[5] - bounds[4]
        );
        slicePlane = new THREE.Mesh(geometry, sliceMaterial);
        slicePlane.rotation.y = -Math.PI / 2;
        slicePlane.position.x = bounds[0] + (bounds[1] - bounds[0]) * slicePosition;
        slicePlane.position.y = (bounds[2] + bounds[3]) / 2;
        slicePlane.position.z = (bounds[4] + bounds[5]) / 2;
    } else if (axis === 'y') {
        geometry = new THREE.PlaneGeometry(
            bounds[1] - bounds[0],
            bounds[5] - bounds[4]
        );
        slicePlane = new THREE.Mesh(geometry, sliceMaterial);
        slicePlane.rotation.x = Math.PI / 2;
        slicePlane.position.x = (bounds[0] + bounds[1]) / 2;
        slicePlane.position.y = bounds[2] + (bounds[3] - bounds[2]) * slicePosition;
        slicePlane.position.z = (bounds[4] + bounds[5]) / 2;
    } else {
        geometry = new THREE.PlaneGeometry(
            bounds[1] - bounds[0],
            bounds[3] - bounds[2]
        );
        slicePlane = new THREE.Mesh(geometry, sliceMaterial);
        slicePlane.position.x = (bounds[0] + bounds[1]) / 2;
        slicePlane.position.y = (bounds[2] + bounds[3]) / 2;
        slicePlane.position.z = bounds[4] + (bounds[5] - bounds[4]) * slicePosition;
    }
    
    scene.add(slicePlane);
}

function updateSlicePosition() {
    if (!slicePlane || !sliceMode || !modelData) return;
    
    slicePosition = THREE.MathUtils.clamp(slicePosition, 0.001, 0.999);
    
    const { bounds } = modelData;
    
    if (sliceMode === 'x') {
        slicePlane.position.x = bounds[0] + (bounds[1] - bounds[0]) * slicePosition;
        slicePlane.position.y = (bounds[2] + bounds[3]) / 2;
        slicePlane.position.z = (bounds[4] + bounds[5]) / 2;
        slicePlane.material.uniforms.slicePosition.value = slicePosition;
    } else if (sliceMode === 'y') {
        slicePlane.position.x = (bounds[0] + bounds[1]) / 2;
        slicePlane.position.y = bounds[2] + (bounds[3] - bounds[2]) * slicePosition;
        slicePlane.position.z = (bounds[4] + bounds[5]) / 2;
        slicePlane.material.uniforms.slicePosition.value = slicePosition;
    } else if (sliceMode === 'z') {
        slicePlane.position.x = (bounds[0] + bounds[1]) / 2;
        slicePlane.position.y = (bounds[2] + bounds[3]) / 2;
        slicePlane.position.z = bounds[4] + (bounds[5] - bounds[4]) * slicePosition;
        slicePlane.material.uniforms.slicePosition.value = slicePosition;
    }
    
    if (volumeMesh) {
        volumeMesh.material.uniforms.sliceMode.value = sliceMode;
        volumeMesh.material.uniforms.slicePosition.value = slicePosition;
    }
}

function setupCanvasEvents() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = false;
        hasMoved = false;
        touchStartPos.x = e.clientX;
        touchStartPos.y = e.clientY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (e.buttons === 1) {
            const dx = e.clientX - touchStartPos.x;
            const dy = e.clientY - touchStartPos.y;
            if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
                hasMoved = true;
            }
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (!hasMoved && !isDragging) {
            handleCanvasInteraction(e.clientX, e.clientY);
        }
        hasMoved = false;
    });
    
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            isDragging = false;
            hasMoved = false;
            touchStartPos.x = e.touches[0].clientX;
            touchStartPos.y = e.touches[0].clientY;
        }
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const dx = e.touches[0].clientX - touchStartPos.x;
            const dy = e.touches[0].clientY - touchStartPos.y;
            if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
                hasMoved = true;
            }
        }
    }, { passive: false });
    
    canvas.addEventListener('touchend', (e) => {
        if (!hasMoved && e.changedTouches.length === 1) {
            e.preventDefault();
            handleCanvasInteraction(
                e.changedTouches[0].clientX,
                e.changedTouches[0].clientY
            );
        }
        hasMoved = false;
    }, { passive: false });
    
    canvas.addEventListener('touchcancel', () => {
        hasMoved = false;
    });
}

function handleCanvasInteraction(clientX, clientY) {
    if (!drillMode || !modelData || !volumeMesh) return;
    
    const normalizedCoords = normalizeScreenCoords(clientX, clientY);
    if (!normalizedCoords) return;
    
    mouse.x = normalizedCoords.x;
    mouse.y = normalizedCoords.y;
    
    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObject(volumeMesh);
    
    if (intersects.length > 0) {
        const point = intersects[0].point;
        const clampedPoint = clampPointToModelBounds(point);
        createDrillHole(clampedPoint);
    }
}

function normalizeScreenCoords(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    
    if (clientX < rect.left || clientX > rect.right ||
        clientY < rect.top || clientY > rect.bottom) {
        return null;
    }
    
    return {
        x: ((clientX - rect.left) / rect.width) * 2 - 1,
        y: -((clientY - rect.top) / rect.height) * 2 + 1
    };
}

function clampPointToModelBounds(point) {
    if (!modelData) return point;
    
    const { bounds } = modelData;
    const epsilon = 0.001;
    
    return new THREE.Vector3(
        THREE.MathUtils.clamp(point.x, bounds[0] + epsilon, bounds[1] - epsilon),
        THREE.MathUtils.clamp(point.y, bounds[2] + epsilon, bounds[3] - epsilon),
        THREE.MathUtils.clamp(point.z, bounds[4] + epsilon, bounds[5] - epsilon)
    );
}

function createDrillHole(surfacePoint) {
    const { bounds } = modelData;
    const drillId = drillHoles.length + 1;
    
    const startPoint = new THREE.Vector3(surfacePoint.x, surfacePoint.y, bounds[5]);
    const endPoint = new THREE.Vector3(surfacePoint.x, surfacePoint.y, bounds[4]);
    
    const drillGeometry = new THREE.BufferGeometry();
    const drillPoints = [startPoint, endPoint];
    drillGeometry.setFromPoints(drillPoints);
    
    const drillMaterial = new THREE.LineBasicMaterial({ 
        color: 0xffffff, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    const drillLine = new THREE.Line(drillGeometry, drillMaterial);
    scene.add(drillLine);
    
    const markerGroup = new THREE.Group();
    
    const markerGeometry = new THREE.ConeGeometry(4, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff6b6b,
        transparent: true,
        opacity: 0.9
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.rotation.x = Math.PI;
    marker.position.set(0, 4, 0);
    markerGroup.add(marker);
    
    const baseGeometry = new THREE.CylinderGeometry(5, 5, 2, 16);
    const baseMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0, 0);
    markerGroup.add(base);
    
    markerGroup.position.copy(startPoint);
    scene.add(markerGroup);
    
    const labelCanvas = createDrillLabel(drillId);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMaterial = new THREE.SpriteMaterial({ 
        map: labelTexture,
        transparent: true
    });
    const labelSprite = new THREE.Sprite(labelMaterial);
    labelSprite.position.set(0, 12, 0);
    labelSprite.scale.set(15, 8, 1);
    markerGroup.add(labelSprite);
    
    const drillLog = computeDrillLocally(surfacePoint);
    const resistivityCurve = generateResistivityCurve(drillLog);
    
    const drillHole = {
        id: drillId,
        line: drillLine,
        marker: markerGroup,
        label: labelSprite,
        position: { x: surfacePoint.x, y: surfacePoint.y },
        drillLog: drillLog,
        resistivityCurve: resistivityCurve,
        cluster: -1,
        clusterColor: 0xff6b6b,
        selected: false
    };
    
    drillHoles.push(drillHole);
    selectedDrillIndex = drillHoles.length - 1;
    
    updateDrillList();
    displayCoreLog(drillLog, drillId);
    updateDrillCount();
    
    if (drillHoles.length >= 2) {
        runClusterAnalysis();
    }
}

function createDrillLabel(id) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(0, 0, 128, 64, 8);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ZK${id}`, 64, 32);
    
    return canvas;
}

function generateResistivityCurve(drillLog) {
    const curve = [];
    const numSamples = 50;
    
    for (let i = 0; i <= numSamples; i++) {
        const depth = (i / numSamples) * drillLog.totalDepth;
        let resistivity = 0;
        
        for (const layer of drillLog.layers) {
            if (depth >= layer.startDepth && depth <= layer.endDepth) {
                const props = ROCK_PROPERTIES[layer.layerId] || { resistivity: 100 };
                const noise = (Math.random() - 0.5) * 0.2;
                resistivity = props.resistivity * (1 + noise);
                break;
            }
        }
        
        curve.push({
            depth: depth,
            resistivity: resistivity
        });
    }
    
    return curve;
}

function computeDrillLocally(surfacePoint) {
    const { bounds, origin, spacing, dimensions, voxelData, layers } = modelData;
    
    const totalDepth = bounds[5] - bounds[4];
    const stepSize = 1;
    const numSteps = Math.ceil(totalDepth / stepSize);
    
    const logLayers = [];
    let currentLayerId = -1;
    let startDepth = 0;
    
    for (let i = 0; i <= numSteps; i++) {
        const z = bounds[5] - i * stepSize;
        
        const x = Math.floor((surfacePoint.x - origin[0]) / spacing[0]);
        const y = Math.floor((surfacePoint.y - origin[1]) / spacing[1]);
        const zIdx = Math.floor((z - origin[2]) / spacing[2]);
        
        if (x < 0 || x >= dimensions[0] || y < 0 || y >= dimensions[1] || zIdx < 0 || zIdx >= dimensions[2]) {
            continue;
        }
        
        const index = zIdx * dimensions[0] * dimensions[1] + y * dimensions[0] + x;
        const layerId = voxelData[index];
        
        if (layerId !== currentLayerId) {
            if (currentLayerId !== -1) {
                const layer = layers[currentLayerId];
                logLayers.push({
                    layerId: currentLayerId,
                    rockType: layer.name,
                    color: layer.color,
                    startDepth: startDepth,
                    endDepth: i * stepSize,
                    thickness: i * stepSize - startDepth,
                    description: layer.description
                });
            }
            startDepth = i * stepSize;
            currentLayerId = layerId;
        }
    }
    
    if (currentLayerId !== -1) {
        const layer = layers[currentLayerId];
        logLayers.push({
            layerId: currentLayerId,
            rockType: layer.name,
            color: layer.color,
            startDepth: startDepth,
            endDepth: totalDepth,
            thickness: totalDepth - startDepth,
            description: layer.description
        });
    }
    
    return {
        position: { x: surfacePoint.x, y: surfacePoint.y },
        totalDepth,
        layers: logLayers,
        timestamp: Date.now()
    };
}

function displayCoreLog(drillLog, drillId) {
    const container = document.getElementById('core-log-container');
    const layersContainer = document.getElementById('core-layers');
    const maxDepthSpan = document.getElementById('max-depth');
    
    container.classList.remove('hidden');
    layersContainer.innerHTML = '';
    
    maxDepthSpan.textContent = `${drillLog.totalDepth.toFixed(0)}m`;
    
    drillLog.layers.forEach(layer => {
        const layerDiv = document.createElement('div');
        layerDiv.className = 'core-layer';
        layerDiv.style.height = `${(layer.thickness / drillLog.totalDepth) * 100}%`;
        layerDiv.style.backgroundColor = `rgb(${layer.color.map(c => Math.round(c * 255)).join(',')})`;
        layerDiv.style.color = getContrastColor(layer.color);
        layerDiv.textContent = layer.rockType;
        layerDiv.title = `${layer.rockType}: ${layer.startDepth.toFixed(1)}m - ${layer.endDepth.toFixed(1)}m (${layer.thickness.toFixed(1)}m)`;
        layersContainer.appendChild(layerDiv);
    });
    
    document.getElementById('info-id').textContent = `ZK${drillId}`;
    document.getElementById('info-pos').textContent = `(${drillLog.position.x.toFixed(1)}, ${drillLog.position.y.toFixed(1)})`;
    document.getElementById('info-depth').textContent = `${drillLog.totalDepth.toFixed(1)}m`;
    document.getElementById('info-layers').textContent = drillLog.layers.length;
}

function updateDrillCount() {
    const countEl = document.getElementById('drill-count');
    if (countEl) {
        countEl.textContent = drillHoles.length;
    }
}

function getContrastColor(rgb) {
    const brightness = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    return brightness > 0.5 ? '#000000' : '#ffffff';
}

function updateDrillList() {
    const listContainer = document.getElementById('drill-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    drillHoles.forEach((hole, index) => {
        const item = document.createElement('div');
        item.className = 'drill-list-item';
        item.dataset.index = index;
        
        if (index === selectedDrillIndex) {
            item.classList.add('selected');
        }
        
        item.innerHTML = `
            <span class="drill-id">ZK${hole.id}</span>
            <span class="drill-pos">(${hole.position.x.toFixed(0)}, ${hole.position.y.toFixed(0)})</span>
            <span class="drill-depth">${hole.drillLog.totalDepth.toFixed(0)}m</span>
            ${hole.cluster >= 0 ? `<span class="cluster-badge" style="background: #${hole.clusterColor.toString(16).padStart(6, '0')}">C${hole.cluster + 1}</span>` : ''}
        `;
        
        item.addEventListener('click', () => selectDrill(index));
        listContainer.appendChild(item);
    });
}

function selectDrill(index) {
    if (index < 0 || index >= drillHoles.length) return;
    
    drillHoles.forEach((hole, i) => {
        hole.selected = (i === index);
        hole.line.material.opacity = (i === index) ? 1 : 0.5;
        hole.marker.children[0].material.opacity = (i === index) ? 1 : 0.6;
    });
    
    selectedDrillIndex = index;
    const hole = drillHoles[index];
    displayCoreLog(hole.drillLog, hole.id);
    updateDrillList();
}

function runClusterAnalysis() {
    if (drillHoles.length < 2) return;
    
    const k = Math.min(3, drillHoles.length);
    clusterResult = clusterDrillHoles(drillHoles, k);
    
    drillHoles.forEach(hole => {
        hole.marker.children[0].material.color.setHex(hole.clusterColor);
    });
    
    updateDrillList();
    updateClusterLegend();
    showToolHint(`聚类完成：${k} 个聚类组`);
}

function updateClusterLegend() {
    const legend = document.getElementById('cluster-legend');
    if (!legend || !clusterResult) return;
    
    legend.innerHTML = '';
    
    Object.keys(clusterResult.clusters).sort().forEach(clusterId => {
        const count = clusterResult.clusters[clusterId].length;
        const color = clusterResult.clusterColors[clusterId];
        
        const item = document.createElement('div');
        item.className = 'cluster-legend-item';
        item.innerHTML = `
            <span class="cluster-color" style="background: #${color.toString(16).padStart(6, '0')}"></span>
            <span>聚类 ${parseInt(clusterId) + 1}: ${count} 个钻孔</span>
        `;
        legend.appendChild(item);
    });
}

function showComparisonChart() {
    if (drillHoles.length < 2) {
        alert('请至少创建2个钻孔进行对比');
        return;
    }
    
    const chartContainer = document.getElementById('comparison-chart');
    if (!chartContainer) return;
    
    chartContainer.innerHTML = '';
    chartContainer.classList.remove('hidden');
    
    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.innerHTML = `
        <span>多钻孔对比分析</span>
        <button class="close-btn" onclick="document.getElementById('comparison-chart').classList.add('hidden')">×</button>
    `;
    chartContainer.appendChild(chartTitle);
    
    const chartContent = document.createElement('div');
    chartContent.className = 'chart-content';
    
    const lithologySection = document.createElement('div');
    lithologySection.className = 'chart-section';
    lithologySection.innerHTML = '<h4>深度-岩性对比图</h4>';
    
    const lithologyChart = document.createElement('div');
    lithologyChart.className = 'lithology-chart';
    
    const maxDepth = Math.max(...drillHoles.map(h => h.drillLog.totalDepth));
    
    const headers = document.createElement('div');
    headers.className = 'chart-headers';
    headers.innerHTML = '<div class="depth-scale">深度(m)</div>';
    drillHoles.forEach(hole => {
        headers.innerHTML += `<div class="drill-header">ZK${hole.id}</div>`;
    });
    lithologyChart.appendChild(headers);
    
    const rows = document.createElement('div');
    rows.className = 'chart-rows';
    
    const depthScale = document.createElement('div');
    depthScale.className = 'depth-scale';
    for (let d = 0; d <= maxDepth; d += 20) {
        depthScale.innerHTML += `<div class="depth-mark" style="top: ${(d / maxDepth) * 100}%">${d}</div>`;
    }
    rows.appendChild(depthScale);
    
    drillHoles.forEach(hole => {
        const drillColumn = document.createElement('div');
        drillColumn.className = 'drill-column';
        
        hole.drillLog.layers.forEach(layer => {
            const layerDiv = document.createElement('div');
            layerDiv.className = 'chart-layer';
            layerDiv.style.top = `${(layer.startDepth / maxDepth) * 100}%`;
            layerDiv.style.height = `${(layer.thickness / maxDepth) * 100}%`;
            layerDiv.style.backgroundColor = `rgb(${layer.color.map(c => Math.round(c * 255)).join(',')})`;
            layerDiv.title = `${layer.rockType}: ${layer.startDepth.toFixed(0)}-${layer.endDepth.toFixed(0)}m`;
            drillColumn.appendChild(layerDiv);
        });
        
        rows.appendChild(drillColumn);
    });
    
    lithologyChart.appendChild(rows);
    lithologySection.appendChild(lithologyChart);
    chartContent.appendChild(lithologySection);
    
    const resistivitySection = document.createElement('div');
    resistivitySection.className = 'chart-section';
    resistivitySection.innerHTML = '<h4>电阻率曲线对比</h4>';
    
    const resistivityChart = document.createElement('canvas');
    resistivityChart.width = 600;
    resistivityChart.height = 300;
    resistivityChart.className = 'resistivity-chart';
    
    const ctx = resistivityChart.getContext('2d');
    const padding = 50;
    const chartWidth = resistivityChart.width - padding * 2;
    const chartHeight = resistivityChart.height - padding * 2;
    
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, resistivityChart.width, resistivityChart.height);
    
    const maxResistivity = Math.max(...drillHoles.flatMap(h => 
        h.resistivityCurve.map(p => p.resistivity)
    ));
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const x = padding + (i / 5) * chartWidth;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, padding + chartHeight);
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#555';
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i / 5) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + chartWidth, y);
        ctx.stroke();
    }
    
    const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181'];
    drillHoles.forEach((hole, index) => {
        ctx.strokeStyle = colors[index % colors.length];
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        hole.resistivityCurve.forEach((point, i) => {
            const x = padding + (point.depth / maxDepth) * chartWidth;
            const y = padding + chartHeight - (point.resistivity / maxResistivity) * chartHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    });
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i / 5) * chartHeight;
        const value = Math.round(maxResistivity * (1 - i / 5));
        ctx.fillText(`${value}`, padding - 10, y + 4);
    }
    
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
        const x = padding + (i / 5) * chartWidth;
        const value = Math.round(maxDepth * (i / 5));
        ctx.fillText(`${value}m`, x, padding + chartHeight + 20);
    }
    
    ctx.fillText('深度 →', padding + chartWidth / 2, padding + chartHeight + 35);
    ctx.save();
    ctx.translate(15, padding + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('电阻率 (Ω·m) ↑', 0, 0);
    ctx.restore();
    
    const legend = document.createElement('div');
    legend.className = 'resistivity-legend';
    drillHoles.forEach((hole, index) => {
        legend.innerHTML += `
            <span class="legend-item">
                <span class="legend-color" style="background: ${colors[index % colors.length]}"></span>
                ZK${hole.id}
            </span>
        `;
    });
    
    resistivitySection.appendChild(resistivityChart);
    resistivitySection.appendChild(legend);
    chartContent.appendChild(resistivitySection);
    
    if (clusterResult) {
        const similaritySection = document.createElement('div');
        similaritySection.className = 'chart-section';
        similaritySection.innerHTML = '<h4>钻孔相似度矩阵</h4>';
        
        const matrix = document.createElement('div');
        matrix.className = 'similarity-matrix';
        
        const headerRow = document.createElement('div');
        headerRow.className = 'matrix-row matrix-header';
        headerRow.innerHTML = '<div class="matrix-cell"></div>';
        drillHoles.forEach(hole => {
            headerRow.innerHTML += `<div class="matrix-cell">ZK${hole.id}</div>`;
        });
        matrix.appendChild(headerRow);
        
        drillHoles.forEach((hole1, i) => {
            const row = document.createElement('div');
            row.className = 'matrix-row';
            row.innerHTML = `<div class="matrix-cell matrix-label">ZK${hole1.id}</div>`;
            
            drillHoles.forEach((hole2, j) => {
                const similarity = calculateSimilarity(hole1.drillLog, hole2.drillLog);
                const intensity = Math.floor(similarity * 255);
                const cell = document.createElement('div');
                cell.className = 'matrix-cell';
                cell.style.backgroundColor = `rgb(${255 - intensity}, ${intensity}, 100)`;
                cell.textContent = similarity.toFixed(2);
                cell.title = `相似度: ${(similarity * 100).toFixed(1)}%`;
                row.appendChild(cell);
            });
            
            matrix.appendChild(row);
        });
        
        similaritySection.appendChild(matrix);
        chartContent.appendChild(similaritySection);
    }
    
    chartContainer.appendChild(chartContent);
}

function setupControls() {
    document.getElementById('btn-volume').addEventListener('click', () => {
        setDisplayMode('volume');
    });
    
    document.getElementById('btn-surface').addEventListener('click', () => {
        setDisplayMode('surface');
    });
    
    document.getElementById('btn-wireframe').addEventListener('click', () => {
        setDisplayMode('wireframe');
    });
    
    document.getElementById('btn-slice-x').addEventListener('click', () => {
        setSliceMode('x');
    });
    
    document.getElementById('btn-slice-y').addEventListener('click', () => {
        setSliceMode('y');
    });
    
    document.getElementById('btn-slice-z').addEventListener('click', () => {
        setSliceMode('z');
    });
    
    document.getElementById('btn-slice-reset').addEventListener('click', () => {
        resetSlice();
    });
    
    document.getElementById('slice-slider').addEventListener('input', (e) => {
        const rawValue = parseInt(e.target.value);
        slicePosition = THREE.MathUtils.clamp(rawValue / 100, 0.001, 0.999);
        const displayValue = Math.round(slicePosition * 100);
        document.getElementById('slice-value').textContent = displayValue;
        e.target.value = displayValue;
        updateSlicePosition();
    });
    
    document.getElementById('btn-drill').addEventListener('click', () => {
        drillMode = !drillMode;
        const btn = document.getElementById('btn-drill');
        btn.classList.toggle('active', drillMode);
        showToolHint(drillMode ? '钻井模式已启用，点击模型表面创建钻孔' : '钻井模式已关闭');
        renderer.domElement.style.cursor = drillMode ? 'crosshair' : 'default';
    });
    
    document.getElementById('btn-export-log').addEventListener('click', () => {
        exportDrillLog();
    });
    
    document.getElementById('btn-export-all').addEventListener('click', () => {
        exportAllDrillLogs();
    });
    
    document.getElementById('btn-clear-drills').addEventListener('click', () => {
        clearDrillHoles();
    });
    
    document.getElementById('btn-compare').addEventListener('click', () => {
        showComparisonChart();
    });
    
    document.getElementById('btn-cluster').addEventListener('click', () => {
        runClusterAnalysis();
    });
    
    document.getElementById('btn-toggle-labels').addEventListener('click', () => {
        labelsVisible = !labelsVisible;
        drillHoles.forEach(hole => {
            hole.label.visible = labelsVisible;
        });
        showToolHint(labelsVisible ? '标签已显示' : '标签已隐藏');
    });
}

function setDisplayMode(mode) {
    currentMode = mode;
    
    document.querySelectorAll('#btn-volume, #btn-surface, #btn-wireframe').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${mode}`).classList.add('active');
    
    if (volumeMesh) {
        volumeMesh.visible = (mode === 'volume' || mode === 'surface');
        if (mode === 'surface') {
            volumeMesh.material.uniforms.renderMode.value = 1;
        } else {
            volumeMesh.material.uniforms.renderMode.value = 0;
        }
    }
    
    if (wireframeMesh) {
        wireframeMesh.visible = (mode === 'wireframe');
    }
}

function setSliceMode(axis) {
    sliceMode = axis;
    slicePosition = THREE.MathUtils.clamp(slicePosition, 0.001, 0.999);
    
    document.querySelectorAll('#btn-slice-x, #btn-slice-y, #btn-slice-z').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-slice-${axis}`).classList.add('active');
    
    document.getElementById('slice-control-group').style.display = 'block';
    
    const slider = document.getElementById('slice-slider');
    const displayValue = Math.round(slicePosition * 100);
    slider.value = displayValue;
    document.getElementById('slice-value').textContent = displayValue;
    
    createSlicePlane(axis);
    
    if (volumeMesh) {
        const sliceVector = new THREE.Vector3(
            axis === 'x' ? 1 : 0,
            axis === 'y' ? 1 : 0,
            axis === 'z' ? 1 : 0
        );
        volumeMesh.material.uniforms.sliceMode.value = sliceVector;
        volumeMesh.material.uniforms.slicePosition.value = slicePosition;
    }
}

function resetSlice() {
    sliceMode = null;
    document.querySelectorAll('#btn-slice-x, #btn-slice-y, #btn-slice-z').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById('slice-control-group').style.display = 'none';
    
    if (slicePlane) {
        scene.remove(slicePlane);
        slicePlane = null;
    }
    
    if (volumeMesh) {
        volumeMesh.material.uniforms.sliceMode.value = new THREE.Vector3(0, 0, 0);
        volumeMesh.material.uniforms.slicePosition.value = 0;
    }
}

function exportDrillLog() {
    if (selectedDrillIndex < 0 || !drillHoles[selectedDrillIndex]) {
        alert('请先选择一个钻孔');
        return;
    }
    
    const drillLog = drillHoles[selectedDrillIndex].drillLog;
    const drillId = drillHoles[selectedDrillIndex].id;
    
    const format = confirm('点击确定导出CSV格式，取消导出TXT格式') ? 'csv' : 'txt';
    
    if (format === 'csv') {
        let csv = '层号,岩石类型,起始深度(m),终止深度(m),厚度(m),岩性描述\n';
        drillLog.layers.forEach((layer, index) => {
            csv += `${index + 1},"${layer.rockType}",${layer.startDepth.toFixed(2)},${layer.endDepth.toFixed(2)},${layer.thickness.toFixed(2)},"${layer.description}"\n`;
        });
        downloadFile(csv, `drill_ZK${drillId}_log_${Date.now()}.csv`, 'text/csv');
    } else {
        let log = `========================================\n`;
        log += `钻孔地质日志 - ZK${drillId}\n`;
        log += `生成时间: ${new Date(drillLog.timestamp).toLocaleString()}\n`;
        log += `钻孔坐标: X=${drillLog.position.x.toFixed(2)}, Y=${drillLog.position.y.toFixed(2)}\n`;
        log += `钻探总深度: ${drillLog.totalDepth.toFixed(2)} 米\n`;
        log += `========================================\n\n`;
        log += `岩层序列:\n`;
        log += `----------------------------------------\n`;
        
        drillLog.layers.forEach((layer, index) => {
            log += `层序 ${index + 1}:\n`;
            log += `  岩石类型: ${layer.rockType}\n`;
            log += `  深度区间: ${layer.startDepth.toFixed(2)}m - ${layer.endDepth.toFixed(2)}m\n`;
            log += `  地层厚度: ${layer.thickness.toFixed(2)}m\n`;
            log += `  岩性描述: ${layer.description}\n`;
            log += `----------------------------------------\n`;
        });
        
        downloadFile(log, `drill_ZK${drillId}_log_${Date.now()}.txt`, 'text/plain');
    }
}

function exportAllDrillLogs() {
    if (drillHoles.length === 0) {
        alert('没有可导出的钻孔数据');
        return;
    }
    
    const format = confirm('点击确定导出CSV格式，取消导出TXT格式') ? 'csv' : 'txt';
    
    if (format === 'csv') {
        let csv = '钻孔ID,层号,岩石类型,起始深度(m),终止深度(m),厚度(m),X坐标,Y坐标,岩性描述\n';
        drillHoles.forEach(hole => {
            hole.drillLog.layers.forEach((layer, index) => {
                csv += `ZK${hole.id},${index + 1},"${layer.rockType}",${layer.startDepth.toFixed(2)},${layer.endDepth.toFixed(2)},${layer.thickness.toFixed(2)},${hole.position.x.toFixed(2)},${hole.position.y.toFixed(2)},"${layer.description}"\n`;
            });
        });
        downloadFile(csv, `all_drill_logs_${Date.now()}.csv`, 'text/csv');
    } else {
        let log = `========================================\n`;
        log += `多钻孔地质综合报告\n`;
        log += `生成时间: ${new Date().toLocaleString()}\n`;
        log += `钻孔总数: ${drillHoles.length}\n`;
        if (clusterResult) {
            log += `聚类组数: ${Object.keys(clusterResult.clusters).length}\n`;
        }
        log += `========================================\n\n`;
        
        drillHoles.forEach(hole => {
            log += `\n========================================\n`;
            log += `钻孔 ZK${hole.id}\n`;
            log += `位置: (${hole.position.x.toFixed(2)}, ${hole.position.y.toFixed(2)})\n`;
            log += `总深度: ${hole.drillLog.totalDepth.toFixed(2)}m\n`;
            if (hole.cluster >= 0) {
                log += `聚类组: ${hole.cluster + 1}\n`;
            }
            log += `========================================\n`;
            
            hole.drillLog.layers.forEach((layer, index) => {
                log += `${index + 1}. ${layer.rockType}: ${layer.startDepth.toFixed(1)}m - ${layer.endDepth.toFixed(1)}m (厚${layer.thickness.toFixed(1)}m)\n`;
            });
        });
        
        downloadFile(log, `all_drill_logs_${Date.now()}.txt`, 'text/plain');
    }
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function clearDrillHoles() {
    drillHoles.forEach(hole => {
        scene.remove(hole.line);
        scene.remove(hole.marker);
    });
    drillHoles = [];
    selectedDrillIndex = -1;
    clusterResult = null;
    
    document.getElementById('core-log-container').classList.add('hidden');
    document.getElementById('comparison-chart').classList.add('hidden');
    
    updateDrillList();
    updateDrillCount();
    const legend = document.getElementById('cluster-legend');
    if (legend) legend.innerHTML = '';
    
    const drillList = document.getElementById('drill-list');
    if (drillList) {
        drillList.innerHTML = '<div style="padding: 15px; text-align: center; color: #666; font-size: 12px;">暂无钻孔数据</div>';
    }
}

function showToolHint(text) {
    const hint = document.getElementById('tool-hint');
    hint.textContent = text;
    hint.classList.add('show');
    setTimeout(() => {
        hint.classList.remove('show');
    }, 3000);
}

function onWindowResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
