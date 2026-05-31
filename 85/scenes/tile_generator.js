const fs = require('fs');
const path = require('path');

class TileGenerator {
  constructor() {
    this.sceneConfig = this.loadConfig('scene_config.json');
    this.tileTypes = this.sceneConfig.tile_types;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  createTile(type, x, y) {
    const template = this.tileTypes[type] || this.tileTypes.ground;
    return {
      id: `tile_${x}_${y}`,
      x,
      y,
      type,
      name: template.name,
      passable: template.passable,
      cover: template.cover,
      stealth_bonus: template.stealth_bonus,
      base_danger: template.danger_level,
      current_danger: template.danger_level,
      items: [],
      explored: false,
      visible: false,
      has_patrol: false,
      patrol_unit: null,
      environment_effects: []
    };
  }

  generateTileType(rand = Math.random) {
    const genConfig = this.sceneConfig.generation;
    const r = rand();

    if (r < genConfig.wall_density) return 'wall';
    if (r < genConfig.wall_density + genConfig.building_density) return 'abandoned_building';
    if (r < genConfig.wall_density + genConfig.building_density + genConfig.trap_density) return 'trap';
    if (r < genConfig.wall_density + genConfig.building_density + genConfig.trap_density + genConfig.radiation_density) return 'radiation_zone';
    if (r < genConfig.wall_density + genConfig.building_density + genConfig.trap_density + genConfig.radiation_density + genConfig.rubble_density) return 'rubble';
    return 'ground';
  }

  getTileAt(map, x, y) {
    if (x < 0 || y < 0 || x >= map[0].length || y >= map.length) return null;
    return map[y][x];
  }

  updateTileDanger(tile, additionalDanger = 0) {
    tile.current_danger = Math.min(100, Math.max(0, tile.base_danger + additionalDanger));
    return tile;
  }

  addEnvironmentEffect(tile, effectType, duration, intensity = 1) {
    tile.environment_effects.push({
      type: effectType,
      duration,
      intensity,
      startTime: Date.now()
    });
    return tile;
  }
}

module.exports = TileGenerator;
