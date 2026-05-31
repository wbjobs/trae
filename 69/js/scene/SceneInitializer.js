import { SceneSetup } from './SceneSetup.js';
import { StratumModel } from '../model/StratumModel.js';
import { DataPoints } from '../model/DataPoints.js';
import { FaultSimulation } from '../model/FaultSimulation.js';
import { ExplorationPath } from '../model/ExplorationPath.js';
import { DrillingInteraction } from '../interaction/DrillingInteraction.js';
import { InteractionManager } from '../interaction/InteractionManager.js';
import { RenderOptimizer } from '../optimization/RenderOptimizer.js';
import { ModelExporter } from '../export/ModelExporter.js';
import { SceneConfig } from '../config/SceneConfig.js';

export class SceneInitializer {
    constructor(containerId = 'canvas-container') {
        this.containerId = containerId;
        this.container = null;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.lights = [];
        this.helpers = [];
        
        this.stratumModel = null;
        this.dataPoints = null;
        this.faultSimulation = null;
        this.explorationPath = null;
        
        this.drilling = null;
        this.interactionManager = null;
        this.renderOptimizer = null;
        this.modelExporter = null;
        
        this.clock = new THREE.Clock();
        this.isInitialized = false;
        
        this.onInitialized = null;
    }

    async initialize() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            throw new Error(`Container with id "${this.containerId}" not found`);
        }
        
        this.createCore();
        this.createModels();
        this.createInteractions();
        this.createServices();
        
        this.isInitialized = true;
        
        if (this.onInitialized) {
            this.onInitialized(this.getAPI());
        }
        
        return this.getAPI();
    }

    createCore() {
        this.scene = SceneSetup.createScene();
        this.camera = SceneSetup.createCamera(this.container);
        this.renderer = SceneSetup.createRenderer(this.container);
        this.controls = SceneSetup.createControls(this.camera, this.renderer);
        this.lights = SceneSetup.createLights(this.scene);
        this.helpers = SceneSetup.createHelpers(this.scene);
    }

    createModels() {
        this.stratumModel = new StratumModel(this.scene);
        this.stratumModel.build();
        
        this.dataPoints = new DataPoints(this.scene, this.camera);
        this.dataPoints.build();
        
        this.faultSimulation = new FaultSimulation(this.scene, this.camera, this.stratumModel);
        this.faultSimulation.build();
        
        this.explorationPath = new ExplorationPath(this.scene, this.camera, this.renderer.domElement);
        this.explorationPath.build();
    }

    createInteractions() {
        this.drilling = new DrillingInteraction(this.scene, this.camera, this.stratumModel);
        
        this.interactionManager = new InteractionManager(
            this.camera,
            this.controls,
            this.renderer.domElement,
            this.stratumModel,
            this.drilling,
            this.dataPoints
        );
    }

    createServices() {
        this.renderOptimizer = new RenderOptimizer(
            this.scene,
            this.camera,
            this.renderer
        );
        this.renderOptimizer.registerStratumModel(this.stratumModel);
        
        this.modelExporter = new ModelExporter();
    }

    getAPI() {
        return {
            scene: this.scene,
            camera: this.camera,
            renderer: this.renderer,
            controls: this.controls,
            
            stratumModel: this.stratumModel,
            dataPoints: this.dataPoints,
            faultSimulation: this.faultSimulation,
            explorationPath: this.explorationPath,
            
            drilling: this.drilling,
            interactionManager: this.interactionManager,
            renderOptimizer: this.renderOptimizer,
            modelExporter: this.modelExporter,
            
            clock: this.clock,
            container: this.container,
            
            render: this.render.bind(this),
            update: this.update.bind(this),
            dispose: this.dispose.bind(this)
        };
    }

    render() {
        if (!this.isInitialized) return;
        this.renderer.render(this.scene, this.camera);
    }

    update(deltaTime) {
        if (!this.isInitialized) return;
        
        this.controls.update();
        
        if (this.interactionManager) {
            this.interactionManager.update(deltaTime);
        }
        
        if (this.faultSimulation) {
            this.faultSimulation.update(deltaTime);
        }
        
        if (this.explorationPath) {
            this.explorationPath.update(deltaTime);
        }
        
        if (this.renderOptimizer) {
            this.renderOptimizer.update(deltaTime);
        }
    }

    dispose() {
        if (this.interactionManager) {
            this.interactionManager.dispose();
        }
        if (this.drilling) {
            this.drilling.dispose();
        }
        if (this.dataPoints) {
            this.dataPoints.dispose();
        }
        if (this.stratumModel) {
            this.stratumModel.dispose();
        }
        if (this.faultSimulation) {
            this.faultSimulation.dispose();
        }
        if (this.explorationPath) {
            this.explorationPath.dispose();
        }
        if (this.renderOptimizer) {
            this.renderOptimizer.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        this.isInitialized = false;
    }
}
