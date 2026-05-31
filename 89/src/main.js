import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import PipelineRenderer from './core/PipelineRenderer.js';
import PipelineModel from './models/PipelineModel.js';
import PipelinePresets from './models/PipelinePresets.js';
import ModelCompressor from './models/ModelCompressor.js';
import FluidParticles from './simulation/FluidParticles.js';
import PressureVisualizer from './simulation/PressureVisualizer.js';
import FlowSimulator from './simulation/FlowSimulator.js';
import FlowSplitter from './simulation/FlowSplitter.js';
import InspectionPathPlanner from './simulation/InspectionPathPlanner.js';
import FaultMarker from './simulation/FaultMarker.js';
import OrbitControls from './controls/OrbitControls.js';
import FirstPersonControls from './controls/FirstPersonControls.js';
import SectionClipping from './controls/SectionClipping.js';
import PickInteractor from './controls/PickInteractor.js';
import SensorDataInterface from './data/SensorDataInterface.js';
import DataSimulator from './data/DataSimulator.js';
import MaterialConfig from './config/MaterialConfig.js';

class PipelineVisualizationApp {
  constructor(container) {
    this.container = container;
    this.isInitialized = false;
    this.controlMode = 'orbit';
    this.useSimulatedData = true;

    this.init();
  }

  init() {
    this.renderer = new PipelineRenderer(this.container);
    this.scene = this.renderer.getScene();
    this.camera = this.renderer.getCamera();
    this.domElement = this.renderer.getRenderer().domElement;

    this.pipelineModel = new PipelineModel();
    this.scene.add(this.pipelineModel.getGroup());

    this.fluidParticles = new FluidParticles(this.scene, {
      particleCount: 300,
      particleSize: 0.6,
    });

    this.pressureVisualizer = new PressureVisualizer(
      this.scene,
      this.renderer.getRenderer(),
      this.camera
    );

    this.flowSimulator = new FlowSimulator(this.scene);
    this.faultMarker = new FaultMarker(this.scene, this.camera);

    this.flowSplitter = new FlowSplitter(this.scene);
    this.inspectionPathPlanner = new InspectionPathPlanner(this.scene, this.pipelineModel, this.camera);
    this.sectionClipping = new SectionClipping(this.renderer.getRenderer(), this.scene);
    this.modelCompressor = new ModelCompressor();
    this.materialConfig = MaterialConfig;

    this.orbitControls = new OrbitControls(this.camera, this.domElement);
    this.orbitControls.setTarget(0, 0, 0);

    this.firstPersonControls = new FirstPersonControls(this.camera, this.domElement);
    this.firstPersonControls.setPosition(50, 30, 50);
    this.firstPersonControls.setRotation(-Math.PI / 4, 0);

    this.pickInteractor = new PickInteractor(this.camera, this.domElement, []);

    this.sensorDataInterface = new SensorDataInterface();
    this.dataSimulator = new DataSimulator({
      updateInterval: 2000,
      faultChance: 0.01,
    });

    this.createGround();
    this.createPipeline();
    this.setupControls();
    this.setupDataSimulation();
    this.setupAnimation();

    this.setupErrorHandling();
    this.setupCleanup();

    this.isInitialized = true;
    console.log('Pipeline 3D Visualization Platform initialized');
  }

  setupErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
    });
  }

  setupCleanup() {
    window.addEventListener('beforeunload', () => {
      this.dispose();
    });

    if (typeof window !== 'undefined') {
      window.PipelineVisualizationApp = PipelineVisualizationApp;
    }
  }

  createGround() {
    const gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
    gridHelper.position.y = -0.5;
    this.scene.add(gridHelper);

    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.51;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  createPipeline() {
    PipelinePresets.createComplexPipeline(this.pipelineModel);

    const allComponents = this.pipelineModel.getAllComponents();
    this.pickInteractor.setTargetObjects(allComponents);

    const pipeIds = this.pipelineModel.pipes.map(p => p.userData.id);
    const valveIds = this.pipelineModel.valves.map(v => v.userData.id);
    const pumpIds = this.pipelineModel.pumps.map(p => p.userData.id);

    this.dataSimulator.setPipeIds(pipeIds);
    this.dataSimulator.setValveIds(valveIds);
    this.dataSimulator.setPumpIds(pumpIds);

    this.pipelineModel.pipes.forEach(pipe => {
      this.flowSimulator.addPipe(pipe);

      this.pressureVisualizer.addPipePressureData(pipe);

      const points = [pipe.userData.start.clone(), pipe.userData.end.clone()];
      this.fluidParticles.addPath(points, {
        color: 0x00ffff,
        flowRate: 1.0,
      });
    });

    this.createDemoSplitters();
    this.inspectionPathPlanner.generateFullInspectionPath();
    this.addDemoFaults();
  }

  createDemoSplitters() {
    const joints = this.pipelineModel.joints;
    if (joints.length > 0) {
      const demoSplitter = this.flowSplitter.createSplitter(
        joints[0].position.clone(),
        {
          name: '主管道分流器',
          splitRatios: [0.6, 0.4],
          inputFlowRate: 2.0,
        }
      );

      if (this.pipelineModel.pipes.length >= 3) {
        this.flowSplitter.connectPipes(demoSplitter, [
          this.pipelineModel.pipes[1],
          this.pipelineModel.pipes[2],
        ]);
      }
    }
  }

  addDemoFaults() {
    const pipes = this.pipelineModel.pipes;
    if (pipes.length > 2) {
      this.faultMarker.createFaultMarker(pipes[2].position.clone(), {
        type: 'warning',
        title: '压力警告',
        description: '管道压力接近上限',
        severity: 'medium',
        componentId: pipes[2].userData.id,
      });

      this.pipelineModel.setComponentWarning(pipes[2].userData.id, true);
    }

    if (pipes.length > 5) {
      this.faultMarker.createFaultMarker(pipes[5].position.clone(), {
        type: 'fault',
        title: '泄漏故障',
        description: '检测到管道泄漏',
        severity: 'high',
        componentId: pipes[5].userData.id,
      });

      this.pipelineModel.setComponentFault(pipes[5].userData.id, true);
    }
  }

  setupControls() {
    this.pickInteractor.onSelect((object) => {
      this.onComponentSelected(object);
    });

    this.pickInteractor.onDoubleClick((object) => {
      this.focusOnComponent(object);
    });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onKeyDown(event) {
    switch (event.code) {
      case 'KeyV':
        this.toggleControlMode();
        break;
      case 'KeyP':
        this.takeSnapshot();
        break;
      case 'KeyF':
        if (this.pickInteractor.selectedObject) {
          this.focusOnComponent(this.pickInteractor.selectedObject);
        }
        break;
      case 'KeyR':
        this.orbitControls.reset();
        break;
      case 'Digit1':
        this.setView('front');
        break;
      case 'Digit2':
        this.setView('top');
        break;
      case 'Digit3':
        this.setView('side');
        break;
    }
  }

  onComponentSelected(object) {
    if (object.userData) {
      console.log('Selected:', object.userData);
    }
  }

  focusOnComponent(object) {
    const position = object.position.clone();
    const distance = 30;
    const offset = new THREE.Vector3(distance, distance, distance);

    if (this.controlMode === 'orbit') {
      this.orbitControls.setTarget(position);
      this.camera.position.copy(position.clone().add(offset));
      this.camera.lookAt(position);
    } else {
      this.firstPersonControls.setPosition(position.clone().add(offset));
    }
  }

  toggleControlMode() {
    if (this.controlMode === 'orbit') {
      this.controlMode = 'firstPerson';
      this.orbitControls.enabled = false;
      this.firstPersonControls.enable();
    } else {
      this.controlMode = 'orbit';
      this.firstPersonControls.disable();
      this.orbitControls.enabled = true;
    }
    console.log('Control mode:', this.controlMode);
  }

  setView(view) {
    const center = new THREE.Vector3(0, 0, 0);
    const distance = 100;

    switch (view) {
      case 'front':
        this.camera.position.set(0, 0, distance);
        break;
      case 'top':
        this.camera.position.set(0, distance, 0.01);
        break;
      case 'side':
        this.camera.position.set(distance, 0, 0);
        break;
    }

    this.camera.lookAt(center);
    this.orbitControls.setTarget(center);
  }

  setupDataSimulation() {
    this.dataSimulator.onData((data) => {
      this.updateFromSensorData(data);
    });

    this.dataSimulator.onAlarm((alarm) => {
      this.handleAlarm(alarm);
    });

    this.dataSimulator.start();
  }

  updateFromSensorData(data) {
    Object.entries(data.pressure).forEach(([pipeId, pressure]) => {
      const pipe = this.pipelineModel.getPipeById(pipeId);
      if (pipe) {
        pipe.userData.pressure = pressure;
        this.pressureVisualizer.updatePressureForPipe(pipeId, pressure);
      }
    });

    Object.entries(data.flow).forEach(([pipeId, flow]) => {
      const pipe = this.pipelineModel.getPipeById(pipeId);
      if (pipe) {
        pipe.userData.flowRate = flow;
        this.flowSimulator.setPipeFlowRate(pipeId, flow);
      }
    });

    Object.entries(data.valves).forEach(([valveId, status]) => {
      const valve = this.pipelineModel.valves.find(v => v.userData.id === valveId);
      if (valve) {
        valve.userData.isOpen = status.isOpen;
        if (valve.userData.handle) {
          valve.userData.handle.rotation.z = status.isOpen ? 0 : Math.PI / 2;
        }
      }
    });

    Object.entries(data.pumps).forEach(([pumpId, status]) => {
      const pump = this.pipelineModel.pumps.find(p => p.userData.id === pumpId);
      if (pump) {
        pump.userData.isRunning = status.isRunning;
        if (pump.userData.fan) {
          pump.userData.fan.material.emissiveIntensity = status.isRunning ? 0.5 : 0;
        }
      }
    });
  }

  handleAlarm(alarm) {
    console.warn('Alarm received:', alarm);

    const component = this.pipelineModel.getComponentById(alarm.componentId);
    if (!component) return;

    let markerPosition;
    if (component.userData.start && component.userData.end) {
      markerPosition = component.userData.start.clone().add(component.userData.end).multiplyScalar(0.5);
    } else {
      markerPosition = component.position.clone();
    }

    const existingMarkers = this.faultMarker.getMarkersByComponentId(alarm.componentId);
    if (existingMarkers.length > 0) {
      return;
    }

    if (alarm.severity === 'high') {
      this.pipelineModel.setComponentFault(alarm.componentId, true);
      this.faultMarker.createFaultMarker(markerPosition, {
        type: 'fault',
        title: alarm.type,
        description: alarm.message,
        severity: alarm.severity,
        componentId: alarm.componentId,
      });
    } else {
      this.pipelineModel.setComponentWarning(alarm.componentId, true);
      this.faultMarker.createFaultMarker(markerPosition, {
        type: 'warning',
        title: alarm.type,
        description: alarm.message,
        severity: alarm.severity,
        componentId: alarm.componentId,
      });
    }
  }

  setupAnimation() {
    this.renderer.addAnimationCallback((delta, elapsed) => {
      this.update(delta, elapsed);
    });
  }

  update(delta, elapsed) {
    if (this.controlMode === 'orbit') {
      this.orbitControls.update();
    } else {
      this.firstPersonControls.update(delta);
    }

    this.pickInteractor.update(delta, elapsed);
    this.fluidParticles.update(delta);
    this.pressureVisualizer.update(delta, elapsed);
    this.flowSimulator.update(delta, elapsed);
    this.flowSplitter.update(delta, elapsed);
    this.inspectionPathPlanner.update(delta, elapsed);
    this.sectionClipping.update(delta, elapsed);
    this.faultMarker.update(delta, elapsed);

    this.pipelineModel.pumps.forEach(pump => {
      if (pump.userData.isRunning && pump.userData.fan) {
        pump.userData.fan.rotation.y += delta * 10;
      }
    });
  }

  takeSnapshot() {
    this.renderer.downloadSnapshot(`pipeline-snapshot-${Date.now()}.png`);
  }

  setFlowSpeed(speed) {
    this.fluidParticles.setSpeed(speed);
    this.flowSimulator.setFlowSpeed(speed);
  }

  toggleParticles(visible) {
    this.fluidParticles.setVisible(visible);
  }

  togglePressureLabels(visible) {
    this.pressureVisualizer.setLabelsVisible(visible);
  }

  toggleFlowArrows(visible) {
    this.flowSimulator.setArrowsVisible(visible);
    this.flowSimulator.setLinesVisible(visible);
  }

  toggleFaultMarkers(visible) {
    this.faultMarker.setVisible(visible);
  }

  toggleSplitters(visible) {
    this.flowSplitter.setVisible(visible);
  }

  toggleInspectionPaths(visible) {
    this.inspectionPathPlanner.setAllPathsVisible(visible);
  }

  toggleSectionClipping(enabled) {
    this.sectionClipping.setEnabled(enabled);
  }

  setSectionPlaneEnabled(planeIndex, enabled) {
    this.sectionClipping.setPlaneEnabled(planeIndex, enabled);
  }

  setSectionPlanePosition(planeIndex, position) {
    this.sectionClipping.setPlanePosition(planeIndex, position);
  }

  playInspectionPath(pathIndex) {
    this.inspectionPathPlanner.playPath(pathIndex);
  }

  pauseInspectionPath() {
    this.inspectionPathPlanner.pause();
  }

  resumeInspectionPath() {
    this.inspectionPathPlanner.resume();
  }

  stopInspectionPath() {
    this.inspectionPathPlanner.stop();
  }

  setInspectionSpeed(speed) {
    this.inspectionPathPlanner.setPlaybackSpeed(speed);
  }

  getInspectionPaths() {
    return this.inspectionPathPlanner.getPaths();
  }

  setSplitterRatio(splitterIndex, ratioIndex, ratio) {
    this.flowSplitter.setSplitRatio(splitterIndex, ratioIndex, ratio);
  }

  getSplitters() {
    return this.flowSplitter.getSplitters();
  }

  getMaterials() {
    return this.materialConfig.getMaterialList();
  }

  getFluids() {
    return this.materialConfig.getFluidList();
  }

  dispose() {
    if (!this.isInitialized) return;
    
    try {
      this.dataSimulator.dispose();
      this.pickInteractor.dispose();
      this.orbitControls.dispose();
      this.firstPersonControls.dispose();
      this.fluidParticles.dispose();
      this.pressureVisualizer.dispose();
      this.flowSimulator.dispose();
      this.faultMarker.dispose();
      this.pipelineModel.dispose();
      this.renderer.dispose();
    } catch (e) {
      console.error('Error during dispose:', e);
    }
    
    this.isInitialized = false;
  }
}

export default PipelineVisualizationApp;
