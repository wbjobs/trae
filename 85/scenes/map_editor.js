const fs = require('fs');
const path = require('path');

class MapEditor {
  constructor(width = 50, height = 50) {
    this.width = width;
    this.height = height;
    this.currentMap = null;
    this.history = [];
    this.historyIndex = -1;
    this.maxHistorySize = 50;
    this.selection = null;
    this.clipboard = null;
    this.brushSize = 1;
    this.currentTileType = 'ground';
    this.customTiles = {};
    this.mapTemplates = [];

    this.sceneConfig = this.loadConfig('scene_config.json');
    this.tileTypes = this.sceneConfig.tile_types;
    
    this.createNewMap(width, height);
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  createNewMap(width = 50, height = 50, defaultType = 'ground') {
    const map = {
      width,
      height,
      tiles: [],
      seed: Date.now(),
      spawnPoints: [],
      customData: {},
      createdAt: Date.now(),
      modifiedAt: Date.now()
    };

    for (let y = 0; y < height; y++) {
      map.tiles[y] = [];
      for (let x = 0; x < width; x++) {
        map.tiles[y][x] = this.createTile(defaultType, x, y);
      }
    }

    this.currentMap = map;
    this.saveHistory();
    return map;
  }

  createTile(type, x, y) {
    const template = this.tileTypes[type] || this.customTiles[type] || this.tileTypes.ground;
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
      environment_effects: [],
      is_spawn: false,
      custom: {}
    };
  }

  setTile(x, y, type) {
    if (!this.currentMap) return false;
    if (x < 0 || y < 0 || x >= this.currentMap.width || y >= this.currentMap.height) return false;

    const oldTile = this.currentMap.tiles[y][x];
    const newTile = this.createTile(type, x, y);

    newTile.items = oldTile.items;
    newTile.explored = oldTile.explored;
    newTile.is_spawn = oldTile.is_spawn;
    newTile.custom = { ...oldTile.custom };

    this.currentMap.tiles[y][x] = newTile;
    this.currentMap.modifiedAt = Date.now();

    this.saveHistory();
    return true;
  }

