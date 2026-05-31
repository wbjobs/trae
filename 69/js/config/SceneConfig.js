export const SceneConfig = {
    containerId: 'canvas-container',
    
    camera: {
        fov: 60,
        near: 0.1,
        far: 2000,
        initialPosition: { x: 80, y: 80, z: 80 },
        lookAt: { x: 0, y: -30, z: 0 }
    },
    
    renderer: {
        antialias: true,
        alpha: true,
        clearColor: 0x1a1a2e,
        pixelRatio: Math.min(window.devicePixelRatio, 2)
    },
    
    lights: {
        ambient: {
            enabled: true,
            color: 0xffffff,
            intensity: 0.6
        },
        directional: {
            enabled: true,
            color: 0xffffff,
            intensity: 0.8,
            position: { x: 50, y: 100, z: 50 },
            castShadow: true,
            shadowMapSize: { width: 1024, height: 1024 }
        },
        point: {
            enabled: true,
            color: 0xffffff,
            intensity: 0.4,
            position: { x: -50, y: 50, z: -50 }
        },
        hemisphere: {
            enabled: true,
            skyColor: 0x87ceeb,
            groundColor: 0x8b7355,
            intensity: 0.3
        }
    },
    
    controls: {
        enableDamping: true,
        dampingFactor: 0.05,
        enablePan: true,
        enableZoom: true,
        enableRotate: true,
        minDistance: 10,
        maxDistance: 300,
        maxPolarAngle: Math.PI / 2 - 0.05,
        minPolarAngle: 0.1
    },
    
    grid: {
        enabled: true,
        size: 200,
        divisions: 40,
        color1: 0x444444,
        color2: 0x333333,
        position: { x: 0, y: 0, z: 0 }
    },
    
    axes: {
        enabled: true,
        size: 30,
        position: { x: -90, y: 0, z: -90 }
    },
    
    fog: {
        enabled: true,
        color: 0x1a1a2e,
        near: 100,
        far: 500
    },
    
    sectionPlanes: {
        xAxis: {
            position: 0,
            orientation: 'x',
            color: 0x00ff00
        },
        zAxis: {
            position: 0,
            orientation: 'z',
            color: 0x0000ff
        }
    }
};

export const ViewPresets = {
    '3d': {
        position: { x: 80, y: 80, z: 80 },
        lookAt: { x: 0, y: -30, z: 0 }
    },
    'top': {
        position: { x: 0, y: 150, z: 0.01 },
        lookAt: { x: 0, y: -30, z: 0 }
    },
    'front': {
        position: { x: 0, y: 0, z: 150 },
        lookAt: { x: 0, y: -30, z: 0 }
    },
    'side': {
        position: { x: 150, y: 0, z: 0 },
        lookAt: { x: 0, y: -30, z: 0 }
    }
};

export const ModelConfig = {
    stratum: {
        width: 100,
        depth: 100,
        defaultOpacity: 0.9,
        edgeOpacity: 0.2,
        edgeColor: 0x000000,
        useOptimizedRendering: true
    },
    drill: {
        radius: 0.5,
        color: 0xff4444,
        opacity: 0.9
    },
    dataPoint: {
        sphereRadius: 1.2,
        coneHeight: 2.5,
        labelOffset: 3
    }
};

export const InteractionConfig = {
    raycasterThreshold: 0.5,
    drillSpeed: 50,
    animationDuration: 500,
    hoverColor: 0xffff00
};
