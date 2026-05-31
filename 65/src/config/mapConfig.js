const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const defaultMapConfigs = {
  default: {
    id: 'default',
    name: '标准空域',
    description: '标准对战空域，包含多个资源点和禁飞区',
    bounds: {
      minX: 0,
      maxX: 2000,
      minY: 0,
      maxY: 2000,
      minAlt: 100,
      maxAlt: 10000
    },
    spawnPoints: [
      { x: 200, y: 200, altitude: 2000 },
      { x: 1800, y: 1800, altitude: 2000 },
      { x: 200, y: 1800, altitude: 2000 },
      { x: 1800, y: 200, altitude: 2000 }
    ],
    noFlyZones: [
      {
        id: 'nfz1',
        type: 'circle',
        name: '中央禁飞区',
        center: { x: 1000, y: 1000, altitude: 0 },
        radius: 200,
        minAlt: 100,
        maxAlt: 5000
      },
      {
        id: 'nfz2',
        type: 'cuboid',
        name: '东部军事区',
        minX: 1600, maxX: 1900,
        minY: 800, maxY: 1200,
        minAlt: 100, maxAlt: 8000
      }
    ],
    resourceZones: [
      { x: 500, y: 500, altitude: 3000, type: 'fuel', weight: 1 },
      { x: 1500, y: 500, altitude: 3000, type: 'ammo', weight: 1 },
      { x: 500, y: 1500, altitude: 3000, type: 'shield', weight: 1 },
      { x: 1500, y: 1500, altitude: 3000, type: 'speed', weight: 1 },
      { x: 1000, y: 300, altitude: 4000, type: 'repair', weight: 0.5 },
      { x: 1000, y: 1700, altitude: 4000, type: 'repair', weight: 0.5 }
    ],
    waypoints: [
      { id: 'wp1', name: 'Alpha', x: 400, y: 400, altitude: 2500 },
      { id: 'wp2', name: 'Bravo', x: 1600, y: 400, altitude: 2500 },
      { id: 'wp3', name: 'Charlie', x: 400, y: 1600, altitude: 2500 },
      { id: 'wp4', name: 'Delta', x: 1600, y: 1600, altitude: 2500 },
      { id: 'wp5', name: 'Echo', x: 1000, y: 1000, altitude: 5000 }
    ],
    weather: {
      type: 'clear',
      windSpeed: 10,
      windDirection: 0,
      visibility: 10000
    }
  },
  mountain: {
    id: 'mountain',
    name: '峡谷空域',
    description: '复杂地形空域，包含大量山脉障碍',
    bounds: {
      minX: 0, maxX: 3000,
      minY: 0, maxY: 3000,
      minAlt: 500, maxAlt: 12000
    },
    spawnPoints: [
      { x: 300, y: 1500, altitude: 3000 },
      { x: 2700, y: 1500, altitude: 3000 }
    ],
    obstacles: [
      { type: 'mountain', x: 1000, y: 1000, height: 4000, radius: 300 },
      { type: 'mountain', x: 2000, y: 1500, height: 3500, radius: 250 },
      { type: 'mountain', x: 1500, y: 2500, height: 3000, radius: 200 }
    ],
    resourceZones: [
      { x: 800, y: 2000, altitude: 4000, type: 'fuel', weight: 1 },
      { x: 2200, y: 800, altitude: 4000, type: 'ammo', weight: 1 },
      { x: 1500, y: 1500, altitude: 6000, type: 'speed', weight: 2 }
    ]
  },
  coastal: {
    id: 'coastal',
    name: '沿海空域',
    description: '沿海地区空域，适合海上目标打击',
    bounds: {
      minX: 0, maxX: 2500,
      minY: 0, maxY: 2500,
      minAlt: 50, maxAlt: 8000
    },
    spawnPoints: [
      { x: 500, y: 500, altitude: 1500 },
      { x: 2000, y: 2000, altitude: 1500 }
    ],
    noFlyZones: [
      {
        id: 'port',
        type: 'polygon',
        name: '港口保护区',
        vertices: [
          { x: 1200, y: 1200 },
          { x: 1400, y: 1200 },
          { x: 1400, y: 1400 },
          { x: 1200, y: 1400 }
        ],
        minAlt: 0, maxAlt: 3000
      }
    ]
  }
};

class MapConfig {
  constructor(options = {}) {
    this.currentMap = null;
    this.customMaps = new Map();
    this.customMapsDir = options.customMapsDir || path.join(process.cwd(), 'data', 'maps');
    this.ensureCustomMapsDir();
    this.loadCustomMaps();
  }