  fillArea(startX, startY, endX, endY, type) {
    if (!this.currentMap) return false;

    const minX = Math.max(0, Math.min(startX, endX));
    const maxX = Math.min(this.currentMap.width - 1, Math.max(startX, endX));
    const minY = Math.max(0, Math.min(startY, endY));
    const maxY = Math.min(this.currentMap.height - 1, Math.max(startY, endY));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        this.setTile(x, y, type);
      }
    }

    return true;
  }

  paintTile(x, y, type) {
    if (!this.currentMap) return false;

    const radius = Math.floor(this.brushSize / 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          this.setTile(x + dx, y + dy, type);
        }
      }
    }
    return true;
  }

  selectArea(startX, startY, endX, endY) {
    if (!this.currentMap) return null;

    const minX = Math.max(0, Math.min(startX, endX));
    const maxX = Math.min(this.currentMap.width - 1, Math.max(startX, endX));
    const minY = Math.max(0, Math.min(startY, endY));
    const maxY = Math.min(this.currentMap.height - 1, Math.max(startY, endY));

    this.selection = { minX, maxX, minY, maxY };
    return this.selection;
  }

  copySelection() {
    if (!this.currentMap || !this.selection) return null;

    const { minX, maxX, minY, maxY } = this.selection;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    this.clipboard = {
      width,
      height,
      tiles: []
    };

    for (let y = 0; y < height; y++) {
      this.clipboard.tiles[y] = [];
      for (let x = 0; x < width; x++) {
        const tile = this.currentMap.tiles[minY + y][minX + x];
        this.clipboard.tiles[y][x] = JSON.parse(JSON.stringify(tile));
      }
    }

    return this.clipboard;
  }

  cutSelection() {
    const copied = this.copySelection();
    if (copied && this.selection) {
      this.fillArea(
        this.selection.minX,
        this.selection.minY,
        this.selection.maxX,
        this.selection.maxY,
        'ground'
      );
    }
    return copied;
  }

  paste(x, y) {
    if (!this.currentMap || !this.clipboard) return false;

    for (let dy = 0; dy < this.clipboard.height; dy++) {
      for (let dx = 0; dx < this.clipboard.width; dx++) {
        const targetX = x + dx;
        const targetY = y + dy;

        if (targetX >= 0 && targetX < this.currentMap.width &&
            targetY >= 0 && targetY < this.currentMap.height) {
          const sourceTile = this.clipboard.tiles[dy][dx];
          this.currentMap.tiles[targetY][targetX] = {
            ...sourceTile,
            id: `tile_${targetX}_${targetY}`,
            x: targetX,
            y: targetY
          };
        }
      }
    }

    this.currentMap.modifiedAt = Date.now();
    this.saveHistory();
    return true;
  }

  addSpawnPoint(x, y) {
    if (!this.currentMap) return false;

    const tile = this.currentMap.tiles[y]?.[x];
    if (!tile || !tile.passable) return false;

    tile.is_spawn = true;
    if (!this.currentMap.spawnPoints.some(p => p.x === x && p.y === y)) {
      this.currentMap.spawnPoints.push({ x, y });
    }

    this.saveHistory();
    return true;
  }

  removeSpawnPoint(x, y) {
    if (!this.currentMap) return false;

    const tile = this.currentMap.tiles[y]?.[x];
    if (tile) {
      tile.is_spawn = false;
    }

    this.currentMap.spawnPoints = this.currentMap.spawnPoints.filter(
      p => !(p.x === x && p.y === y)
    );

    this.saveHistory();
    return true;
  }

  addCustomTileType(typeId, tileData) {
    this.customTiles[typeId] = {
      name: tileData.name || typeId,
      passable: tileData.passable !== undefined ? tileData.passable : true,
      cover: tileData.cover || 0,
      stealth_bonus: tileData.stealth_bonus || 0,
      danger_level: tileData.danger_level || 0,
      custom: tileData.custom || {}
    };
    return this.customTiles[typeId];
  }

  removeCustomTileType(typeId) {
    if (this.customTiles[typeId]) {
      delete this.customTiles[typeId];
      return true;
    }
    return false;
  }

  setTileCustomData(x, y, key, value) {
    if (!this.currentMap) return false;
    const tile = this.currentMap.tiles[y]?.[x];
    if (tile) {
      tile.custom[key] = value;
      return true;
    }
    return false;
  }

  getTileCustomData(x, y, key) {
    if (!this.currentMap) return null;
    const tile = this.currentMap.tiles[y]?.[x];
    return tile ? tile.custom[key] : null;
  }

  saveHistory() {
    if (!this.currentMap) return;

    const snapshot = JSON.parse(JSON.stringify(this.currentMap));

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex <= 0) return false;

    this.historyIndex--;
    this.currentMap = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    return true;
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return false;

    this.historyIndex++;
    this.currentMap = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    return true;
  }

  saveMap(filePath) {
    if (!this.currentMap) return false;

    const saveData = {
      ...this.currentMap,
      editorMetadata: {
        customTiles: this.customTiles,
        createdAt: this.currentMap.createdAt,
        modifiedAt: Date.now()
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    return true;
  }

  loadMap(filePath) {
    if (!fs.existsSync(filePath)) return false;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.currentMap = data;

      if (data.editorMetadata?.customTiles) {
        this.customTiles = { ...this.customTiles, ...data.editorMetadata.customTiles };
      }

      this.history = [];
      this.historyIndex = -1;
      this.saveHistory();

      return true;
    } catch (e) {
      console.error('Error loading map:', e);
      return false;
    }
  }

  exportToGameFormat() {
    if (!this.currentMap) return null;

    return {
      width: this.currentMap.width,
      height: this.currentMap.height,
      tiles: this.currentMap.tiles,
      seed: this.currentMap.seed,
      spawnPoints: this.currentMap.spawnPoints
    };
  }

  getTileInfo(x, y) {
    if (!this.currentMap) return null;
    const tile = this.currentMap.tiles[y]?.[x];
    if (!tile) return null;

    return {
      ...tile,
      tileType: this.tileTypes[tile.type] || this.customTiles[tile.type],
      itemCount: tile.items.length,
      neighbors: this.getNeighbors(x, y)
    };
  }

  getNeighbors(x, y) {
    if (!this.currentMap) return [];

    const directions = [
      { dx: 0, dy: -1, name: 'up' },
      { dx: 0, dy: 1, name: 'down' },
      { dx: -1, dy: 0, name: 'left' },
      { dx: 1, dy: 0, name: 'right' },
      { dx: -1, dy: -1, name: 'up-left' },
      { dx: 1, dy: -1, name: 'up-right' },
      { dx: -1, dy: 1, name: 'down-left' },
      { dx: 1, dy: 1, name: 'down-right' }
    ];

    return directions.map(({ dx, dy, name }) => {
      const nx = x + dx;
      const ny = y + dy;
      const tile = this.currentMap.tiles[ny]?.[nx];
      return {
        name,
        x: nx,
        y: ny,
        exists: !!tile,
        passable: tile?.passable || false,
        type: tile?.type || null
      };
    });
  }

  generatePreview() {
    if (!this.currentMap) return '';

    const symbols = {
      ground: '·',
      rubble: '▓',
      wall: '█',
      fog_zone: '░',
      trap: '⚠',
      abandoned_building: '🏚',
      radiation_zone: '☢'
    };

    let preview = '';
    for (let y = 0; y < this.currentMap.height; y++) {
      for (let x = 0; x < this.currentMap.width; x++) {
        const tile = this.currentMap.tiles[y][x];
        if (tile.is_spawn) {
          preview += '◆';
        } else {
          preview += symbols[tile.type] || '?';
        }
      }
      preview += '\n';
    }
    return preview;
  }

  validateMap() {
    if (!this.currentMap) return { valid: false, errors: ['No map loaded'] };

    const errors = [];
    const warnings = [];

    if (this.currentMap.spawnPoints.length === 0) {
      warnings.push('地图没有出生点');
    }

    if (this.currentMap.spawnPoints.length < 4) {
      warnings.push(`出生点数量较少 (${this.currentMap.spawnPoints.length})，建议至少4个`);
    }

    for (let y = 0; y < this.currentMap.height; y++) {
      for (let x = 0; x < this.currentMap.width; x++) {
        const tile = this.currentMap.tiles[y][x];
        if (!tile) {
          errors.push(`位置 (${x}, ${y}) 的地块为空`);
        }
      }
    }

    const hasPassablePath = this.checkConnectivity();
    if (!hasPassablePath) {
      warnings.push('地图可能存在不可到达的区域');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  checkConnectivity() {
    if (!this.currentMap || this.currentMap.spawnPoints.length === 0) return false;

    const visited = new Set();
    const queue = [this.currentMap.spawnPoints[0]];
    visited.add(`${queue[0].x},${queue[0].y}`);

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      const neighbors = this.getNeighbors(x, y);

      for (const neighbor of neighbors) {
        if (neighbor.exists && neighbor.passable) {
          const key = `${neighbor.x},${neighbor.y}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: neighbor.x, y: neighbor.y });
          }
        }
      }
    }

    let passableCount = 0;
    for (let y = 0; y < this.currentMap.height; y++) {
      for (let x = 0; x < this.currentMap.width; x++) {
        if (this.currentMap.tiles[y][x]?.passable) {
          passableCount++;
        }
      }
    }

    return visited.size >= passableCount * 0.8;
  }

  autoGenerateSpawnPoints(count = 4) {
    if (!this.currentMap) return [];

    const spawns = [];
    const attempts = count * 10;
    let found = 0;

    for (let i = 0; i < attempts && found < count; i++) {
      const x = Math.floor(Math.random() * this.currentMap.width);
      const y = Math.floor(Math.random() * this.currentMap.height);
      const tile = this.currentMap.tiles[y][x];

      if (tile && tile.passable && tile.base_danger < 10 && !tile.is_spawn) {
        const isSafe = this.isAreaSafe(x, y, 3);
        if (isSafe) {
          this.addSpawnPoint(x, y);
          spawns.push({ x, y });
          found++;
        }
      }
    }

    return spawns;
  }

  isAreaSafe(x, y, radius) {
    if (!this.currentMap) return false;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = this.currentMap.tiles[y + dy]?.[x + dx];
        if (!tile || !tile.passable || tile.base_danger > 20) {
          return false;
        }
      }
    }
    return true;
  }

  getAvailableTileTypes() {
    return [
      ...Object.entries(this.tileTypes).map(([id, data]) => ({
        id,
        ...data,
        isCustom: false
      })),
      ...Object.entries(this.customTiles).map(([id, data]) => ({
        id,
        ...data,
        isCustom: true
      }))
    ];
  }

  getMapStats() {
    if (!this.currentMap) return null;

    const stats = {
      totalTiles: this.currentMap.width * this.currentMap.height,
      byType: {},
      passable: 0,
      impassable: 0,
      spawnPoints: this.currentMap.spawnPoints.length,
      averageDanger: 0
    };

    let totalDanger = 0;
    let dangerCount = 0;

    for (let y = 0; y < this.currentMap.height; y++) {
      for (let x = 0; x < this.currentMap.width; x++) {
        const tile = this.currentMap.tiles[y][x];
        stats.byType[tile.type] = (stats.byType[tile.type] || 0) + 1;

        if (tile.passable) {
          stats.passable++;
        } else {
          stats.impassable++;
        }

        totalDanger += tile.base_danger;
        dangerCount++;
      }
    }

    stats.averageDanger = dangerCount > 0 ? totalDanger / dangerCount : 0;

    return stats;
  }

  resizeMap(newWidth, newHeight, fillType = 'ground') {
    if (!this.currentMap) return false;

    const newTiles = [];
    for (let y = 0; y < newHeight; y++) {
      newTiles[y] = [];
      for (let x = 0; x < newWidth; x++) {
        if (y < this.currentMap.height && x < this.currentMap.width) {
          newTiles[y][x] = this.currentMap.tiles[y][x];
        } else {
          newTiles[y][x] = this.createTile(fillType, x, y);
        }
      }
    }

    this.currentMap.width = newWidth;
    this.currentMap.height = newHeight;
    this.currentMap.tiles = newTiles;

    this.currentMap.spawnPoints = this.currentMap.spawnPoints.filter(
      p => p.x < newWidth && p.y < newHeight
    );

    this.saveHistory();
    return true;
  }

  rotateMap(clockwise = true) {
    if (!this.currentMap) return false;

    const { width, height, tiles } = this.currentMap;
    const newTiles = [];

    for (let y = 0; y < width; y++) {
      newTiles[y] = [];
      for (let x = 0; x < height; x++) {
        const oldX = clockwise ? x : height - 1 - x;
        const oldY = clockwise ? height - 1 - y : y;
        const oldTile = tiles[oldY][oldX];

        newTiles[y][x] = {
          ...oldTile,
          id: `tile_${x}_${y}`,
          x,
          y
        };
      }
    }

    this.currentMap.width = height;
    this.currentMap.height = width;
    this.currentMap.tiles = newTiles;

    this.currentMap.spawnPoints = this.currentMap.spawnPoints.map(p => ({
      x: clockwise ? p.y : height - 1 - p.y,
      y: clockwise ? width - 1 - p.x : p.x
    }));

    this.saveHistory();
    return true;
  }

  mirrorMap(horizontal = true) {
    if (!this.currentMap) return false;

    const { width, height, tiles } = this.currentMap;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < Math.floor(width / 2); x++) {
        const mirrorX = horizontal ? width - 1 - x : x;
        const mirrorY = horizontal ? y : height - 1 - y;

        if (horizontal) {
          const temp = tiles[y][x];
          tiles[y][x] = { ...tiles[y][mirrorX], id: `tile_${x}_${y}`, x, y };
          tiles[y][mirrorX] = { ...temp, id: `tile_${mirrorX}_${y}`, x: mirrorX, y };
        } else {
          const temp = tiles[y][x];
          tiles[y][x] = { ...tiles[mirrorY][x], id: `tile_${x}_${y}`, x, y };
          tiles[mirrorY][x] = { ...temp, id: `tile_${x}_${mirrorY}`, x, y: mirrorY };
        }
      }
    }

    this.currentMap.spawnPoints = this.currentMap.spawnPoints.map(p => ({
      x: horizontal ? width - 1 - p.x : p.x,
      y: horizontal ? p.y : height - 1 - p.y
    }));

    this.saveHistory();
    return true;
  }

  getTile(x, y) {
    if (!this.currentMap) return null;
    return this.currentMap.tiles[y]?.[x] || null;
  }

  fillRegion(startX, startY, endX, endY, type) {
    return this.fillArea(startX, startY, endX, endY, type);
  }

  exportForGame() {
    return this.exportToGameFormat();
  }

  saveMap() {
    if (!this.currentMap) return null;
    return {
      ...this.currentMap,
      editorMetadata: {
        customTiles: this.customTiles,
        createdAt: this.currentMap.createdAt,
        modifiedAt: Date.now()
      }
    };
  }

  loadMap(saveData) {
    if (!saveData || !saveData.tiles) return false;

    this.currentMap = saveData;
    this.width = saveData.width;
    this.height = saveData.height;

    if (saveData.editorMetadata?.customTiles) {
      this.customTiles = { ...this.customTiles, ...saveData.editorMetadata.customTiles };
    }

    this.history = [];
    this.historyIndex = -1;
    this.saveHistory();

    return true;
  }
}

module.exports = MapEditor;
