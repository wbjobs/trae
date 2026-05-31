import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let atomData = [];
let bonds = [];
let instancedMeshes = [];
let selectedAtomIndex = -1;
let hoveredAtomIndex = -1;
let infoPanelElement = null;
let orbitMeshes = new Map();
let raycaster, mouse;
let dummy = new THREE.Object3D();

const ATOM_RADIUS = 0.15;
const BOND_RADIUS = 0.04;
const C60_RADIUS = 2.5;

const LOD_LEVELS = [
    { distance: 0, segments: 32, name: 'high' },
    { distance: 6, segments: 16, name: 'medium' },
    { distance: 12, segments: 8, name: 'low' }
];

let lodGeometries = [];
let atomColor = new THREE.Color(0x333333);
let hoverColor = new THREE.Color(0x4466aa);
let selectedColor = new THREE.Color(0x66aaff);

function init() {
    const container = document.getElementById('canvas-container');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 8, 30);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 7);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 30;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.5;
    
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    createLODGeometries();
    setupLighting();
    createMolecule();
    createEnvironment();
    setupEventListeners();
    
    animate();
}

function createLODGeometries() {
    lodGeometries = LOD_LEVELS.map(level => {
        const geom = new THREE.SphereGeometry(ATOM_RADIUS, level.segments, level.segments);
        geom.userData.lodLevel = level;
        return geom;
    });
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 10, 7);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    scene.add(mainLight);
    
    const fillLight = new THREE.DirectionalLight(0x6688ff, 0.4);
    fillLight.position.set(-5, -3, -5);
    scene.add(fillLight);
    
    const rimLight = new THREE.DirectionalLight(0xff8866, 0.3);
    rimLight.position.set(0, -10, 0);
    scene.add(rimLight);
    
    const pointLight1 = new THREE.PointLight(0x4488ff, 0.5, 10);
    pointLight1.position.set(3, 2, 3);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xff4488, 0.3, 10);
    pointLight2.position.set(-3, -2, -3);
    scene.add(pointLight2);
}

function generateC60Coordinates() {
    const phi = (1 + Math.sqrt(5)) / 2;
    const coords = [];
    
    const a = 1 / Math.sqrt(phi * phi + 1);
    const b = phi * a;
    
    const vertices = [
        [a, b, 0], [-a, b, 0], [a, -b, 0], [-a, -b, 0],
        [b, 0, a], [-b, 0, a], [b, 0, -a], [-b, 0, -a],
        [0, a, b], [0, -a, b], [0, a, -b], [0, -a, -b]
    ];
    
    vertices.forEach(v => {
        for (let i = 0; i < 8; i++) {
            const sx = (i & 1) ? -1 : 1;
            const sy = (i & 2) ? -1 : 1;
            const sz = (i & 4) ? -1 : 1;
            coords.push([v[0] * sx, v[1] * sy, v[2] * sz]);
        }
    });
    
    const uniqueCoords = [];
    const seen = new Set();
    coords.forEach(c => {
        const key = c.map(x => x.toFixed(6)).join(',');
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCoords.push(c);
        }
    });
    
    const scaled = uniqueCoords.map(c => {
        const len = Math.sqrt(c[0]*c[0] + c[1]*c[1] + c[2]*c[2]);
        return [c[0]/len * C60_RADIUS, c[1]/len * C60_RADIUS, c[2]/len * C60_RADIUS];
    });
    
    return scaled;
}

function findBonds(atomPositions) {
    const bonds = [];
    const bondDistance = 1.4;
    
    for (let i = 0; i < atomPositions.length; i++) {
        for (let j = i + 1; j < atomPositions.length; j++) {
            const dx = atomPositions[i][0] - atomPositions[j][0];
            const dy = atomPositions[i][1] - atomPositions[j][1];
            const dz = atomPositions[i][2] - atomPositions[j][2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist < bondDistance) {
                bonds.push([i, j]);
            }
        }
    }
    return bonds;
}

