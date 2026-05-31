import { ViewPresets, InteractionConfig } from '../config/SceneConfig.js';

export class InteractionManager {
    constructor(camera, controls, container, stratumModel, drilling, dataPoints) {
        this.camera = camera;
        this.controls = controls;
        this.container = container;
        this.stratumModel = stratumModel;
        this.drilling = drilling;
        this.dataPoints = dataPoints;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.isDragging = false;
        this.dragStart = new THREE.Vector2();
        
        this.onViewChange = null;
        this.onSectionChange = null;
        
        this._onClick = this.onClick.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseDown = this.onMouseDown.bind(this);
        this._onMouseUp = this.onMouseUp.bind(this);
        this._onWheel = this.onWheel.bind(this);
        this._onWindowResize = this.onWindowResize.bind(this);
        this._onKeyDown = this.onKeyDown.bind(this);
        
        this.bindEvents();
    }

    bindEvents() {
        this.container.addEventListener('click', this._onClick);
        this.container.addEventListener('mousemove', this._onMouseMove);
        this.container.addEventListener('mousedown', this._onMouseDown);
        this.container.addEventListener('mouseup', this._onMouseUp);
        this.container.addEventListener('wheel', this._onWheel);
        
        window.addEventListener('resize', this._onWindowResize);
        window.addEventListener('keydown', this._onKeyDown);
    }

    onClick(event) {
        if (this.isDragging) return;
        
        if (this.drilling.isInDrillMode()) {
            const drilled = this.drilling.handleClick(event, this.container);
            if (drilled) return;
        }
        
        const intersects = this.getIntersects(event);
        const pointClicked = this.dataPoints.handleClick(intersects);
        if (pointClicked) return;
        
        this.dataPoints.clearSelection();
    }

    onMouseMove(event) {
        const intersects = this.getIntersects(event);
        this.dataPoints.handleHover(intersects);
    }

    onMouseDown(event) {
        this.isDragging = false;
        this.dragStart.set(event.clientX, event.clientY);
    }

    onMouseUp(event) {
        const deltaX = Math.abs(event.clientX - this.dragStart.x);
        const deltaY = Math.abs(event.clientY - this.dragStart.y);
        this.isDragging = deltaX > 3 || deltaY > 3;
    }

    onWheel(event) {
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    onKeyDown(event) {
        switch (event.key.toLowerCase()) {
            case '1':
                this.setView('3d');
                break;
            case '2':
                this.setView('top');
                break;
            case '3':
                this.setView('front');
                break;
            case '4':
                this.setView('side');
                break;
            case 'd':
                this.drilling.toggleDrillMode();
                break;
            case 'escape':
                this.drilling.disableDrillMode();
                this.dataPoints.clearSelection();
                break;
        }
    }

    getIntersects(event) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const dataPointMeshes = this.dataPoints.getClickableMeshes();
        const dataPointIntersects = this.raycaster.intersectObjects(dataPointMeshes, true);
        
        if (dataPointIntersects.length > 0) {
            return dataPointIntersects;
        }
        
        const otherMeshes = [
            ...this.stratumModel.getAllMeshes(),
            ...this.drilling.getAllDrillMeshes()
        ];
        
        return this.raycaster.intersectObjects(otherMeshes, true);
    }

    setView(viewType) {
        const preset = ViewPresets[viewType];
        if (!preset) return;
        
        this.animateCameraTo(
            preset.position,
            preset.lookAt,
            InteractionConfig.animationDuration
        );
        
        if (this.onViewChange) {
            this.onViewChange(viewType);
        }
    }

    setSectionMode(mode) {
        this.stratumModel.setSectionMode(mode);
        
        if (this.onSectionChange) {
            this.onSectionChange(mode);
        }
    }

    animateCameraTo(position, lookAt, duration) {
        const startPosition = this.camera.position.clone();
        const startLookAt = this.controls.target.clone();
        
        const endPosition = new THREE.Vector3(position.x, position.y, position.z);
        const endLookAt = new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z);
        
        const startTime = performance.now();
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeProgress = this.easeInOutCubic(progress);
            
            this.camera.position.lerpVectors(startPosition, endPosition, easeProgress);
            this.controls.target.lerpVectors(startLookAt, endLookAt, easeProgress);
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    toggleDrillMode() {
        const enabled = this.drilling.toggleDrillMode();
        return enabled;
    }

    clearDrillHoles() {
        this.drilling.clearAllDrillHoles();
    }

    update(deltaTime) {
        this.drilling.update(deltaTime);
        this.dataPoints.update(this.camera);
    }

    dispose() {
        this.container.removeEventListener('click', this._onClick);
        this.container.removeEventListener('mousemove', this._onMouseMove);
        this.container.removeEventListener('mousedown', this._onMouseDown);
        this.container.removeEventListener('mouseup', this._onMouseUp);
        this.container.removeEventListener('wheel', this._onWheel);
        
        window.removeEventListener('resize', this._onWindowResize);
        window.removeEventListener('keydown', this._onKeyDown);
    }
}