  ensureCustomMapsDir() {
    if (!fs.existsSync(this.customMapsDir)) {
      fs.mkdirSync(this.customMapsDir, { recursive: true });
    }
  }

  loadCustomMaps() {
    if (!fs.existsSync(this.customMapsDir)) return;
    
    const files = fs.readdirSync(this.customMapsDir)
      .filter(f => f.endsWith('.json'));
    
    files.forEach(file => {
      try {
        const filePath = path.join(this.customMapsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (this.validateMapConfig(data)) {
          this.customMaps.set(data.id, data);
          console.log(`已加载自定义地图: ${data.name}`);
        }
      } catch (error) {
        console.error(`加载自定义地图失败 ${file}:`, error.message);
      }
    });
  }

  validateMapConfig(config) {
    if (!config.id || !config.name || !config.bounds || !config.spawnPoints) {
      return false;
    }
    
    const requiredBounds = ['minX', 'maxX', 'minY', 'maxY', 'minAlt', 'maxAlt'];
    const hasAllBounds = requiredBounds.every(key => config.bounds[key] !== undefined);
    
    if (!hasAllBounds) return false;
    if (!Array.isArray(config.spawnPoints) || config.spawnPoints.length < 2) return false;
    
    return true;
  }

  getMapConfig(mapId) {
    return this.customMaps.get(mapId) || defaultMapConfigs[mapId] || defaultMapConfigs.default;
  }

  getAllMaps() {
    const defaultMaps = Object.values(defaultMapConfigs);
    const customMaps = Array.from(this.customMaps.values());
    return [...defaultMaps, ...customMaps].map(config => ({
      id: config.id,
      name: config.name,
      description: config.description || '',
      playerCount: config.spawnPoints ? config.spawnPoints.length : 2,
      isCustom: this.customMaps.has(config.id)
    }));
  }

  loadMap(mapId) {
    this.currentMap = this.getMapConfig(mapId);
    return this.currentMap;
  }

  importCustomMap(mapData) {
    if (!this.validateMapConfig(mapData)) {
      return { success: false, error: '无效的地图配置' };
    }
    
    const mapId = mapData.id || uuidv4();
    const config = {
      ...mapData,
      id: mapId,
      isCustom: true,
      createdAt: Date.now()
    };
    
    this.customMaps.set(mapId, config);
    
    const filePath = path.join(this.customMapsDir, `${mapId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    
    return { success: true, mapId, filePath };
  }

  deleteCustomMap(mapId) {
    if (!this.customMaps.has(mapId)) {
      return { success: false, error: '地图不存在' };
    }
    
    this.customMaps.delete(mapId);
    const filePath = path.join(this.customMapsDir, `${mapId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return { success: true };
  }

  exportMap(mapId) {
    const config = this.getMapConfig(mapId);
    return JSON.parse(JSON.stringify(config));
  }

  getSpawnPoint(index = 0) {
    if (!this.currentMap || !this.currentMap.spawnPoints) return null;
    return this.currentMap.spawnPoints[index % this.currentMap.spawnPoints.length];
  }

  getBounds() {
    return this.currentMap ? this.currentMap.bounds : defaultMapConfigs.default.bounds;
  }

  getNoFlyZones() {
    return this.currentMap ? this.currentMap.noFlyZones || [] : [];
  }

  getResourceZones() {
    return this.currentMap ? this.currentMap.resourceZones || [] : [];
  }

  getWaypoints() {
    return this.currentMap ? this.currentMap.waypoints || [] : [];
  }

  getWeather() {
    return this.currentMap ? this.currentMap.weather || { type: 'clear' } : { type: 'clear' };
  }

  getMaxPlayers() {
    return this.currentMap && this.currentMap.spawnPoints 
      ? this.currentMap.spawnPoints.length 
      : 2;
  }

  validatePosition(position) {
    const bounds = this.getBounds();
    return position.x >= bounds.minX && position.x <= bounds.maxX &&
           position.y >= bounds.minY && position.y <= bounds.maxY &&
           position.altitude >= bounds.minAlt && position.altitude <= bounds.maxAlt;
  }

  getCustomMapList() {
    return Array.from(this.customMaps.values()).map(config => ({
      id: config.id,
      name: config.name,
      description: config.description || '',
      playerCount: config.spawnPoints ? config.spawnPoints.length : 2,
      createdAt: config.createdAt
    }));
  }
}

module.exports = { MapConfig, mapConfigs: defaultMapConfigs };
