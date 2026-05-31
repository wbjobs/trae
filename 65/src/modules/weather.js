const { v4: uuidv4 } = require('uuid');

class WeatherSystem {
  constructor(coordinateSystem, config = {}) {
    this.coordSystem = coordinateSystem;
    this.weatherZones = new Map();
    this.activeEffects = new Map();
    this.config = {
      updateInterval: config.updateInterval || 5000,
      maxZones: config.maxZones || 5,
      spawnChance: config.spawnChance || 0.3,
      duration: config.duration || { min: 30000, max: 120000 },
      weatherTypes: config.weatherTypes || ['clear', 'cloud', 'rain', 'storm', 'turbulence', 'fog']
    };
    this.updateTimer = null;
  }

  createWeatherZone(type, center, radius, intensity = 0.5, duration = 60000) {
    const id = uuidv4();
    const zone = {
      id,
      type,
      center: this.coordSystem.createPoint(center.x, center.y, center.altitude),
      radius,
      intensity,
      createdAt: Date.now(),
      expiresAt: Date.now() + duration,
      affectedEntities: new Set()
    };
    this.weatherZones.set(id, zone);
    return zone;
  }

  getWeatherEffects(position) {
    const effects = [];
    this.weatherZones.forEach(zone => {
      if (Date.now() > zone.expiresAt) {
        this.weatherZones.delete(zone.id);
        return;
      }
      const distance = this.coordSystem.distance2D(position, zone.center);
      if (distance <= zone.radius) {
        const distanceFactor = 1 - (distance / zone.radius);
        const effectIntensity = zone.intensity * distanceFactor;
        effects.push({
          zoneId: zone.id,
          type: zone.type,
          intensity: effectIntensity,
          ...this.getWeatherEffectDetails(zone.type, effectIntensity)
        });
      }
    });
    return effects;
  }

  getWeatherEffectDetails(type, intensity) {
    const effects = {
      clear: { speedModifier: 1, visibilityModifier: 1, accuracyModifier: 1, turbulence: 0 },
      cloud: { speedModifier: 0.9, visibilityModifier: 0.8, accuracyModifier: 0.9, turbulence: 0.1 },
      rain: { speedModifier: 0.8, visibilityModifier: 0.6, accuracyModifier: 0.75, turbulence: 0.3 },
      storm: { speedModifier: 0.6, visibilityModifier: 0.4, accuracyModifier: 0.5, turbulence: 0.7 },
      turbulence: { speedModifier: 0.7, visibilityModifier: 0.9, accuracyModifier: 0.6, turbulence: 0.9 },
      fog: { speedModifier: 0.85, visibilityModifier: 0.3, accuracyModifier: 0.8, turbulence: 0.2 }
    };
    const base = effects[type] || effects.clear;
    return {
      speedModifier: 1 - (1 - base.speedModifier) * intensity,
      visibilityModifier: 1 - (1 - base.visibilityModifier) * intensity,
      accuracyModifier: 1 - (1 - base.accuracyModifier) * intensity,
      turbulence: base.turbulence * intensity
    };
  }

  applyWeatherToAircraft(aircraft, deltaTime) {
    const effects = this.getWeatherEffects(aircraft.position);
    if (effects.length === 0) {
      aircraft.weatherEffects = [];
      return;
    }
    aircraft.weatherEffects = effects;
    const combinedEffect = effects.reduce((acc, e) => ({
      speedModifier: acc.speedModifier * e.speedModifier,
      visibilityModifier: acc.visibilityModifier * e.visibilityModifier,
      accuracyModifier: acc.accuracyModifier * e.accuracyModifier,
      turbulence: Math.min(1, acc.turbulence + e.turbulence)
    }), { speedModifier: 1, visibilityModifier: 1, accuracyModifier: 1, turbulence: 0 });
    aircraft.currentSpeedModifier = combinedEffect;
    if (combinedEffect.turbulence > 0.5 && Math.random() < combinedEffect.turbulence * 0.1 * deltaTime / 1000) {
      const damage = Math.floor(combinedEffect.turbulence * 10 * Math.random());
      if (damage > 0) {
        aircraft.takeDamage(damage);
        return { damaged: true, damage };
      }
    }
    return { damaged: false };
  }

  spawnRandomWeatherZone(bounds) {
    if (this.weatherZones.size >= this.config.maxZones) return null;
    if (Math.random() > this.config.spawnChance) return null;
    const type = this.config.weatherTypes[Math.floor(Math.random() * (this.config.weatherTypes.length - 1)) + 1];
    const center = {
      x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
      y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
      altitude: bounds.minAlt + Math.random() * (bounds.maxAlt - bounds.minAlt)
    };
    const radius = 100 + Math.random() * 400;
    const intensity = 0.3 + Math.random() * 0.5;
    const duration = this.config.duration.min + Math.random() * (this.config.duration.max - this.config.duration.min);
    return this.createWeatherZone(type, center, radius, intensity, duration);
  }

  updateWeatherZones() {
    const now = Date.now();
    const expired = [];
    this.weatherZones.forEach(zone => {
      if (now > zone.expiresAt) {
        expired.push(zone.id);
      }
    });
    expired.forEach(id => this.weatherZones.delete(id));
    return expired.length;
  }

  startAutoUpdate(bounds) {
    this.stopAutoUpdate();
    this.updateTimer = setInterval(() => {
      this.updateWeatherZones();
      this.spawnRandomWeatherZone(bounds);
    }, this.config.updateInterval);
  }

  stopAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  getWeatherZones() {
    return Array.from(this.weatherZones.values());
  }

  clearAll() {
    this.weatherZones.clear();
    this.activeEffects.clear();
  }

  getActiveWeatherSummary() {
    return this.getWeatherZones().map(zone => ({
      id: zone.id,
      type: zone.type,
      center: zone.center,
      radius: zone.radius,
      intensity: zone.intensity,
      timeRemaining: Math.max(0, zone.expiresAt - Date.now())
    }));
  }
}

module.exports = WeatherSystem;
