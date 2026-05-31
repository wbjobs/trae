const fs = require('fs');
const path = require('path');
const TileGenerator = require('./tile_generator');

class MapGenerator {
  constructor() {
    this.tileGenerator = new TileGenerator();
    this.sceneConfig = this.tileGenerator.sceneConfig;
  }

  generateMap(seed = Date.now()) {
    const width = this.sceneConfig.generation.width;
    const height = this.sceneConfig.generation.height;
    
    const map = [];
    let rand = this.seededRandom(seed);

    for (let y = 0; y < height; y++) {
      map[y] = [];
      for (let x = 0; x < width; x++) {
        if (this.isBorder(x, y, width, height)) {
          map[y][x] = this.tileGenerator.createTile('wall', x, y);
        } else {
          const type = this.tileGenerator.generateTileType(rand);
          map[y][x] = this.tileGenerator.createTile(type, x, y);
        }
      }
    }

    this.ensurePassablePaths(map);
    this.addSpawnPoints(map);
    
    return {
      width,
      height,
      tiles: map,
      seed,
      spawnPoints: this.getSpawnPoints(map),
      generatedAt: Date.now()
    };
  }

  seededRandom(seed) {
    let s = seed;
    return function() {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  }

  isBorder(x, y, width, height) {
    return x === 0 || y === 0 || x === width - 1 || y === height - 1;
  }

  ensurePassablePaths(map) {
    const width = map[0].length;
    const height = map.length;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!map[y][x].passable) {
          const neighbors = this.getPassableNeighbors(map, x, y);
          if (neighbors.length >= 3) {
            map[y][x] = this.tileGenerator.createTile('ground', x, y);
          }
        }
      }
    }
  }

  getPassableNeighbors(map, x, y) {
    const neighbors = [];
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    
    for (const [dx, dy] of directions) {
      const tile = this.tileGenerator.getTileAt(map, x + dx, y + dy);
      if (tile && tile.passable) {
        neighbors.push(tile);
      }
    }
    return neighbors;
  }

  addSpawnPoints(map) {
    const safeZones = this.findSafeZones(map);
    for (const zone of safeZones) {
      zone.is_spawn = true;
    }
  }

  findSafeZones(map, count = 4) {
    const safeZones = [];
    const width = map[0].length;
    const height = map.length;

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      while (attempts < 100 && safeZones.length < count) {
        const x = Math.floor(Math.random() * (width - 4)) + 2;
        const y = Math.floor(Math.random() * (height - 4)) + 2;
        
        if (this.isSafeSpawnArea(map, x, y)) {
          safeZones.push(map[y][x]);
          break;
        }
        attempts++;
      }
    }
    return safeZones;
  }

  isSafeSpawnArea(map, x, y, radius = 2) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = this.tileGenerator.getTileAt(map, x + dx, y + dy);
        if (!tile || !tile.passable || tile.base_danger > 10) {
          return false;
        }
      }
    }
    return true;
  }

  getSpawnPoints(map) {
    const spawns = [];
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        if (map[y][x].is_spawn) {
          spawns.push({ x, y });
        }
      }
    }
    return spawns;
  }

  getMapSubset(map, centerX, centerY, radius) {
    const subset = [];
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const tile = this.tileGenerator.getTileAt(map, x, y);
        if (tile) {
          subset.push({
            x,
            y,
            type: tile.type,
            passable: tile.passable,
            visible: tile.visible,
            explored: tile.explored
          });
        }
      }
    }
    return subset;
  }
}

module.exports = MapGenerator;