function createInstancedMeshes(atomPositions) {
    const material = new THREE.MeshPhongMaterial({
        color: 0x333333,
        emissive: 0x111111,
        shininess: 100,
        specular: 0x666666
    });
    
    instancedMeshes = lodGeometries.map((geom, lodIndex) => {
        const instancedMesh = new THREE.InstancedMesh(
            geom,
            material.clone(),
            atomPositions.length
        );
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.userData.lodIndex = lodIndex;
        instancedMesh.userData.atomIndices = new Array(atomPositions.length).fill(-1);
        instancedMesh.count = 0;
        return instancedMesh;
    });
    
    instancedMeshes.forEach(mesh => scene.add(mesh));
}

function updateInstancedMeshes() {
    const cameraPos = camera.position;
    const lodAssignments = new Array(LOD_LEVELS.length).fill(null).map(() => []);
    
    atomData.forEach((atom, index) => {
        const distance = cameraPos.distanceTo(atom.position);
        let lodLevel = 0;
        for (let i = LOD_LEVELS.length - 1; i >= 0; i--) {
            if (distance >= LOD_LEVELS[i].distance) {
                lodLevel = i;
                break;
            }
        }
        atom.currentLOD = lodLevel;
        lodAssignments[lodLevel].push(index);
    });
    
    lodAssignments.forEach((indices, lodIndex) => {
        const mesh = instancedMeshes[lodIndex];
        mesh.count = indices.length;
        mesh.userData.atomIndices = indices;
        
        indices.forEach((atomIndex, instanceIndex) => {
            const atom = atomData[atomIndex];
            dummy.position.copy(atom.position);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(instanceIndex, dummy.matrix);
            
            let color = atomColor;
            if (atomIndex === selectedAtomIndex) {
                color = selectedColor;
            } else if (atomIndex === hoveredAtomIndex) {
                color = hoverColor;
            }
            mesh.setColorAt(instanceIndex, color);
        });
        
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    });
}

function createMolecule() {
    const atomPositions = generateC60Coordinates();
    const bondPairs = findBonds(atomPositions);
    
    atomData = atomPositions.map((pos, index) => ({
        index: index,
        position: new THREE.Vector3(pos[0], pos[1], pos[2]),
        element: 'C',
        elementName: '碳',
        atomicNumber: 6,
        currentLOD: 0
    }));
    
    createInstancedMeshes(atomPositions);
    
    const bondMaterial = new THREE.MeshPhongMaterial({
        color: 0x555555,
        emissive: 0x222222,
        shininess: 50
    });
    
    const bondGeometry = new THREE.CylinderGeometry(BOND_RADIUS, BOND_RADIUS, 1, 8);
    
    bondPairs.forEach(([i, j]) => {
        const pos1 = atomData[i].position;
        const pos2 = atomData[j].position;
        
        const mid = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(pos2, pos1);
        const length = dir.length();
        
        const bond = new THREE.Mesh(bondGeometry, bondMaterial);
        bond.position.copy(mid);
        bond.scale.y = length;
        bond.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir.clone().normalize()
        );
        
        bond.castShadow = true;
        bond.receiveShadow = true;
        scene.add(bond);
        bonds.push(bond);
    });
    
    updateInstancedMeshes();
    
    console.log(`Created C60 with ${atomData.length} atoms and ${bonds.length} bonds using InstancedMesh`);
}

