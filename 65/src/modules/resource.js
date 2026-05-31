const { v4: uuidv4 } = require('uuid');
const CoordinateSystem = require('./coordinate');

class ResourceManager {
  constructor(coordinateSystem, config = {}) {
    this.coordSystem = coordinateSystem || new CoordinateSystem();
    this.resources = new Map();
    this.config = {
      maxResources: config.maxResources || 10,
      refreshInterval: config.refreshInterval || 30000,
      minValue: config.minValue || 10,
      maxValue: config.maxValue || 100,
      types: config.types || ['fuel', 'ammo', 'shield', 'speed', 'repair']
    };
    this.refreshTimer = null;
  }

  createResource(type, position, value, options = {}) {
    const id = uuidv4();
    const resource = {
      id,
      type,
      position: this.coordSystem.createPoint(position.x, position.y, position.altitude),
      value: value || this.randomValue(),
      capturedBy: null,
      capturedAt: null,
      respawnAt: options.respawnAt || null,
      isActive: true,
      createdAt: Date.now(),
      captureTime: options.captureTime || 0,
      duration: options.duration || null
    };
    this.resources.set(id, resource);
    return resource;
  }

  randomValue() {
    return Math.floor(Math.random() * (this.config.maxValue - this.config.minValue + 1)) + this.config.minValue;
  }

  randomType() {
    return this.config.types[Math.floor(Math.random() * this.config.types.length)];
  }

  randomPosition(existingPositions = [], minDistance = 100) {
    const bounds = this.coordSystem.bounds;
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const position = this.coordSystem.createPoint(
        bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
        bounds.minAlt + Math.random() * (bounds.maxAlt - bounds.minAlt)
      );

      const tooClose = existingPositions.some(p => 
        this.coordSystem.distance2D(position, p) < minDistance
      );

      if (!tooClose) {
        return position;
      }
      attempts++;
    }

    return this.coordSystem.createPoint(
      bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
      bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
      bounds.minAlt + Math.random() * (bounds.maxAlt - bounds.minAlt)
    );
  }

  spawnRandomResource() {
    const activeCount = this.getActiveResources().length;
    if (activeCount >= this.config.maxResources) return null;

    const existingPositions = this.getActiveResources().map(r => r.position);
    
    const position = this.randomPosition(existingPositions);
    const type = this.randomType();
    const value = this.randomValue();

    return this.createResource(type, position, value);
  }

  spawnInitialResources(count = 5) {
    for (let i = 0; i < count; i++) {
      this.spawnRandomResource();
    }
    return this.getActiveResources();
  }

  captureResource(resourceId, playerId, captureProgress = 1) {
    const resource = this.resources.get(resourceId);
    if (!resource || !resource.isActive) return null;

    resource.captureTime = (resource.captureTime || 0) + captureProgress;
    
    if (resource.captureTime >= 100) {
      resource.capturedBy = playerId;
      resource.capturedAt = Date.now();
      resource.isActive = false;
      
      if (resource.duration) {
        resource.respawnAt = Date.now() + resource.duration;
      }

      return {
        ...resource,
        captureCompleted: true
      };
    }

    return {
      ...resource,
      captureCompleted: false
    };
  }

  releaseResource(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) return null;
    
    resource.captureTime = 0;
    resource.capturedBy = null;
    
    return resource;
  }

  respawnResource(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) return null;

    const existingPositions = this.getActiveResources().map(r => r.position);
    resource.position = this.randomPosition(existingPositions);
    resource.type = this.randomType();
    resource.value = this.randomValue();
    resource.isActive = true;
    resource.capturedBy = null;
    resource.capturedAt = null;
    resource.captureTime = 0;
    resource.createdAt = Date.now();
    resource.respawnAt = null;

    return resource;
  }

  checkRespawns() {
    const now = Date.now();
    const respawned = [];
    const toRemove = [];

    this.resources.forEach(resource => {
      if (!resource.isActive) {
        if (resource.respawnAt && now >= resource.respawnAt) {
          this.respawnResource(resource.id);
          respawned.push(resource);
        } else if (!resource.respawnAt && now - resource.capturedAt > 60000) {
          toRemove.push(resource.id);
        }
      }
    });

    toRemove.forEach(id => this.resources.delete(id));

    return respawned;
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this.checkRespawns();
      
      const activeCount = this.getActiveResources().length;
      if (activeCount < this.config.maxResources) {
        this.spawnRandomResource();
      }
    }, this.config.refreshInterval);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getResource(resourceId) {
    return this.resources.get(resourceId) || null;
  }

  getActiveResources() {
    return Array.from(this.resources.values()).filter(r => r.isActive);
  }

  getAllResources() {
    return Array.from(this.resources.values());
  }

  getResourcesByType(type) {
    return this.getActiveResources().filter(r => r.type === type);
  }

  getResourcesByPlayer(playerId) {
    return Array.from(this.resources.values()).filter(r => r.capturedBy === playerId);
  }

  removeResource(resourceId) {
    return this.resources.delete(resourceId);
  }

  clearAll() {
    this.resources.clear();
  }

  getStats() {
    const active = this.getActiveResources();
    const byType = {};
    
    this.config.types.forEach(type => {
      byType[type] = active.filter(r => r.type === type).length;
    });

    return {
      total: this.resources.size,
      active: active.length,
      captured: this.resources.size - active.length,
      byType
    };
  }
}

module.exports = ResourceManager;
