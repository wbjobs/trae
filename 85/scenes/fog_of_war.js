const fs = require('fs');
const path = require('path');

class FogOfWar {
  constructor() {
    this.gameConfig = this.loadConfig('game_config.json');
    this.viewRadius = this.gameConfig.fog_of_war_radius;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  updateVisibility(map, players, enemies = []) {
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        map[y][x].visible = false;
      }
    }

    for (const player of players) {
      this.revealArea(map, player.x, player.y, this.viewRadius + (player.view_bonus || 0));
    }

    return map;
  }

  revealArea(map, centerX, centerY, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius) {
          const x = centerX + dx;
          const y = centerY + dy;
          if (x >= 0 && y >= 0 && x < map[0].length && y < map.length) {
            if (!this.hasLineOfSight(map, centerX, centerY, x, y)) continue;
            
            const visibility = Math.max(0.3, 1 - (distance / radius));
            map[y][x].visible = true;
            map[y][x].explored = true;
            map[y][x].visibility_level = visibility;
          }
        }
      }
    }
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

  getPlayerVisibleTiles(map, player) {
    const visible = [];
    const radius = this.viewRadius + (player.view_bonus || 0);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius) {
          const x = player.x + dx;
          const y = player.y + dy;
          if (x >= 0 && y >= 0 && x < map[0].length && y < map.length) {
            if (this.hasLineOfSight(map, player.x, player.y, x, y)) {
              visible.push({
                x,
                y,
                tile: map[y][x],
                visibility: Math.max(0.3, 1 - (distance / radius))
              });
            }
          }
        }
      }
    }
    return visible;
  }

  isPlayerVisibleToEnemy(map, player, enemy, enemyViewRange) {
    const distance = Math.sqrt(
      Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2)
    );
    
    if (distance > enemyViewRange) return false;
    
    if (!this.hasLineOfSight(map, enemy.x, enemy.y, player.x, player.y)) return false;

    const tile = map[player.y][player.x];
    const stealthBonus = tile.stealth_bonus + (player.stealth_gear || 0);
    const effectiveStealth = player.current_stealth + stealthBonus;
    const detectionChance = (distance / enemyViewRange) * (100 - effectiveStealth) / 100;

    return Math.random() < detectionChance;
  }

  applyFogToMapData(mapData, playerPosition) {
    return mapData.map(row => 
      row.map(tile => {
        const distance = Math.sqrt(
          Math.pow(tile.x - playerPosition.x, 2) + 
          Math.pow(tile.y - playerPosition.y, 2)
        );
        
        if (distance > this.viewRadius) {
          return {
            ...tile,
            visible: false,
            items: [],
            patrol_unit: null
          };
        }
        return tile;
      })
    );
  }
}

module.exports = FogOfWar;