function createEnvironment() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 100;
        positions[i + 1] = (Math.random() - 0.5) * 100;
        positions[i + 2] = (Math.random() - 0.5) * 100;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.05,
        transparent: true,
        opacity: 0.6
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function getAtomIndexFromIntersect(intersect) {
    if (!intersect || !intersect.object) return -1;
    const mesh = intersect.object;
    if (mesh.isInstancedMesh && mesh.userData.atomIndices) {
        return mesh.userData.atomIndices[intersect.instanceId];
    }
    return -1;
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(instancedMeshes);
    
    if (intersects.length > 0) {
        const atomIndex = getAtomIndexFromIntersect(intersects[0]);
        if (atomIndex >= 0) {
            selectAtom(atomIndex, event.clientX, event.clientY);
            return;
        }
    }
    deselectAtom();
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(instancedMeshes);
    
    let newHoveredIndex = -1;
    if (intersects.length > 0) {
        newHoveredIndex = getAtomIndexFromIntersect(intersects[0]);
    }
    
    if (newHoveredIndex !== hoveredAtomIndex) {
        hoveredAtomIndex = newHoveredIndex;
        document.body.style.cursor = hoveredAtomIndex >= 0 ? 'pointer' : 'default';
        updateInstancedMeshes();
    }
}

function selectAtom(index, x, y) {
    selectedAtomIndex = index;
    updateInstancedMeshes();
    showInfoPanel(index, x, y);
}

function deselectAtom() {
    selectedAtomIndex = -1;
    updateInstancedMeshes();
    hideInfoPanel();
}

function showInfoPanel(index, x, y) {
    hideInfoPanel();
    
    const atom = atomData[index];
    const hasOrbit = orbitMeshes.has(index);
    
    infoPanelElement = document.createElement('div');
    infoPanelElement.className = 'info-panel';
    infoPanelElement.innerHTML = `
        <button class="close-btn" id="close-panel">×</button>
        <h3>原子 #${atom.index + 1}</h3>
        <div class="info-row">
            <span class="label">元素符号</span>
            <span class="value">${atom.element}</span>
        </div>
        <div class="info-row">
            <span class="label">元素名称</span>
            <span class="value">${atom.elementName}</span>
        </div>
        <div class="info-row">
            <span class="label">原子序数</span>
            <span class="value">${atom.atomicNumber}</span>
        </div>
        <div class="info-row">
            <span class="label">LOD级别</span>
            <span class="value">${LOD_LEVELS[atom.currentLOD].segments}分段</span>
        </div>
        <div class="info-row">
            <span class="label">X 坐标</span>
            <span class="value">${atom.position.x.toFixed(3)}</span>
        </div>
        <div class="info-row">
            <span class="label">Y 坐标</span>
            <span class="value">${atom.position.y.toFixed(3)}</span>
        </div>
        <div class="info-row">
            <span class="label">Z 坐标</span>
            <span class="value">${atom.position.z.toFixed(3)}</span>
        </div>
        <button class="orbit-btn ${hasOrbit ? 'remove' : ''}" id="toggle-orbit">
            ${hasOrbit ? '移除轨道' : '添加轨道'}
        </button>
    `;
    
    const panelWidth = 220;
    const panelHeight = 310;
    let posX = x + 20;
    let posY = y - panelHeight / 2;
    
    if (posX + panelWidth > window.innerWidth - 20) {
        posX = x - panelWidth - 20;
    }
    if (posY < 20) posY = 20;
    if (posY + panelHeight > window.innerHeight - 20) {
        posY = window.innerHeight - panelHeight - 20;
    }
    
    infoPanelElement.style.left = posX + 'px';
    infoPanelElement.style.top = posY + 'px';
    
    document.body.appendChild(infoPanelElement);
    
    document.getElementById('close-panel').addEventListener('click', (e) => {
        e.stopPropagation();
        deselectAtom();
    });
    
    document.getElementById('toggle-orbit').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleOrbit(index);
    });
}

function hideInfoPanel() {
    if (infoPanelElement && infoPanelElement.parentNode) {
        infoPanelElement.parentNode.removeChild(infoPanelElement);
    }
    infoPanelElement = null;
}

