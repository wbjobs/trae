const fs = require('fs');
const path = require('path');

class StealthDetector {
  constructor() {
    this.stealthConfig = this.loadConfig('stealth_config.json');
    this.mechanics = this.stealthConfig.stealth_mechanics;
    this.actions = this.stealthConfig.player_actions;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  calculateStealthLevel(player, currentTile) {
    if (!player) return 0;
    
    let stealth = this.mechanics.base_stealth || 50;
    
    const actionModifier = this.actions[player.posture] || this.actions.stand || { stealth_modifier: 0 };
    stealth += actionModifier.stealth_modifier || 0;
    
    stealth += (currentTile && currentTile.stealth_bonus) || 0;
    
    stealth += player.stealth_gear || 0;
    
    if (player.is_moving) {
      const noisePenalty = this.mechanics.noise_penalty[player.movement_type] || 0;
      stealth -= noisePenalty;
      stealth -= this.mechanics.movement_penalty_per_tile || 0;
    }
    
    stealth -= player.noise_level || 0;
    
    return Math.max(0, Math.min(100, stealth));
  }

  isPlayerDetected(player, enemy, map, currentTile) {
    if (!player || !enemy || !map) return false;
    
    const distance = this.getDistance(player, enemy);
    const detectionRange = enemy.detection_range || 5;
    
    if (distance > detectionRange) return false;
    
    if (!this.hasLineOfSight(map, player.x, player.y, enemy.x, enemy.y)) return false;
    
    const playerStealth = this.calculateStealthLevel(player, currentTile);
    const coverBonus = this.calculateCoverBonus(player, map);
    
    const baseDetection = enemy.awareness || 0;
    const distanceFactor = detectionRange > 0 ? (1 - distance / detectionRange) * 50 : 0;
    const stealthFactor = Math.max(0, (100 - playerStealth) / 100);
    const coverFactor = Math.max(0, 1 - (coverBonus / 100));
    
    const detectionChance = Math.max(0, Math.min(1, (baseDetection + distanceFactor) * stealthFactor * coverFactor / 100));
    
    if (isNaN(detectionChance)) return false;
    
    return Math.random() < detectionChance;
  }

  calculateCoverBonus(player, map) {
    if (!player || !map || map.length === 0 || !map[0]) return 0;
    
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    let totalCover = 0;
    let counted = 0;
    
    for (const [dx, dy] of directions) {
      const x = player.x + dx;
      const y = player.y + dy;
      if (x >= 0 && y >= 0 && x < map[0].length && y < map.length) {
        const tile = map[y][x];
        if (tile && tile.cover !== undefined) {
          totalCover += tile.cover;
          counted++;
        }
      }
    }
    
    return counted > 0 ? totalCover / counted : 0;
  }

  getDistance(a, b) {
    if (!a || !b || a.x === undefined || b.x === undefined) {
      return Infinity;
    }
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  hasLineOfSight(map, x1, y1, x2, y2) {
    if (!map || map.length === 0 || !map[0]) return false;
    
    const width = map[0].length;
    const height = map.length;
    
    if (x1 < 0 || x1 >= width || y1 < 0 || y1 >= height) return false;
    if (x2 < 0 || x2 >= width || y2 < 0 || y2 >= height) return false;
    
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (x !== x2 || y !== y2) {
      const tile = map[y] && map[y][x];
      if (!tile || tile.type === 'wall') {
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

  updateEnemyAwareness(enemy, playerDetected) {
    if (playerDetected) {
      enemy.awareness = Math.min(100, enemy.awareness + 20);
      if (enemy.awareness >= this.stealthConfig.enemy_awareness_levels.combat) {
        enemy.state = 'combat';
      } else if (enemy.awareness >= this.stealthConfig.enemy_awareness_levels.alert) {
        enemy.state = 'alert';
      } else if (enemy.awareness >= this.stealthConfig.enemy_awareness_levels.suspicious) {
        enemy.state = 'suspicious';
      }
    } else {
      enemy.awareness = Math.max(0, enemy.awareness - 2);
      if (enemy.awareness < this.stealthConfig.enemy_awareness_levels.suspicious) {
        enemy.state = 'unaware';
      }
    }
    return enemy;
  }

  canMoveToPosition(map, x, y, player) {
    if (x < 0 || y < 0 || x >= map[0].length || y >= map.length) return false;
    
    const tile = map[y][x];
    if (!tile.passable) return false;
    
    const actionModifier = this.actions[player.posture] || this.actions.stand;
    const moveChance = actionModifier.movement_speed;
    
    return Math.random() < moveChance;
  }

  calculateMovementNoise(player) {
    if (!player) return 0;
    
    const baseNoise = this.mechanics.noise_penalty[player.movement_type] || 5;
    const postureModifier = (this.actions[player.posture] && this.actions[player.posture].stealth_modifier) || 0;
    return Math.max(0, baseNoise - postureModifier * 0.5);
  }

  getDetectionLevel(player, enemy, map) {
    if (!player || !enemy || !map || player.y === undefined || player.x === undefined) {
      return 'hidden';
    }
    
    const distance = this.getDistance(player, enemy);
    const detectionRange = enemy.detection_range || 5;
    
    const currentTile = map[player.y] && map[player.y][player.x];
    const playerStealth = this.calculateStealthLevel(player, currentTile);
    const cover = this.calculateCoverBonus(player, map);
    
    const distanceFactor = detectionRange > 0 ? (1 - distance / detectionRange) * 50 : 0;
    const awareness = enemy.awareness || 0;
    const stealthFactor = Math.max(0, (100 - playerStealth) / 100);
    const coverFactor = Math.max(0, 1 - (cover / 100));
    
    const detection = (awareness + distanceFactor) * stealthFactor * coverFactor;
    
    if (isNaN(detection)) return 'hidden';
    
    if (detection < 20) return 'hidden';
    if (detection < 50) return 'partially_hidden';
    if (detection < 80) return 'exposed';
    return 'detected';
  }
}

module.exports = StealthDetector;
