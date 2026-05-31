const fs = require('fs');
const path = require('path');

class DangerCalculator {
  constructor() {
    this.dangerConfig = this.loadConfig('danger_config.json');
    this.dangerSources = this.dangerConfig.danger_sources;
    this.dangerLevels = this.dangerConfig.danger_levels;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  calculateTileDanger(tile, enemies = [], environmentalEffects = {}) {
    let totalDanger = tile.base_danger;
    
    totalDanger += this.calculateEnemyDanger(tile, enemies);
    
    totalDanger += this.calculateEnvironmentalDanger(tile, environmentalEffects);
    
    totalDanger += this.calculateTrapDanger(tile);
    
    return Math.min(100, Math.max(0, totalDanger));
  }

  calculateEnemyDanger(tile, enemies) {
    let danger = 0;
    for (const enemy of enemies) {
      const distance = Math.sqrt(
        Math.pow(tile.x - enemy.x, 2) + Math.pow(tile.y - enemy.y, 2)
      );
      if (distance < enemy.detection_range) {
        const proximityFactor = 1 - (distance / enemy.detection_range);
        danger += (enemy.threat_level || 30) * proximityFactor;
      }
    }
    return danger;
  }

  calculateEnvironmentalDanger(tile, effects) {
    let danger = 0;
    for (const [effectType, intensity] of Object.entries(effects)) {
      const modifier = this.dangerConfig.environmental_modifiers[effectType] || 1;
      danger += tile.base_danger * (modifier - 1) * intensity;
    }
    
    if (tile.type === 'radiation_zone') {
      danger += this.dangerSources.radiation.damage_per_tick * 5;
    }
    if (tile.type === 'trap') {
      danger += this.dangerSources.trap.base_damage * 0.5;
    }
    
    return danger;
  }

  calculateTrapDanger(tile) {
    if (tile.type !== 'trap' || tile.trap_disabled) return 0;
    return this.dangerSources.trap.base_damage * this.dangerSources.trap.trigger_chance;
  }

  getDangerLevel(dangerValue) {
    for (const [level, config] of Object.entries(this.dangerLevels)) {
      if (dangerValue >= config.min && dangerValue <= config.max) {
        return { level, description: config.description };
      }
    }
    return { level: 'lethal', description: '致命区域' };
  }

  calculatePlayerThreat(player, map, enemies) {
    const tile = map[player.y][player.x];
    let threat = 0;
    
    for (const enemy of enemies) {
      const distance = Math.sqrt(
        Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2)
      );
      if (distance < enemy.detection_range) {
        const lineOfSight = this.hasLineOfSight(map, player.x, player.y, enemy.x, enemy.y);
        if (lineOfSight) {
          const proximityFactor = 1 - (distance / enemy.detection_range);
          threat += (enemy.threat_level || 30) * proximityFactor;
        }
      }
    }
    
    threat += tile.current_danger;
    
    return Math.min(100, threat);
  }

  hasLineOfSight(map, x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (x !== x2 || y !== y2) {
      if (map[y][x].type === 'wall') {
        return false;
      }
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return true;
  }

  applyEnvironmentalDamage(player, map) {
    const tile = map[player.y][player.x];
    let damage = 0;
    let sources = [];
    
    if (tile.type === 'radiation_zone') {
      const resist = player.radiation_resist || 0;
      const radDamage = this.dangerSources.radiation.damage_per_tick * (1 - resist / 100);
      damage += radDamage;
      sources.push('radiation');
    }
    
    if (tile.type === 'trap' && !tile.trap_disabled && !tile.trap_triggered) {
      if (Math.random() < this.dangerSources.trap.trigger_chance) {
        damage += this.dangerSources.trap.base_damage;
        tile.trap_triggered = true;
        sources.push('trap');
      }
    }
    
    for (const effect of tile.environment_effects) {
      if (effect.type === 'toxic_gas') {
        const resist = player.gas_resist || 0;
        damage += this.dangerSources.toxic_gas.damage_per_tick * effect.intensity * (1 - resist / 100);
        sources.push('toxic_gas');
      }
    }
    
    if (damage > 0) {
      player.health = Math.max(0, player.health - damage);
    }
    
    return { damage, sources, player };
  }

  updateMapDangerLevels(map, enemies, environmentalEffects) {
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        map[y][x].current_danger = this.calculateTileDanger(
          map[y][x], enemies, environmentalEffects
        );
      }
    }
    return map;
  }

  getSafeDirections(map, playerX, playerY) {
    const directions = [
      { dx: 0, dy: -1, name: 'up' },
      { dx: 0, dy: 1, name: 'down' },
      { dx: -1, dy: 0, name: 'left' },
      { dx: 1, dy: 0, name: 'right' }
    ];
    
    return directions.map(dir => {
      const x = playerX + dir.dx;
      const y = playerY + dir.dy;
      const tile = map[y]?.[x];
      if (!tile || !tile.passable) {
        return { ...dir, safe: false, danger: 100 };
      }
      return {
        ...dir,
        safe: tile.current_danger < 30,
        danger: tile.current_danger,
        dangerLevel: this.getDangerLevel(tile.current_danger)
      };
    });
  }
}

module.exports = DangerCalculator;