function toggleOrbit(atomIndex) {
    const atom = atomData[atomIndex];
    
    if (orbitMeshes.has(atomIndex)) {
        const orbit = orbitMeshes.get(atomIndex);
        scene.remove(orbit.mesh);
        orbitMeshes.delete(atomIndex);
    } else {
        const orbitRadius = ATOM_RADIUS * 2.5;
        const curve = new THREE.EllipseCurve(
            0, 0,
            orbitRadius, orbitRadius,
            0, 2 * Math.PI,
            false, 0
        );
        
        const points = curve.getPoints(64);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x66aaff,
            transparent: true,
            opacity: 0.8
        });
        
        const orbit = new THREE.Line(geometry, material);
        orbit.position.copy(atom.position);
        
        const randomAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();
        orbit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), randomAxis);
        
        scene.add(orbit);
        
        orbitMeshes.set(atomIndex, {
            mesh: orbit,
            atomData: atom,
            axis: randomAxis,
            speed: 0.02 + Math.random() * 0.02
        });
    }
    
    if (selectedAtomIndex === atomIndex) {
        const rect = infoPanelElement.getBoundingClientRect();
        showInfoPanel(atomIndex, rect.left, rect.top + rect.height / 2);
    }
}

function updateOrbits() {
    orbitMeshes.forEach((orbit) => {
        orbit.mesh.rotateOnAxis(orbit.axis, orbit.speed);
    });
}

function updateInfoPanelPosition() {
    if (selectedAtomIndex >= 0 && infoPanelElement) {
        const atom = atomData[selectedAtomIndex];
        const screenPos = atom.position.clone().project(camera);
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
        
        const panelWidth = infoPanelElement.offsetWidth;
        const panelHeight = infoPanelElement.offsetHeight;
        let posX = x + 20;
        let posY = y - panelHeight / 2;
        
        if (posX + panelWidth > window.innerWidth - 20) {
            posX = x - panelWidth - 20;
        }
        if (posY < 20) posY = 20;
        if (posY + panelHeight > window.innerHeight - 20) {
            posY = window.innerHeight - panelHeight - 20;
        }
        
        infoPanelElement.style.left = posX + 'px';
        infoPanelElement.style.top = posY + 'px';
    }
}

let lastLodUpdate = 0;
const LOD_UPDATE_INTERVAL = 100;

let isRecording = false;
let recordingStartTime = 0;
let recordingDuration = 5000;
let recordingFPS = 30;
let videoEncoder = null;
let encodedChunks = [];
let recordingOverlay = null;
let exportBtn = null;
let initialCameraPosition = new THREE.Vector3();
let initialCameraTarget = new THREE.Vector3();
let recordingRotationAngle = 0;
let frameCount = 0;
let totalFrames = 0;

class WebMMuxer {
    constructor(options = {}) {
        this.videoWidth = options.width || 1280;
        this.videoHeight = options.height || 720;
        this.fps = options.fps || 30;
        this.timescale = 1000000;
        this.duration = 0;
        this.clusters = [];
        this.currentCluster = null;
        this.firstVideoTimestamp = null;
    }

    ebmlEncode(id, data) {
        const idBytes = this.ebmlEncodeId(id);
        const sizeBytes = this.ebmlEncodeSize(data.length);
        const result = new Uint8Array(idBytes.length + sizeBytes.length + data.length);
        result.set(idBytes, 0);
        result.set(sizeBytes, idBytes.length);
        result.set(data, idBytes.length + sizeBytes.length);
        return result;
    }

