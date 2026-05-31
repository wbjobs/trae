import { WebGPURenderer } from './core/WebGPURenderer';
import { SceneManager } from './core/SceneManager';
import { VoxLoader } from './loaders/VoxLoader';
import { SVOGIBuilder } from './core/SVOGIBuilder';
import { ControlPanel } from './ui/ControlPanel';
import { PerformanceMonitor } from './ui/PerformanceMonitor';
import { HDRExporter } from './utils/hdrexporter';
import { VoxelData } from './types';

export class App {
  private canvas: HTMLCanvasElement;
  private renderer: WebGPURenderer;
  private sceneManager: SceneManager;
  private controlPanel: ControlPanel;
  private performanceMonitor: PerformanceMonitor;
  
  private voxelData: VoxelData | null = null;
  private isRunning = false;
  private lastTime = 0;
  private animationFrameId: number | null = null;

  constructor() {
    this.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    this.renderer = new WebGPURenderer();
    this.sceneManager = new SceneManager(this.canvas);
    this.controlPanel = new ControlPanel();
    this.performanceMonitor = new PerformanceMonitor();

    this.setupUI();
    this.setupResizeHandler();
  }

  private setupUI(): void {
    const loadBtn = document.getElementById('loadBtn');
    const exportBtn = document.getElementById('exportBtn');
    const demoBtn = document.getElementById('demoBtn');
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;

    if (loadBtn && fileInput) {
      loadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportHDR());
    }

    if (demoBtn) {
      demoBtn.addEventListener('click', () => this.loadDemoScene());
    }

    this.controlPanel.setOnParamsChange((params) => {
      this.sceneManager.setRenderParams(params);
    });

    this.setupDragDrop();
  }

  private setupDragDrop(): void {
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.vox')) {
          this.loadVoxFile(file);
        }
      }
    });
  }

  private setupResizeHandler(): void {
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer.resize(width, height);
    this.sceneManager.resize(width / height);
  }

  async init(): Promise<void> {
    this.showLoading('正在初始化 WebGPU...');

    try {
      await this.renderer.init(this.canvas);
      this.resize();
      
      this.loadDemoScene();
      
      this.hideLoading();
      this.start();
    } catch (error) {
      console.error('Failed to initialize WebGPU:', error);
      this.hideLoading();
      this.showWebGPUError();
    }
  }

  private async handleFileUpload(e: Event): Promise<void> {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      await this.loadVoxFile(file);
    }
  }

  private async loadVoxFile(file: File): Promise<void> {
    this.showLoading(`正在加载 ${file.name}...`);
    
    try {
      const data = await VoxLoader.loadFromFile(file);
      await this.setVoxelData(data);
    } catch (error) {
      console.error('Failed to load VOX file:', error);
      alert('加载 .vox 文件失败，请检查文件格式');
    }
    
    this.hideLoading();
  }

  private async loadDemoScene(): Promise<void> {
    this.showLoading('正在生成演示场景...');
    
    try {
      const data = VoxLoader.createDemoScene();
      await this.setVoxelData(data);
    } catch (error) {
      console.error('Failed to create demo scene:', error);
    }
    
    this.hideLoading();
  }

  private async setVoxelData(data: VoxelData): Promise<void> {
    this.voxelData = data;
    this.renderer.setVoxelData(data);
    this.performanceMonitor.setVoxelCount(data.voxelCount);

    this.showLoading('正在构建 SVOGI 加速结构...');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const svoData = SVOGIBuilder.buildFlat(data);
      this.renderer.setSVONodes(svoData.nodes);
    } catch (error) {
      console.warn('SVO build failed, falling back to direct voxel rendering:', error);
    }
    
    this.hideLoading();
  }

  private async exportHDR(): Promise<void> {
    if (!this.voxelData) {
      alert('请先加载体素模型');
      return;
    }

    this.showLoading('正在导出 HDR...');
    
    try {
      const width = this.canvas.width;
      const height = this.canvas.height;
      
      const hdrData = await this.renderer.exportHDR(width, height);
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      HDRExporter.download(hdrData, `voxel_render_${timestamp}.hdr`);
    } catch (error) {
      console.error('Failed to export HDR:', error);
      alert('导出 HDR 失败');
    }
    
    this.hideLoading();
  }

  private start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animate();
  }

  private stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private animate = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.sceneManager.update(deltaTime);

    const cameraState = this.sceneManager.getCameraState();
    const renderParams = this.sceneManager.getRenderParams();
    const cameraMatrices = this.sceneManager.getCameraMatrices();

    this.renderer.updateUniforms(cameraState, renderParams, cameraMatrices);
    this.renderer.render();

    this.performanceMonitor.update();

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private showLoading(message: string): void {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    if (overlay) overlay.classList.remove('hidden');
    if (text) text.textContent = message;
  }

  private hideLoading(): void {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  private showWebGPUError(): void {
    const overlay = document.getElementById('webgpuError');
    if (overlay) overlay.classList.remove('hidden');
  }

  destroy(): void {
    this.stop();
    this.renderer.destroy();
  }
}
