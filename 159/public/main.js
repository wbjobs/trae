import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class VRHouseTour {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.playerRig = null;
        this.playerHeight = 1.6;
        this.xrSession = null;
        
        this.config = null;
        this.furnitureObjects = [];
        this.teleportPoints = [];
        this.rooms = [];
        
        this.controllers = [];
        this.controllerGrip = [];
        this.teleportRaycaster = new THREE.Raycaster();
        this.grabRaycaster = new THREE.Raycaster();
        
        this.grabbedObject = null;
        this.grabbedController = null;
        
        this.minimapCanvas = null;
        this.minimapContext = null;
        this.playerPosition = new THREE.Vector3();
        
        this.ws = null;
        this.wsConnected = false;
        this.myPlayerId = null;
        this.myPlayerName = '';
        this.myPlayerColor = '#ffffff';
        this.remotePlayers = new Map();
        this.playerAvatars = new Map();
        this.peerConnections = new Map();
        this.localStream = null;
        this.isMuted = false;
        this.lastStateSend = 0;
        this.stateSendInterval = 50;
        
        this.keys = {};
        this.moveSpeed = 5;
        this.isMoving = false;
        
        this.tempMatrix = new THREE.Matrix4();
        this.clock = new THREE.Clock();
        
        this.init();
    }
    
    async init() {
        this.setupScene();
        this.setupRenderer();
        this.setupCamera();
        this.setupLights();
        this.setupMinimap();
        this.setupEventListeners();
        
        await this.loadConfig();
        this.createHouse();
        this.createFurniture();
        this.createTeleportPoints();
        this.setupVR();
        this.setupMultiplayer();
        
        this.hideLoadingScreen();
        this.animate();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 10, 50);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType('local');
        
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
    }
    
    setupCamera() {
        this.playerRig = new THREE.Group();
        this.playerRig.position.set(0, 0, 0);
        this.scene.add(this.playerRig);
        
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, this.playerHeight, 5);
        this.scene.add(this.camera);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI * 0.85;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 30;
        this.controls.target.set(0, this.playerHeight, 0);
        this.controls.update();
    }
    
    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        this.scene.add(directionalLight);
        
        const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x3d5c3d, 0.4);
        this.scene.add(hemisphereLight);
    }
    
    setupMinimap() {
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapContext = this.minimapCanvas.getContext('2d');
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        document.getElementById('save-btn').addEventListener('click', () => this.saveConfig());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetConfig());
        document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const result = await response.json();
            if (result.success) {
                this.config = result.data;
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }
    }
    
    async saveConfig() {
        const furnitureData = this.furnitureObjects.map(obj => ({
            id: obj.userData.id,
            type: obj.userData.type,
            name: obj.userData.name,
            position: {
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z
            },
            rotation: {
                x: obj.rotation.x,
                y: obj.rotation.y,
                z: obj.rotation.z
            },
            color: obj.userData.color,
            grabbable: obj.userData.grabbable
        }));
        
        const config = {
            ...this.config,
            furniture: furnitureData
        };
        
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const result = await response.json();
            if (result.success) {
                this.showToast('布局已保存！');
            }
        } catch (e) {
            console.error('Failed to save config:', e);
            this.showToast('保存失败！');
        }
    }
    
    async resetConfig() {
        try {
            const response = await fetch('/api/config');
            const result = await response.json();
            if (result.success) {
                this.config = result.data;
                this.furnitureObjects.forEach(obj => this.scene.remove(obj));
                this.furnitureObjects = [];
                this.createFurniture();
                this.showToast('布局已重置！');
            }
        } catch (e) {
            console.error('Failed to reset config:', e);
        }
    }
    
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }
    
    createHouse() {
        if (!this.config || !this.config.house) return;
        
        const house = this.config.house;
        
        const floorGeometry = new THREE.PlaneGeometry(house.dimensions.width, house.dimensions.depth);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xDEB887,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        house.rooms.forEach(room => {
            this.createRoom(room);
        });
        
        this.createWalls(house);
    }
    
    createRoom(room) {
        const roomGeometry = new THREE.PlaneGeometry(room.bounds.width, room.bounds.depth);
        const roomMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(room.color),
            roughness: 0.9,
            transparent: true,
            opacity: 0.3
        });
        const roomMesh = new THREE.Mesh(roomGeometry, roomMaterial);
        roomMesh.rotation.x = -Math.PI / 2;
        roomMesh.position.set(
            room.bounds.x - this.config.house.dimensions.width / 2 + room.bounds.width / 2,
            0.01,
            room.bounds.z - this.config.house.dimensions.depth / 2 + room.bounds.depth / 2
        );
        roomMesh.receiveShadow = true;
        this.scene.add(roomMesh);
        
        this.rooms.push({
            ...room,
            mesh: roomMesh,
            worldBounds: {
                minX: roomMesh.position.x - room.bounds.width / 2,
                maxX: roomMesh.position.x + room.bounds.width / 2,
                minZ: roomMesh.position.z - room.bounds.depth / 2,
                maxZ: roomMesh.position.z + room.bounds.depth / 2
            }
        });
    }
    
    createWalls(house) {
        const wallHeight = house.dimensions.height;
        const wallThickness = 0.1;
        const wallMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xF5F5DC,
            roughness: 0.7
        });
        
        const halfWidth = house.dimensions.width / 2;
        const halfDepth = house.dimensions.depth / 2;
        
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(house.dimensions.width, wallHeight, wallThickness),
            wallMaterial
        );
        backWall.position.set(0, wallHeight / 2, -halfDepth);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        this.scene.add(backWall);
        
        const frontWall = new THREE.Mesh(
            new THREE.BoxGeometry(house.dimensions.width, wallHeight, wallThickness),
            wallMaterial
        );
        frontWall.position.set(0, wallHeight / 2, halfDepth);
        frontWall.castShadow = true;
        frontWall.receiveShadow = true;
        this.scene.add(frontWall);
        
        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, house.dimensions.depth),
            wallMaterial
        );
        leftWall.position.set(-halfWidth, wallHeight / 2, 0);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);
        
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, house.dimensions.depth),
            wallMaterial
        );
        rightWall.position.set(halfWidth, wallHeight / 2, 0);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);
        
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(house.dimensions.width, house.dimensions.depth),
            new THREE.MeshStandardMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = wallHeight;
        this.scene.add(ceiling);
    }
    
    createFurniture() {
        if (!this.config || !this.config.furniture) return;
        
        this.config.furniture.forEach(item => {
            const furniture = this.createFurnitureItem(item);
            if (furniture) {
                this.scene.add(furniture);
                this.furnitureObjects.push(furniture);
            }
        });
    }
    
    createFurnitureItem(item) {
        let mesh;
        
        switch (item.type) {
            case 'chair':
                mesh = this.createChair(item);
                break;
            case 'table':
                mesh = this.createTable(item);
                break;
            case 'sofa':
                mesh = this.createSofa(item);
                break;
            case 'lamp':
                mesh = this.createLamp(item);
                break;
            case 'bed':
                mesh = this.createBed(item);
                break;
            case 'cabinet':
                mesh = this.createCabinet(item);
                break;
            default:
                mesh = this.createGenericFurniture(item);
        }
        
        if (mesh) {
            mesh.position.set(item.position.x, item.position.y, item.position.z);
            mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
            mesh.userData = { ...item };
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
        
        return mesh;
    }
    
    createChair(item) {
        const group = new THREE.Group();
        const color = new THREE.Color(item.color || '#8B4513');
        
        const seatMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.8 });
        
        const seat = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.08, 0.5),
            seatMaterial
        );
        seat.position.y = 0.45;
        group.add(seat);
        
        const backrest = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.6, 0.08),
            seatMaterial
        );
        backrest.position.set(0, 0.75, -0.2);
        group.add(backrest);
        
        const legGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.45);
        const legPositions = [
            [0.2, 0.225, 0.2],
            [-0.2, 0.225, 0.2],
            [0.2, 0.225, -0.2],
            [-0.2, 0.225, -0.2]
        ];
        
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeometry, legMaterial);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });
        
        return group;
    }
    
    createTable(item) {
        const group = new THREE.Group();
        const color = new THREE.Color(item.color || '#A0522D');
        
        const topMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.7 });
        
        const tableTop = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.1, 0.9),
            topMaterial
        );
        tableTop.position.y = 0.75;
        group.add(tableTop);
        
        const legGeometry = new THREE.BoxGeometry(0.08, 0.7, 0.08);
        const legPositions = [
            [0.65, 0.35, 0.35],
            [-0.65, 0.35, 0.35],
            [0.65, 0.35, -0.35],
            [-0.65, 0.35, -0.35]
        ];
        
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeometry, legMaterial);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });
        
        return group;
    }
    
    createSofa(item) {
        const group = new THREE.Group();
        const color = new THREE.Color(item.color || '#696969');
        
        const sofaMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
        const cushionMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color().lerpColors(color, new THREE.Color(0xffffff), 0.2),
            roughness: 0.9
        });
        
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.4, 0.9),
            sofaMaterial
        );
        base.position.y = 0.2;
        group.add(base);
        
        const backrest = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.6, 0.2),
            sofaMaterial
        );
        backrest.position.set(0, 0.7, -0.35);
        group.add(backrest);
        
        const armrestGeometry = new THREE.BoxGeometry(0.15, 0.5, 0.9);
        const leftArmrest = new THREE.Mesh(armrestGeometry, sofaMaterial);
        leftArmrest.position.set(-0.925, 0.45, 0);
        group.add(leftArmrest);
        
        const rightArmrest = new THREE.Mesh(armrestGeometry, sofaMaterial);
        rightArmrest.position.set(0.925, 0.45, 0);
        group.add(rightArmrest);
        
        for (let i = 0; i < 3; i++) {
            const cushion = new THREE.Mesh(
                new THREE.BoxGeometry(0.55, 0.15, 0.7),
                cushionMaterial
            );
            cushion.position.set(-0.6 + i * 0.6, 0.475, 0.05);
            group.add(cushion);
        }
        
        return group;
    }
    
    createLamp(item) {
        const group = new THREE.Group();
        const color = new THREE.Color(item.color || '#FFD700');
        
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 });
        const shadeMaterial = new THREE.MeshStandardMaterial({ 
            color, 
            roughness: 0.3,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
        
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.25, 0.05),
            baseMaterial
        );
        base.position.y = 0.025;
        group.add(base);
        
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 1.5),
            poleMaterial
        );
        pole.position.y = 0.8;
        group.add(pole);
        
        const shade = new THREE.Mesh(
            new THREE.ConeGeometry(0.3, 0.4, 16, 1, true),
            shadeMaterial
        );
        shade.position.y = 1.6;
        shade.rotation.x = Math.PI;
        group.add(shade);
        
        const light = new THREE.PointLight(0xFFFACD, 0.5, 5);
        light.position.y = 1.5;
        group.add(light);
        
        return group;
    }
    
    createBed(item) {
        const group = new THREE.Group();
        const color = new THREE.Color(item.color || '#8B7355');
        
        const frameMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const mattressMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFF0, roughness: 0.9 });
        const pillowMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFAF0, roughness: 0.9 });
        
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.3, 2.2),
            frameMaterial
        );
        frame.position.y = 0.15;
        group.add(frame);
        
        const mattress = new THREE.Mesh(
            new THREE.BoxGeometry(1.7, 0.2, 2.0),
            mattressMaterial
        );
        mattress.position.y = 0.4;
        group.add(mattress);
        
        const headboard = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.8, 0.1),
            frameMaterial
        );
        headboard.position.set(0, 0.7, -1.05);
        group.add(headboard);
        
        const pillow = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.1, 0.6),
            pillowMaterial
        );
        pillow.position.set(0, 0.55, -0.7);
        group.add(pillow);
        
        return group;
    }
    
    createCabinet(item) {
        const group = new THREE.Group();
        const color = new THREE.Color(item.color || '#654321');
        
        const cabinetMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const handleMaterial = new THREE.MeshStandardMaterial({ color: 0xCD853F, roughness: 0.3, metalness: 0.7 });
        
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 1.8, 0.5),
            cabinetMaterial
        );
        body.position.y = 0.9;
        group.add(body);
        
        for (let i = 0; i < 2; i++) {
            const handle = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.05, 0.02),
                handleMaterial
            );
            handle.position.set(-0.25 + i * 0.5, 0.9, 0.26);
            group.add(handle);
        }
        
        return group;
    }
    
    createGenericFurniture(item) {
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(item.color || '#888888'),
            roughness: 0.7
        });
        return new THREE.Mesh(geometry, material);
    }
    
    createTeleportPoints() {
        if (!this.config || !this.config.teleportPoints) return;
        
        const teleportGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32);
        const teleportMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.6
        });
        
        this.config.teleportPoints.forEach(point => {
            const mesh = new THREE.Mesh(teleportGeometry, teleportMaterial);
            mesh.position.set(point.x, 0.03, point.z);
            mesh.userData = { ...point, isTeleportPoint: true };
            this.scene.add(mesh);
            this.teleportPoints.push(mesh);
        });
        
        const indicatorGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16);
        const indicatorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00aaff,
            emissive: 0x00aaff,
            emissiveIntensity: 0.8
        });
        this.teleportIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
        this.teleportIndicator.visible = false;
        this.scene.add(this.teleportIndicator);
    }
    
    setupVR() {
        document.body.appendChild(VRButton.createButton(this.renderer));
        
        const controllerModelFactory = new XRControllerModelFactory();
        
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.addEventListener('selectstart', (event) => this.onSelectStart(event, i));
            controller.addEventListener('selectend', (event) => this.onSelectEnd(event, i));
            controller.addEventListener('squeezestart', (event) => this.onSqueezeStart(event, i));
            controller.addEventListener('squeezeend', (event) => this.onSqueezeEnd(event, i));
            this.scene.add(controller);
            this.controllers.push(controller);
            
            const grip = this.renderer.xr.getControllerGrip(i);
            grip.add(controllerModelFactory.createControllerModel(grip));
            this.scene.add(grip);
            this.controllerGrip.push(grip);
            
            const rayGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -10)
            ]);
            const rayMaterial = new THREE.LineBasicMaterial({ 
                color: 0x00ff88,
                transparent: true,
                opacity: 0.5
            });
            const ray = new THREE.Line(rayGeometry, rayMaterial);
            ray.name = 'controllerRay';
            ray.visible = false;
            controller.add(ray);
        }
        
        this.renderer.xr.addEventListener('sessionstart', () => {
            this.xrSession = this.renderer.xr.getSession();
            
            const worldPos = new THREE.Vector3();
            this.camera.getWorldPosition(worldPos);
            
            this.playerRig.attach(this.camera);
            this.camera.position.set(0, 0, 0);
            this.camera.rotation.set(0, 0, 0);
            this.playerRig.position.set(worldPos.x, 0, worldPos.z);
            
            this.controls.enabled = false;
            
            document.getElementById('vr-button').textContent = '退出 VR';
        });
        
        this.renderer.xr.addEventListener('sessionend', () => {
            this.xrSession = null;
            
            const worldPos = new THREE.Vector3();
            this.camera.getWorldPosition(worldPos);
            
            this.scene.attach(this.camera);
            this.camera.position.set(worldPos.x, this.playerHeight, worldPos.z);
            this.camera.rotation.set(0, 0, 0);
            this.playerRig.position.set(worldPos.x, 0, worldPos.z);
            
            this.controls.target.set(worldPos.x, this.playerHeight, worldPos.z - 1);
            this.controls.enabled = true;
            this.controls.update();
            
            document.getElementById('vr-button').textContent = '进入 VR';
        });
    }
    
    setupMultiplayer() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('WebSocket connection failed:', e);
            return;
        }
        
        this.ws.onopen = () => {
            this.wsConnected = true;
            document.getElementById('connection-status').className = 'status-connected';
            
            const cameraWorldPos = new THREE.Vector3();
            this.camera.getWorldPosition(cameraWorldPos);
            
            this.ws.send(JSON.stringify({
                type: 'join',
                roomId: 'default-house',
                position: { x: cameraWorldPos.x, y: cameraWorldPos.y, z: cameraWorldPos.z },
                rotation: { x: 0, y: 0, z: 0 },
                muted: this.isMuted
            }));
        };
        
        this.ws.onclose = () => {
            this.wsConnected = false;
            document.getElementById('connection-status').className = 'status-disconnected';
            this.cleanupMultiplayer();
        };
        
        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
        
        this.ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            
            switch (data.type) {
                case 'welcome':
                    this.myPlayerId = data.id;
                    this.myPlayerName = data.name;
                    this.myPlayerColor = data.color;
                    this.updatePlayerListUI(data.players);
                    this.initAudio();
                    break;
                    
                case 'player-joined':
                    this.addRemotePlayer(data.player);
                    this.updatePlayerListUI();
                    this.initiateWebRTC(data.player.id);
                    break;
                    
                case 'player-left':
                    this.removeRemotePlayer(data.id);
                    this.updatePlayerListUI();
                    this.closePeerConnection(data.id);
                    break;
                    
                case 'player-state':
                    this.updateRemotePlayerState(data);
                    break;
                    
                case 'room-full':
                    this.showToast(data.message || '房间已满');
                    break;
                    
                case 'webrtc-offer':
                    this.handleWebRTCOffer(data.fromId, data.offer);
                    break;
                    
                case 'webrtc-answer':
                    this.handleWebRTCAnswer(data.fromId, data.answer);
                    break;
                    
                case 'webrtc-ice':
                    this.handleWebRTCICECandidate(data.fromId, data.candidate);
                    break;
            }
        };
    }
    
    cleanupMultiplayer() {
        this.peerConnections.forEach((pc, id) => {
            pc.close();
        });
        this.peerConnections.clear();
        
        this.playerAvatars.forEach(avatar => {
            this.scene.remove(avatar.group);
        });
        this.playerAvatars.clear();
        
        this.remotePlayers.clear();
        this.updatePlayerListUI();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
    }
    
    async initAudio() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (this.isMuted) {
                this.localStream.getAudioTracks().forEach(t => t.enabled = false);
            }
        } catch (e) {
            console.warn('Microphone access denied, voice chat disabled:', e);
        }
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        const muteBtn = document.getElementById('mute-btn');
        
        if (this.isMuted) {
            muteBtn.classList.add('muted');
            muteBtn.textContent = '🔇';
            if (this.localStream) {
                this.localStream.getAudioTracks().forEach(t => t.enabled = false);
            }
        } else {
            muteBtn.classList.remove('muted');
            muteBtn.textContent = '🔊';
            if (this.localStream) {
                this.localStream.getAudioTracks().forEach(t => t.enabled = true);
            }
        }
        
        this.sendState();
    }
    
    createPlayerAvatar(playerData) {
        const group = new THREE.Group();
        
        const bodyGeometry = new THREE.CapsuleGeometry(0.25, 0.8, 4, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(playerData.color),
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.9;
        body.castShadow = true;
        group.add(body);
        
        const headGeometry = new THREE.SphereGeometry(0.18, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color('#FFDAB9'),
            roughness: 0.8
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.65;
        head.castShadow = true;
        group.add(head);
        
        const haloGeometry = new THREE.RingGeometry(0.3, 0.35, 32);
        const haloMaterial = new THREE.MeshBasicMaterial({ 
            color: new THREE.Color(playerData.color),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.05;
        group.add(halo);
        
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.roundRect(0, 0, 256, 64, 12);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(playerData.name, 128, 32);
        
        const labelTexture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({ 
            map: labelTexture,
            transparent: true,
            depthTest: false
        });
        const label = new THREE.Sprite(labelMaterial);
        label.scale.set(1, 0.25, 1);
        label.position.y = 2.2;
        label.renderOrder = 999;
        group.add(label);
        
        group.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        
        group.userData = { 
            playerId: playerData.id,
            name: playerData.name,
            color: playerData.color
        };
        
        return { group, body, head, halo, label };
    }
    
    addRemotePlayer(playerData) {
        if (this.playerAvatars.has(playerData.id)) return;
        
        const avatar = this.createPlayerAvatar(playerData);
        this.scene.add(avatar.group);
        this.playerAvatars.set(playerData.id, avatar);
        this.remotePlayers.set(playerData.id, { ...playerData });
        
        this.showToast(`${playerData.name} 加入了房间`);
    }
    
    removeRemotePlayer(playerId) {
        const avatar = this.playerAvatars.get(playerId);
        if (avatar) {
            this.scene.remove(avatar.group);
            avatar.group.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            this.playerAvatars.delete(playerId);
        }
        
        const player = this.remotePlayers.get(playerId);
        if (player) {
            this.showToast(`${player.name} 离开了房间`);
        }
        this.remotePlayers.delete(playerId);
    }
    
    updateRemotePlayerState(data) {
        const avatar = this.playerAvatars.get(data.id);
        if (avatar && data.position && data.rotation) {
            avatar.group.position.set(data.position.x, data.position.y, data.position.z);
            avatar.group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
            
            if (data.muted !== undefined) {
                const player = this.remotePlayers.get(data.id);
                if (player) {
                    player.muted = data.muted;
                    this.updatePlayerListUI();
                }
            }
        }
    }
    
    updatePlayerListUI(players) {
        const listEl = document.getElementById('player-list');
        const countEl = document.getElementById('player-count');
        
        if (!listEl) return;
        
        let displayPlayers = players;
        if (!displayPlayers) {
            displayPlayers = [];
            this.remotePlayers.forEach(p => displayPlayers.push(p));
        }
        
        listEl.innerHTML = '';
        
        const selfItem = document.createElement('div');
        selfItem.className = 'player-item self';
        selfItem.innerHTML = `
            <div class="player-color" style="background:${this.myPlayerColor}"></div>
            <span class="player-name">${this.myPlayerName} (我)</span>
            <span class="player-mute-icon">${this.isMuted ? '🔇' : ''}</span>
        `;
        listEl.appendChild(selfItem);
        
        displayPlayers.forEach(player => {
            if (player.id === this.myPlayerId) return;
            
            const item = document.createElement('div');
            item.className = 'player-item';
            item.innerHTML = `
                <div class="player-color" style="background:${player.color}"></div>
                <span class="player-name">${player.name}</span>
                <span class="player-mute-icon">${player.muted ? '🔇' : ''}</span>
            `;
            listEl.appendChild(item);
        });
        
        const total = displayPlayers.filter(p => p.id !== this.myPlayerId).length + 1;
        countEl.textContent = `${total}/4`;
    }
    
    sendState() {
        if (!this.wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const cameraWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPos);
        
        const cameraWorldQuat = new THREE.Quaternion();
        this.camera.getWorldQuaternion(cameraWorldQuat);
        const euler = new THREE.Euler().setFromQuaternion(cameraWorldQuat, 'YXZ');
        
        this.ws.send(JSON.stringify({
            type: 'state',
            position: { x: cameraWorldPos.x, y: cameraWorldPos.y, z: cameraWorldPos.z },
            rotation: { x: 0, y: euler.y, z: 0 },
            muted: this.isMuted
        }));
    }
    
    initiateWebRTC(remoteId) {
        if (!this.localStream) return;
        if (this.peerConnections.has(remoteId)) return;
        
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'webrtc-ice',
                    targetId: remoteId,
                    candidate: event.candidate.toJSON()
                }));
            }
        };
        
        pc.ontrack = (event) => {
            const audio = document.createElement('audio');
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            audio.playsInline = true;
            audio.dataset.remoteId = remoteId;
            
            const avatar = this.playerAvatars.get(remoteId);
            if (avatar) {
                const positionalAudio = new THREE.PositionalAudio(this.camera);
                positionalAudio.setMediaStreamSource(event.streams[0]);
                positionalAudio.setRefDistance(1);
                positionalAudio.setRolloffFactor(2);
                avatar.group.add(positionalAudio);
                avatar.group.userData.positionalAudio = positionalAudio;
            }
        };
        
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.closePeerConnection(remoteId);
            }
        };
        
        this.peerConnections.set(remoteId, pc);
        
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                this.ws.send(JSON.stringify({
                    type: 'webrtc-offer',
                    targetId: remoteId,
                    offer: pc.localDescription.toJSON()
                }));
            })
            .catch(err => console.error('WebRTC offer error:', err));
    }
    
    handleWebRTCOffer(fromId, offer) {
        if (!this.localStream) return;
        
        let pc = this.peerConnections.get(fromId);
        
        if (!pc) {
            pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
            
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.ws.send(JSON.stringify({
                        type: 'webrtc-ice',
                        targetId: fromId,
                        candidate: event.candidate.toJSON()
                    }));
                }
            };
            
            pc.ontrack = (event) => {
                const avatar = this.playerAvatars.get(fromId);
                if (avatar) {
                    const positionalAudio = new THREE.PositionalAudio(this.camera);
                    positionalAudio.setMediaStreamSource(event.streams[0]);
                    positionalAudio.setRefDistance(1);
                    positionalAudio.setRolloffFactor(2);
                    avatar.group.add(positionalAudio);
                    avatar.group.userData.positionalAudio = positionalAudio;
                }
            };
            
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                    this.closePeerConnection(fromId);
                }
            };
            
            this.peerConnections.set(fromId, pc);
        }
        
        pc.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => pc.createAnswer())
            .then(answer => pc.setLocalDescription(answer))
            .then(() => {
                this.ws.send(JSON.stringify({
                    type: 'webrtc-answer',
                    targetId: fromId,
                    answer: pc.localDescription.toJSON()
                }));
            })
            .catch(err => console.error('WebRTC answer error:', err));
    }
    
    handleWebRTCAnswer(fromId, answer) {
        const pc = this.peerConnections.get(fromId);
        if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(answer))
                .catch(err => console.error('WebRTC setRemoteDescription error:', err));
        }
    }
    
    handleWebRTCICECandidate(fromId, candidate) {
        const pc = this.peerConnections.get(fromId);
        if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(err => console.error('WebRTC ICE error:', err));
        }
    }
    
    closePeerConnection(remoteId) {
        const pc = this.peerConnections.get(remoteId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(remoteId);
        }
    }
    
    onSelectStart(event, controllerIndex) {
        const controller = this.controllers[controllerIndex];
        
        this.tempMatrix.identity().extractRotation(controller.matrixWorld);
        this.teleportRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.teleportRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
        
        const intersects = this.teleportRaycaster.intersectObjects(this.teleportPoints);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.teleportTo(point);
        }
        
        if (this.grabbedObject === null) {
            this.grabRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            this.grabRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
            
            const grabbableObjects = this.furnitureObjects.filter(obj => obj.userData.grabbable);
            const grabIntersects = this.grabRaycaster.intersectObjects(grabbableObjects, true);
            
            if (grabIntersects.length > 0) {
                let object = grabIntersects[0].object;
                while (object.parent && !object.userData.grabbable) {
                    object = object.parent;
                }
                
                if (object.userData.grabbable) {
                    this.grabbedObject = object;
                    this.grabbedController = controller;
                    controller.attach(object);
                }
            }
        }
    }
    
    onSelectEnd(event, controllerIndex) {
        if (this.grabbedObject && this.grabbedController === this.controllers[controllerIndex]) {
            this.scene.attach(this.grabbedObject);
            this.grabbedObject = null;
            this.grabbedController = null;
        }
    }
    
    onSqueezeStart(event, controllerIndex) {
        const controller = this.controllers[controllerIndex];
        const ray = controller.getObjectByName('controllerRay');
        if (ray) {
            ray.visible = true;
        }
    }
    
    onSqueezeEnd(event, controllerIndex) {
        const controller = this.controllers[controllerIndex];
        const ray = controller.getObjectByName('controllerRay');
        if (ray) {
            ray.visible = false;
        }
    }
    
    teleportTo(position) {
        if (this.xrSession) {
            this.playerRig.position.set(position.x, 0, position.z);
        } else {
            this.camera.position.set(position.x, this.playerHeight, position.z + 2);
            this.playerRig.position.set(position.x, 0, position.z);
            this.controls.target.set(position.x, this.playerHeight, position.z);
            this.controls.update();
        }
        this.playerPosition.copy(position);
    }
    
    updateMinimap() {
        if (!this.minimapContext || !this.config) return;
        
        const ctx = this.minimapContext;
        const canvas = this.minimapCanvas;
        const house = this.config.house;
        
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const scale = Math.min(canvas.width / house.dimensions.width, canvas.height / house.dimensions.depth);
        const offsetX = (canvas.width - house.dimensions.width * scale) / 2;
        const offsetY = (canvas.height - house.dimensions.depth * scale) / 2;
        
        house.rooms.forEach(room => {
            ctx.fillStyle = room.color;
            ctx.globalAlpha = 0.7;
            ctx.fillRect(
                offsetX + room.bounds.x * scale,
                offsetY + room.bounds.z * scale,
                room.bounds.width * scale,
                room.bounds.depth * scale
            );
        });
        
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX, offsetY, house.dimensions.width * scale, house.dimensions.depth * scale);
        
        this.furnitureObjects.forEach(obj => {
            const x = offsetX + (obj.position.x + house.dimensions.width / 2) * scale;
            const y = offsetY + (obj.position.z + house.dimensions.depth / 2) * scale;
            
            ctx.fillStyle = obj.userData.color || '#888';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        
        this.teleportPoints.forEach(point => {
            const x = offsetX + (point.position.x + house.dimensions.width / 2) * scale;
            const y = offsetY + (point.position.z + house.dimensions.depth / 2) * scale;
            
            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        });
        
        const cameraWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPos);
        const playerX = offsetX + (cameraWorldPos.x + house.dimensions.width / 2) * scale;
        const playerY = offsetY + (cameraWorldPos.z + house.dimensions.depth / 2) * scale;
        
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(playerX, playerY, 6, 0, Math.PI * 2);
        ctx.fill();
        
        const cameraWorldQuat = new THREE.Quaternion();
        this.camera.getWorldQuaternion(cameraWorldQuat);
        const euler = new THREE.Euler().setFromQuaternion(cameraWorldQuat, 'YXZ');
        
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        const dirLength = 15;
        const dirX = playerX + Math.sin(euler.y) * dirLength;
        const dirY = playerY + Math.cos(euler.y) * dirLength;
        ctx.beginPath();
        ctx.moveTo(playerX, playerY);
        ctx.lineTo(dirX, dirY);
        ctx.stroke();
    }
    
    handleDesktopMovement(delta) {
        const direction = new THREE.Vector3();
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        
        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            direction.add(forward);
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            direction.sub(forward);
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            direction.sub(right);
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            direction.add(right);
        }
        
        if (direction.length() > 0) {
            direction.normalize();
            const moveDistance = this.moveSpeed * delta;
            
            const newPos = this.camera.position.clone();
            newPos.add(direction.multiplyScalar(moveDistance));
            
            if (this.config) {
                const halfWidth = this.config.house.dimensions.width / 2 - 0.5;
                const halfDepth = this.config.house.dimensions.depth / 2 - 0.5;
                newPos.x = THREE.MathUtils.clamp(newPos.x, -halfWidth, halfWidth);
                newPos.z = THREE.MathUtils.clamp(newPos.z, -halfDepth, halfDepth);
            }
            
            this.camera.position.copy(newPos);
            this.controls.target.add(direction.multiplyScalar(moveDistance));
            this.playerRig.position.set(newPos.x, 0, newPos.z);
            this.playerPosition.copy(newPos);
        }
    }
    
    updateTeleportVisuals() {
        if (!this.xrSession) {
            this.teleportPoints.forEach(point => {
                point.visible = true;
            });
            return;
        }
        
        for (let i = 0; i < 2; i++) {
            const controller = this.controllers[i];
            
            this.tempMatrix.identity().extractRotation(controller.matrixWorld);
            this.teleportRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            this.teleportRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
            
            const intersects = this.teleportRaycaster.intersectObjects(this.teleportPoints);
            
            this.teleportPoints.forEach(point => {
                point.material.opacity = 0.3;
            });
            
            if (intersects.length > 0) {
                intersects[0].object.material.opacity = 1.0;
                this.teleportIndicator.position.copy(intersects[0].point);
                this.teleportIndicator.visible = true;
            } else {
                this.teleportIndicator.visible = false;
            }
        }
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.style.display = 'none', 500);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        this.renderer.setAnimationLoop(() => {
            const delta = this.clock.getDelta();
            const now = performance.now();
            
            if (!this.xrSession) {
                this.handleDesktopMovement(delta);
                this.controls.update();
            }
            
            if (now - this.lastStateSend > this.stateSendInterval) {
                this.sendState();
                this.lastStateSend = now;
            }
            
            this.updateTeleportVisuals();
            this.updateMinimap();
            
            this.renderer.render(this.scene, this.camera);
        });
    }
}

const app = new VRHouseTour();