    ebmlEncodeId(id) {
        if (id < 0x80) return new Uint8Array([id]);
        if (id < 0x4000) return new Uint8Array([(id >> 8) | 0x40, id & 0xff]);
        if (id < 0x200000) return new Uint8Array([(id >> 16) | 0x20, (id >> 8) & 0xff, id & 0xff]);
        return new Uint8Array([(id >> 24) | 0x10, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
    }

    ebmlEncodeSize(size) {
        if (size < 0x7f) return new Uint8Array([size | 0x80]);
        if (size < 0x3fff) return new Uint8Array([((size >> 8) | 0x40) & 0xff, size & 0xff]);
        if (size < 0x1fffff) return new Uint8Array([((size >> 16) | 0x20) & 0xff, (size >> 8) & 0xff, size & 0xff]);
        if (size < 0xfffffff) return new Uint8Array([((size >> 24) | 0x10) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff]);
        return new Uint8Array([0x08, (size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff]);
    }

    ebmlEncodeUint(num, length = 0) {
        if (length === 0) {
            if (num < 0x100) length = 1;
            else if (num < 0x10000) length = 2;
            else if (num < 0x1000000) length = 3;
            else if (num < 0x100000000) length = 4;
            else length = 8;
        }
        const bytes = new Uint8Array(length);
        for (let i = length - 1; i >= 0; i--) {
            bytes[i] = num & 0xff;
            num >>= 8;
        }
        return bytes;
    }

    ebmlEncodeFloat(num) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, num);
        return new Uint8Array(buffer);
    }

    createEBMLHeader() {
        const version = this.ebmlEncode(0x4286, this.ebmlEncodeUint(1, 1));
        const readVersion = this.ebmlEncode(0x42f7, this.ebmlEncodeUint(1, 1));
        const maxIdLength = this.ebmlEncode(0x42f2, this.ebmlEncodeUint(4, 1));
        const maxSizeLength = this.ebmlEncode(0x42f3, this.ebmlEncodeUint(8, 1));
        const docType = this.ebmlEncode(0x4282, new TextEncoder().encode('webm'));
        const docTypeVersion = this.ebmlEncode(0x4287, this.ebmlEncodeUint(2, 1));
        const docTypeReadVersion = this.ebmlEncode(0x4285, this.ebmlEncodeUint(2, 1));
        
        const headerData = this.concatUint8Arrays([
            version, readVersion, maxIdLength, maxSizeLength,
            docType, docTypeVersion, docTypeReadVersion
        ]);
        
        return this.ebmlEncode(0x1a45dfa3, headerData);
    }

    createSegment(duration, data) {
        const info = this.createInfo(duration);
        const tracks = this.createTracks();
        return this.ebmlEncode(0x18538067, this.concatUint8Arrays([info, tracks, data]));
    }

    createInfo(duration) {
        const timecodeScale = this.ebmlEncode(0x2ad7b1, this.ebmlEncodeUint(this.timescale, 4));
        const durationElem = this.ebmlEncode(0x4489, this.ebmlEncodeFloat(duration * (this.timescale / 1000)));
        const muxingApp = this.ebmlEncode(0x4d80, new TextEncoder().encode('WebCodecs Muxer'));
        const writingApp = this.ebmlEncode(0x5741, new TextEncoder().encode('Molecule Viewer'));
        
        const infoData = this.concatUint8Arrays([timecodeScale, durationElem, muxingApp, writingApp]);
        return this.ebmlEncode(0x1549a966, infoData);
    }

    createTracks() {
        const trackEntry = this.createVideoTrack();
        return this.ebmlEncode(0x1654ae6b, trackEntry);
    }

    createVideoTrack() {
        const trackNumber = this.ebmlEncode(0xd7, this.ebmlEncodeUint(1, 1));
        const trackUid = this.ebmlEncode(0x73c5, this.ebmlEncodeUint(1, 4));
        const trackType = this.ebmlEncode(0x83, this.ebmlEncodeUint(1, 1));
        const trackLacing = this.ebmlEncode(0x9c, this.ebmlEncodeUint(0, 1));
        const defaultDuration = this.ebmlEncode(0x23e383, this.ebmlEncodeUint(Math.round(1000 / this.fps * 1000000), 4));
        
        const videoSettings = this.createVideoSettings();
        const codecId = this.ebmlEncode(0x86, new TextEncoder().encode('V_VP8'));
        
        const trackData = this.concatUint8Arrays([
            trackNumber, trackUid, trackType, trackLacing,
            defaultDuration, codecId, videoSettings
        ]);
        
        return this.ebmlEncode(0xae, trackData);
    }

    createVideoSettings() {
        const pixelWidth = this.ebmlEncode(0xb0, this.ebmlEncodeUint(this.videoWidth, 2));
        const pixelHeight = this.ebmlEncode(0xba, this.ebmlEncodeUint(this.videoHeight, 2));
        const videoData = this.concatUint8Arrays([pixelWidth, pixelHeight]);
        return this.ebmlEncode(0xe0, videoData);
    }

    createCluster(timecode, frames) {
        const timecodeElem = this.ebmlEncode(0xe7, this.ebmlEncodeUint(timecode, 4));
        const blockData = this.concatUint8Arrays(frames.map(f => this.createSimpleBlock(f)));
        return this.ebmlEncode(0x1f43b675, this.concatUint8Arrays([timecodeElem, blockData]));
    }

    createSimpleBlock(frame) {
        const trackNumberBytes = this.ebmlEncodeUint(1, 1);
        const timecodeBytes = this.ebmlEncodeUint(frame.relativeTimecode, 2);
        const flags = new Uint8Array([frame.keyframe ? 0x80 : 0x00]);
        
        const header = this.concatUint8Arrays([trackNumberBytes, timecodeBytes, flags]);
        const blockData = this.concatUint8Arrays([header, frame.data]);
        
        return this.ebmlEncode(0xa3, blockData);
    }

    addFrame(frameData, timestamp, keyframe) {
        const microTimestamp = Math.round(timestamp * 1000);
        
        if (this.firstVideoTimestamp === null) {
            this.firstVideoTimestamp = microTimestamp;
        }
        
        const adjustedTimestamp = microTimestamp - this.firstVideoTimestamp;
        
        if (!this.currentCluster) {
            this.currentCluster = {
                timecode: adjustedTimestamp,
                frames: []
            };
        }
        
        const relativeTimecode = adjustedTimestamp - this.currentCluster.timecode;
        
        if (relativeTimecode > 3000000 && keyframe) {
            this.clusters.push(this.createCluster(
                Math.round(this.currentCluster.timecode),
                this.currentCluster.frames
            ));
            this.currentCluster = {
                timecode: adjustedTimestamp,
                frames: []
            };
        }
        
        this.currentCluster.frames.push({
            data: frameData,
            relativeTimecode: Math.round(relativeTimecode / 1000),
            keyframe: keyframe
        });
        
        this.duration = Math.max(this.duration, adjustedTimestamp / 1000);
    }

    finish() {
        if (this.currentCluster && this.currentCluster.frames.length > 0) {
            this.clusters.push(this.createCluster(
                Math.round(this.currentCluster.timecode),
                this.currentCluster.frames
            ));
        }
        
        const clusterData = this.concatUint8Arrays(this.clusters);
        const segment = this.createSegment(this.duration, clusterData);
        const header = this.createEBMLHeader();
        
        return this.concatUint8Arrays([header, segment]);
    }

    concatUint8Arrays(arrays) {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        arrays.forEach(arr => {
            result.set(arr, offset);
            offset += arr.length;
        });
        return result;
    }
}

function initVideoExport() {
    exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', startVideoExport);
    }
}

