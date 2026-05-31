import { SceneConfig } from '../config/SceneConfig.js';

export class SceneSetup {
    static createScene() {
        const scene = new THREE.Scene();
        
        if (SceneConfig.fog.enabled) {
            scene.fog = new THREE.Fog(
                SceneConfig.fog.color,
                SceneConfig.fog.near,
                SceneConfig.fog.far
            );
        }
        
        return scene;
    }

    static createCamera(container) {
        const config = SceneConfig.camera;
        
        const camera = new THREE.PerspectiveCamera(
            config.fov,
            container.clientWidth / container.clientHeight,
            config.near,
            config.far
        );
        
        camera.position.set(
            config.initialPosition.x,
            config.initialPosition.y,
            config.initialPosition.z
        );
        
        camera.lookAt(
            config.lookAt.x,
            config.lookAt.y,
            config.lookAt.z
        );
        
        return camera;
    }

    static createRenderer(container) {
        const config = SceneConfig.renderer;
        
        const renderer = new THREE.WebGLRenderer({
            antialias: config.antialias,
            alpha: config.alpha
        });
        
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(config.pixelRatio);
        renderer.setClearColor(config.clearColor);
        
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.localClippingEnabled = true;
        
        container.appendChild(renderer.domElement);
        
        return renderer;
    }

    static createControls(camera, renderer) {
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        
        const config = SceneConfig.controls;
        controls.enableDamping = config.enableDamping;
        controls.dampingFactor = config.dampingFactor;
        controls.enablePan = config.enablePan;
        controls.enableZoom = config.enableZoom;
        controls.enableRotate = config.enableRotate;
        controls.minDistance = config.minDistance;
        controls.maxDistance = config.maxDistance;
        controls.maxPolarAngle = config.maxPolarAngle;
        controls.minPolarAngle = config.minPolarAngle;
        
        controls.target.set(0, -30, 0);
        controls.update();
        
        return controls;
    }

    static createLights(scene) {
        const lightConfig = SceneConfig.lights;
        const lights = [];
        
        if (lightConfig.ambient.enabled) {
            const ambientLight = new THREE.AmbientLight(
                lightConfig.ambient.color,
                lightConfig.ambient.intensity
            );
            scene.add(ambientLight);
            lights.push({ type: 'ambient', light: ambientLight });
        }
        
        if (lightConfig.directional.enabled) {
            const directionalLight = new THREE.DirectionalLight(
                lightConfig.directional.color,
                lightConfig.directional.intensity
            );
            directionalLight.position.set(
                lightConfig.directional.position.x,
                lightConfig.directional.position.y,
                lightConfig.directional.position.z
            );
            directionalLight.castShadow = lightConfig.directional.castShadow;
            directionalLight.shadow.mapSize.width = lightConfig.directional.shadowMapSize.width;
            directionalLight.shadow.mapSize.height = lightConfig.directional.shadowMapSize.height;
            directionalLight.shadow.camera.near = 0.5;
            directionalLight.shadow.camera.far = 500;
            directionalLight.shadow.camera.left = -100;
            directionalLight.shadow.camera.right = 100;
            directionalLight.shadow.camera.top = 100;
            directionalLight.shadow.camera.bottom = -100;
            scene.add(directionalLight);
            lights.push({ type: 'directional', light: directionalLight });
        }
        
        if (lightConfig.point.enabled) {
            const pointLight = new THREE.PointLight(
                lightConfig.point.color,
                lightConfig.point.intensity
            );
            pointLight.position.set(
                lightConfig.point.position.x,
                lightConfig.point.position.y,
                lightConfig.point.position.z
            );
            scene.add(pointLight);
            lights.push({ type: 'point', light: pointLight });
        }
        
        if (lightConfig.hemisphere.enabled) {
            const hemisphereLight = new THREE.HemisphereLight(
                lightConfig.hemisphere.skyColor,
                lightConfig.hemisphere.groundColor,
                lightConfig.hemisphere.intensity
            );
            scene.add(hemisphereLight);
            lights.push({ type: 'hemisphere', light: hemisphereLight });
        }
        
        return lights;
    }

    static createHelpers(scene) {
        const helpers = [];
        
        if (SceneConfig.grid.enabled) {
            const gridHelper = new THREE.GridHelper(
                SceneConfig.grid.size,
                SceneConfig.grid.divisions,
                SceneConfig.grid.color1,
                SceneConfig.grid.color2
            );
            gridHelper.position.set(
                SceneConfig.grid.position.x,
                SceneConfig.grid.position.y,
                SceneConfig.grid.position.z
            );
            scene.add(gridHelper);
            helpers.push({ type: 'grid', helper: gridHelper });
        }
        
        if (SceneConfig.axes.enabled) {
            const axesHelper = new THREE.AxesHelper(SceneConfig.axes.size);
            axesHelper.position.set(
                SceneConfig.axes.position.x,
                SceneConfig.axes.position.y,
                SceneConfig.axes.position.z
            );
            scene.add(axesHelper);
            helpers.push({ type: 'axes', helper: axesHelper });
        }
        
        return helpers;
    }

    static handleResize(camera, renderer, container) {
        return () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            
            renderer.setSize(width, height);
        };
    }
}
