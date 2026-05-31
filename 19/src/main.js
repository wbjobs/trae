import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointCloudViewer } from './PointCloudViewer.js';
import { APIService } from './api.js';

class App {
    constructor() {
        this.container = document.getElementById('container');
        this.canvas = document.getElementById('canvas');
        
        this.api = new APIService();
        this.viewer = null;
        
        this.stats = {
            fps: 0,
            frameCount: 0,
            lastTime: performance.now()
        };
        
        this.init();
        this.setupUI();
        this.animate();
    }
    
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a14);
        
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            100000
        );
        this.camera.position.set(0, 0, 100);
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        this.viewer = new PointCloudViewer(this.scene, this.camera, this.renderer);
        
        const ambient = new THREE.AmbientLight(0x404040, 1);
        this.scene.add(ambient);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(50, 100, 50);
        this.scene.add(dirLight);
        
        this.addAxesHelper();
        
        window.addEventListener('resize', () => this.onResize());
    }
    
    addAxesHelper() {
        const axesHelper = new THREE.AxesHelper(50);
        this.scene.add(axesHelper);
        
        const gridHelper = new THREE.GridHelper(200, 20, 0x333344, 0x222233);
        gridHelper.position.y = -10;
        this.scene.add(gridHelper);
    }
    
    setupUI() {
        const fileInput = document.getElementById('file-input');
        const fileSelect = document.getElementById('file-select');
        const loadBtn = document.getElementById('load-btn');
        const clusterBtn = document.getElementById('cluster-btn');
        
        const kValueSlider = document.getElementById('k-value');
        const kValueDisplay = document.getElementById('k-value-display');
        kValueSlider.addEventListener('input', (e) => {
            kValueDisplay.textContent = e.target.value;
        });
        
        const pointSizeSlider = document.getElementById('point-size');
        const pointSizeDisplay = document.getElementById('point-size-display');
        pointSizeSlider.addEventListener('input', (e) => {
            const size = parseFloat(e.target.value);
            pointSizeDisplay.textContent = size;
            if (this.viewer) {
                this.viewer.setPointSize(size);
            }
        });
        
        const colorSchemeSelect = document.getElementById('color-scheme');
        colorSchemeSelect.addEventListener('change', (e) => {
            if (this.viewer) {
                this.viewer.setColorScheme(e.target.value);
            }
            this.updateLegend(e.target.value);
        });
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.api.uploadFile(file);
                await this.refreshFileList();
                fileSelect.value = file.name;
            }
        });
        
        loadBtn.addEventListener('click', async () => {
            const filename = fileSelect.value;
            if (!filename) {
                alert('请选择一个文件');
                return;
            }
            
            try {
                loadBtn.textContent = '加载中...';
                loadBtn.disabled = true;
                
                await this.loadPointCloud(filename);
                
                loadBtn.textContent = '加载点云';
                loadBtn.disabled = false;
            } catch (error) {
                console.error('加载失败:', error);
                alert('加载失败: ' + error.message);
                loadBtn.textContent = '加载点云';
                loadBtn.disabled = false;
            }
        });
        
        clusterBtn.addEventListener('click', async () => {
            const algorithm = document.getElementById('cluster-algorithm').value;
            const k = parseInt(document.getElementById('k-value').value);
            
            try {
                clusterBtn.textContent = '聚类中...';
                clusterBtn.disabled = true;
                
                await this.viewer.runClustering({
                    algorithm,
                    k
                });
                
                this.updateStats();
                
                clusterBtn.textContent = '运行聚类';
                clusterBtn.disabled = false;
            } catch (error) {
                console.error('聚类失败:', error);
                alert('聚类失败: ' + error.message);
                clusterBtn.textContent = '运行聚类';
                clusterBtn.disabled = false;
            }
        });
        
        this.refreshFileList();
    }
    
    async refreshFileList() {
        const fileSelect = document.getElementById('file-select');
        const currentValue = fileSelect.value;
        
        try {
            const files = await this.api.listFiles();
            
            fileSelect.innerHTML = '<option value="">-- 请选择文件 --</option>';
            
            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.name;
                option.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
                fileSelect.appendChild(option);
            });
            
            if (currentValue) {
                fileSelect.value = currentValue;
            }
        } catch (error) {
            console.error('获取文件列表失败:', error);
        }
    }
    
    async loadPointCloud(filename) {
        document.getElementById('stats').classList.remove('hidden');
        
        const metadata = await this.api.loadPointCloud(filename);
        console.log('点云元数据:', metadata);
        
        const center = new THREE.Vector3(
            metadata.center[0],
            metadata.center[1],
            metadata.center[2]
        );
        
        this.camera.position.copy(center);
        this.camera.position.z += 100;
        this.controls.target.copy(center);
        
        await this.api.buildOctree(filename, {
            max_depth: 8,
            max_points_per_node: 10000
        });
        
        await this.viewer.loadFromAPI(this.api, filename);
        
        this.updateStats();
    }
    
    updateStats() {
        if (this.viewer) {
            document.getElementById('stat-points').textContent = 
                this.viewer.totalPoints.toLocaleString();
            document.getElementById('stat-clusters').textContent = 
                this.viewer.clusterCount || '-';
            document.getElementById('stat-lod').textContent = 
                this.viewer.lodLevel || '-';
        }
    }
    
    updateLegend(scheme) {
        const legend = document.getElementById('legend');
        const title = document.getElementById('legend-title');
        const gradientBar = legend.querySelector('.gradient-bar');
        
        if (scheme === 'original' || scheme === 'cluster') {
            legend.classList.add('hidden');
            return;
        }
        
        legend.classList.remove('hidden');
        
        if (scheme === 'heatmap') {
            title.textContent = '热度图';
            gradientBar.style.background = `linear-gradient(to right, 
                #313695, #4575b4, #74add1, #abd9e9, 
                #e0f3f8, #ffffbf, #fee090, #fdae61, 
                #f46d43, #d73027, #a50026)`;
        } else if (scheme === 'height') {
            title.textContent = '高度渐变';
            gradientBar.style.background = `linear-gradient(to right, 
                #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)`;
        }
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        
        if (this.viewer) {
            this.viewer.update();
        }
        
        this.renderer.render(this.scene, this.camera);
        
        this.stats.frameCount++;
        const now = performance.now();
        if (now - this.stats.lastTime >= 1000) {
            this.stats.fps = Math.round(this.stats.frameCount * 1000 / (now - this.stats.lastTime));
            this.stats.frameCount = 0;
            this.stats.lastTime = now;
            
            const fpsElement = document.getElementById('stat-fps');
            if (fpsElement) {
                fpsElement.textContent = this.stats.fps;
            }
        }
    }
}

const app = new App();