async function startVideoExport() {
    if (isRecording) return;
    
    if (!('VideoEncoder' in window)) {
        alert('您的浏览器不支持 WebCodecs API，请使用 Chrome 94+ 或 Edge 94+');
        return;
    }
    
    isRecording = true;
    encodedChunks = [];
    frameCount = 0;
    totalFrames = Math.floor(recordingDuration / 1000 * recordingFPS);
    
    initialCameraPosition.copy(camera.position);
    initialCameraTarget.copy(controls.target);
    recordingRotationAngle = 0;
    
    exportBtn.disabled = true;
    exportBtn.classList.add('recording');
    exportBtn.textContent = '🔴 录制中...';
    
    showRecordingOverlay();
    
    const width = Math.min(1920, window.innerWidth);
    const height = Math.min(1080, window.innerHeight);
    
    const muxer = new WebMMuxer({
        width: width,
        height: height,
        fps: recordingFPS
    });
    
    videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => {
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            muxer.addFrame(data, chunk.timestamp / 1000, chunk.type === 'key');
        },
        error: (e) => {
            console.error('Video encoder error:', e);
            stopRecording();
        }
    });
    
    const config = {
        codec: 'vp8',
        width: width,
        height: height,
        bitrate: 5000000,
        framerate: recordingFPS
    };
    
    try {
        await videoEncoder.configure(config);
    } catch (e) {
        console.error('Failed to configure encoder:', e);
        alert('视频编码配置失败，请尝试降低分辨率');
        stopRecording();
        return;
    }
    
    recordingStartTime = performance.now();
    recordFrame(muxer);
}

