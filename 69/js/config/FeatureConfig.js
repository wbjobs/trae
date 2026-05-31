export const FaultConfig = {
    enabled: true,
    defaultFault: {
        name: '主断层带',
        strike: 45,
        dip: 60,
        dipDirection: 'SE',
        width: 3,
        startPoint: { x: -30, z: -40 },
        endPoint: { x: 30, z: 30 },
        depth: { min: -15, max: -50 },
        displacement: 8,
        color: 0xff4444
    },
    animation: {
        speed: 0.5,
        pulseIntensity: 0.3,
        particleCount: 50,
        particleSpeed: 2
    }
};

export const PathConfig = {
    enabled: true,
    pointSize: 0.8,
    lineColor: 0x00ffff,
    lineWidth: 2,
    pointColor: 0x00ff88,
    activePointColor: 0xffff00,
    maxPoints: 50,
    snapToGrid: true,
    gridSize: 5
};

export const ExportConfig = {
    enabled: true,
    formats: ['glb', 'obj', 'json'],
    defaultFormat: 'glb',
    includeTextures: true,
    compressionLevel: 6,
    coordinateSystem: 'right-handed',
    upAxis: 'Y'
};

export const OptimizationConfig = {
    enabled: true,
    lodLevels: [
        { distance: 50, opacity: 1.0, detail: 'high' },
        { distance: 100, opacity: 0.9, detail: 'medium' },
        { distance: 180, opacity: 0.7, detail: 'low' },
        { distance: 250, opacity: 0.4, detail: 'lowest' }
    ],
    frustumCulling: true,
    dynamicResolution: true,
    maxPixelRatio: 2,
    minPixelRatio: 0.8,
    targetFPS: 60,
    autoAdjustQuality: true
};
