const fs = require('fs');
const path = require('path');

class DynamicEnvironment {
  constructor() {
    this.dangerConfig = this.loadConfig('danger_config.json');
    this.gameConfig = this.loadConfig('game_config.json');
    this.environmentalEffects = {};
    this.activeEvents = [];
    this.eventTypes = [
      'toxic_gas_spread',
      'building_collapse',
      'fog_roll_in',
      'radiation_surge',
      'patrol_route_change',
      'power_surge'
    ];
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  initialize(map) {
    this.environmentalEffects = {
      time_of_day: 'day',
      weather: 'clear',
      visibility: 1.0,
      wind: 0
    };
    this.activeEvents = [];
    return this.environmentalEffects;
  }

  triggerRandomEvent(map, players) {
    if (this.activeEvents.length >= 3) return null;
    
    const eventType = this.eventTypes[Math.floor(Math.random() * this.eventTypes.length)];
    const event = this.createEvent(eventType, map, players);
    
    if (event) {
      this.activeEvents.push(event);
      this.applyEventEffect(map, event);
    }
    
    return event;
  }

  createEvent(eventType, map, players) {
    if (!map || map.length === 0 || !map[0]) {
      return null;
    }
    const centerX = Math.floor(Math.random() * map[0].length);
    const centerY = Math.floor(Math.random() * map.length);
    const radius = Math.floor(Math.random() * 5) + 3;
    
    const event = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      centerX,
      centerY,
      radius,
      startTime: Date.now(),
      duration: (Math.floor(Math.random() * 30) + 15) * 1000,
      intensity: Math.random() * 0.5 + 0.5,
      affectedTiles: []
    };

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius) {
          const x = centerX + dx;
          const y = centerY + dy;
          if (x >= 0 && y >= 0 && x < map[0].length && y < map.length) {
            event.affectedTiles.push({ x, y, distance });
          }
        }
      }
    }

    return event;
  }

  applyEventEffect(map, event) {
    if (!map || !event || !event.affectedTiles) return map;
    
    for (const tilePos of event.affectedTiles) {
      if (!map[tilePos.y] || !map[tilePos.y][tilePos.x]) continue;
      const tile = map[tilePos.y][tilePos.x];
      const intensity = event.intensity * (1 - tilePos.distance / event.radius);
      
      switch (event.type) {
        case 'toxic_gas_spread':
          this.applyToxicGas(tile, intensity);
          break;
        case 'building_collapse':
          this.applyCollapse(map, tile, intensity, event);
          break;
        case 'fog_roll_in':
          this.applyFog(tile, intensity);
          break;
        case 'radiation_surge':
          this.applyRadiationSurge(tile, intensity);
          break;
        case 'patrol_route_change':
          tile.patrol_route_changed = true;
          break;
        case 'power_surge':
          tile.powered = true;
          break;
      }
    }
    
    return map;
  }

  applyToxicGas(tile, intensity) {
    if (!tile) return;
    if (!tile.environment_effects) {
      tile.environment_effects = [];
    }
    tile.environment_effects.push({
      type: 'toxic_gas',
      intensity,
      startTime: Date.now(),
      duration: 30000
    });
  }

  applyCollapse(map, tile, intensity, event) {
    if (!tile || !map || !map[tile.y] || !map[tile.y][tile.x]) return;
    
    if (tile.type === 'abandoned_building' && Math.random() < intensity * 0.3) {
      const newTile = {
        ...tile,
        type: 'rubble',
        name: '坍塌废墟',
        passable: true,
        cover: 50,
        base_danger: 20,
        current_danger: Math.max(tile.current_danger || 0, 20)
      };
      
      Object.assign(map[tile.y][tile.x], newTile);
      event.collapsed = true;
    }
  }

  applyFog(tile, intensity) {
    if (!tile) return;
    tile.fog_density = intensity;
    if (tile.type === 'ground') {
      tile.type = 'fog_zone';
      tile.stealth_bonus = 30 * intensity;
    }
  }

  applyRadiationSurge(tile, intensity) {
    if (!tile) return;
    tile.radiation_level = (tile.radiation_level || 0) + intensity * 30;
    if (tile.type === 'ground') {
      tile.type = 'radiation_zone';
      tile.base_danger = 30;
    }
  }

  updateEvents(map, deltaTime) {
    const expiredEvents = [];
    if (!map) return expiredEvents;
    
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const event = this.activeEvents[i];
      const elapsed = Date.now() - event.startTime;
      
      if (elapsed >= event.duration) {
        this.removeEventEffect(map, event);
        expiredEvents.push(event);
        this.activeEvents.splice(i, 1);
      }
    }
    
    return expiredEvents;
  }

  removeEventEffect(map, event) {
    if (!map || !event || !event.affectedTiles) return;
    
    for (const tilePos of event.affectedTiles) {
      if (!map[tilePos.y] || !map[tilePos.y][tilePos.x]) continue;
      const tile = map[tilePos.y][tilePos.x];
      
      if (tile.environment_effects) {
        tile.environment_effects = tile.environment_effects.filter(
          e => e.type !== 'toxic_gas'
        );
      }
      
      if (tile.fog_density !== undefined) {
        delete tile.fog_density;
        if (tile.type === 'fog_zone') {
          tile.type = 'ground';
          tile.stealth_bonus = 0;
        }
      }
      
      if (tile.patrol_route_changed) {
        delete tile.patrol_route_changed;
      }
      
      if (tile.powered) {
        delete tile.powered;
      }
    }
  }

  updateTimeOfDay() {
    const cycle = ['dawn', 'day', 'dusk', 'night'];
    const currentIndex = cycle.indexOf(this.environmentalEffects.time_of_day);
    const nextIndex = (currentIndex + 1) % cycle.length;
    this.environmentalEffects.time_of_day = cycle[nextIndex];
    
    switch (this.environmentalEffects.time_of_day) {
      case 'night':
        this.environmentalEffects.visibility = 0.5;
        break;
      case 'dawn':
      case 'dusk':
        this.environmentalEffects.visibility = 0.7;
        break;
      default:
        this.environmentalEffects.visibility = 1.0;
    }
    
    return this.environmentalEffects;
  }

  changeWeather() {
    const weathers = ['clear', 'cloudy', 'rain', 'fog'];
    this.environmentalEffects.weather = weathers[Math.floor(Math.random() * weathers.length)];
    
    switch (this.environmentalEffects.weather) {
      case 'rain':
        this.environmentalEffects.wind = 0.5;
        break;
      case 'fog':
        this.environmentalEffects.visibility = Math.max(0.3, this.environmentalEffects.visibility - 0.3);
        break;
      default:
        this.environmentalEffects.wind = 0;
    }
    
    return this.environmentalEffects;
  }

  getModifiedPlayerStealth(player, baseStealth) {
    let modified = baseStealth;
    
    if (this.environmentalEffects.time_of_day === 'night') {
      modified += 15;
    }
    if (this.environmentalEffects.weather === 'rain') {
      modified += 10;
    }
    if (this.environmentalEffects.weather === 'fog') {
      modified += 20;
    }
    
    return Math.min(100, modified);
  }

  getModifiedEnemyDetection(baseDetection) {
    let modified = baseDetection;
    
    if (this.environmentalEffects.time_of_day === 'night') {
      modified *= 0.7;
    }
    if (this.environmentalEffects.weather === 'fog') {
      modified *= 0.5;
    }
    if (this.environmentalEffects.weather === 'rain') {
      modified *= 0.8;
    }
    if (this.environmentalEffects.visibility < 1) {
      modified *= this.environmentalEffects.visibility;
    }
    
    return modified;
  }

  getEnvironmentStatus() {
    return {
      ...this.environmentalEffects,
      active_events: this.activeEvents.map(e => ({
        id: e.id,
        type: e.type,
        radius: e.radius,
        remaining: Math.max(0, e.duration - (Date.now() - e.startTime))
      }))
    };
  }
}

module.exports = DynamicEnvironment;