function recordFrame(muxer) {
    if (!isRecording) return;
    
    const elapsed = performance.now() - recordingStartTime;
    const progress = Math.min(elapsed / recordingDuration, 1);
    
    recordingRotationAngle = progress * Math.PI * 2;
    
    const radius = initialCameraPosition.distanceTo(initialCameraTarget);
    camera.position.x = initialCameraTarget.x + Math.sin(recordingRotationAngle) * radius;
    camera.position.z = initialCameraTarget.z + Math.cos(recordingRotationAngle) * radius;
    camera.position.y = initialCameraPosition.y;
    camera.lookAt(initialCameraTarget);
    
    controls.update();
    updateOrbits();
    updateInstancedMeshes();
    renderer.render(scene, camera);
    
    updateRecordingProgress(progress);
    
    renderer.domElement.toBlob(async (blob) => {
        if (!blob || !isRecording) return;
        
        const arrayBuffer = await blob.arrayBuffer();
        const imageData = new Uint8Array(arrayBuffer);
        
        const videoFrame = new VideoFrame(blob, {
            timestamp: frameCount * (1000000 / recordingFPS),
            duration: 1000000 / recordingFPS
        });
        
        const keyFrame = frameCount % 30 === 0;
        videoEncoder.encode(videoFrame, { keyFrame: keyFrame });
        videoFrame.close();
        
        frameCount++;
        
        if (progress >= 1) {
            await finishRecording(muxer);
        } else {
            requestAnimationFrame(() => recordFrame(muxer));
        }
    }, 'image/png', 1.0);
}

async function finishRecording(muxer) {
    await videoEncoder.flush();
    videoEncoder.close();
    
    hideRecordingOverlay();
    
    const webmData = muxer.finish();
    const blob = new Blob([webmData], { type: 'video/webm' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `molecule-rotation-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    stopRecording();
}

function stopRecording() {
    isRecording = false;
    
    camera.position.copy(initialCameraPosition);
    controls.target.copy(initialCameraTarget);
    controls.update();
    
    if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.classList.remove('recording');
        exportBtn.textContent = '🎬 导出视频 (5秒)';
    }
    
    hideRecordingOverlay();
}

function showRecordingOverlay() {
    recordingOverlay = document.createElement('div');
    recordingOverlay.className = 'recording-overlay';
    recordingOverlay.innerHTML = `
        <h3>🎬 正在录制视频...</h3>
        <div class="progress-bar">
            <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
        </div>
        <div class="progress-text" id="progress-text">0%</div>
    `;
    document.body.appendChild(recordingOverlay);
}

function updateRecordingProgress(progress) {
    if (recordingOverlay) {
        const fill = recordingOverlay.querySelector('#progress-fill');
        const text = recordingOverlay.querySelector('#progress-text');
        const percent = Math.round(progress * 100);
        fill.style.width = percent + '%';
        text.textContent = percent + '%';
    }
}

function hideRecordingOverlay() {
    if (recordingOverlay && recordingOverlay.parentNode) {
        recordingOverlay.parentNode.removeChild(recordingOverlay);
    }
    recordingOverlay = null;
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!isRecording) {
        const now = performance.now();
        if (now - lastLodUpdate > LOD_UPDATE_INTERVAL) {
            updateInstancedMeshes();
            lastLodUpdate = now;
        }
        
        controls.update();
        updateOrbits();
        updateInfoPanelPosition();
    }
    
    renderer.render(scene, camera);
}

init();
initVideoExport();
