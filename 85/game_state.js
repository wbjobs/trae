const fs = require('fs');
const path = require('path');

const MapGenerator = require('./scenes/map_generator');
const TileGenerator = require('./scenes/tile_generator');
const FogOfWar = require('./scenes/fog_of_war');
const ItemSpawner = require('./behaviors/item_spawner');
const StealthDetector = require('./behaviors/stealth_detector');
const DangerCalculator = require('./behaviors/danger_calculator');
const StateSync = require('./behaviors/state_sync');
const DynamicEnvironment = require('./behaviors/dynamic_environment');
const WeatherSystem = require('./behaviors/weather_system');
const ClueSystem = require('./behaviors/clue_system');

class GameState {
  constructor() {
    this.mapGenerator = new MapGenerator();
    this.tileGenerator = new TileGenerator();
    this.fogOfWar = new FogOfWar();
    this.itemSpawner = new ItemSpawner();
    this.stealthDetector = new StealthDetector();
    this.dangerCalculator = new DangerCalculator();
    this.stateSync = new StateSync();
    this.dynamicEnv = new DynamicEnvironment();
    this.weatherSystem = new WeatherSystem();
    this.clueSystem = new ClueSystem(this);

    this.players = new Map();
    this.enemies = [];
    this.map = null;
    this.items = [];
    this.gameTime = 0;
    this.gamePhase = 'waiting';
    this.lastItemRespawn = 0;
    this.lastEnvironmentEvent = 0;
    this.lastTimeUpdate = 0;
    this.lastWeatherUpdate = 0;
    this.previousState = null;

    this.gameConfig = this.loadConfig('game_config.json');
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  initialize() {
    const mapData = this.mapGenerator.generateMap(Date.now());
    this.map = mapData;

    this.itemSpawner.spawnInitialItems(this.map.tiles);

    this.dynamicEnv.initialize(this.map.tiles);
    
    this.weatherSystem.initialize(this.map);
    
    this.clueSystem.initialize(this.map);

    this.spawnEnemies(5);

    this.updateAllTileDanger();

    this.gamePhase = 'playing';
    this.previousState = this.getSnapshot();

    console.log('Game state initialized');
    return this;
  }

  spawnEnemies(count) {
    this.enemies = [];
    for (let i = 0; i < count; i++) {
      const enemy = this.createEnemy();
      if (enemy) {
        this.enemies.push(enemy);
      }
    }
    return this.enemies;
  }

  createEnemy() {
    const width = this.map.tiles[0].length;
    const height = this.map.tiles.length;

    let attempts = 0;
    while (attempts < 100) {
      const x = Math.floor(Math.random() * (width - 2)) + 1;
      const y = Math.floor(Math.random() * (height - 2)) + 1;
      const tile = this.map.tiles[y][x];

      if (tile.passable && !tile.is_spawn && tile.base_danger < 30) {
        const enemy = {
          id: `enemy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'patrol',
          x,
          y,
          awareness: 0,
          state: 'unaware',
          detection_range: 5,
          threat_level: 30,
          patrol_route: this.generatePatrolRoute(x, y),
          patrol_index: 0,
          last_move: 0
        };

        tile.has_patrol = true;
        tile.patrol_unit = enemy.id;

        return enemy;
      }
      attempts++;
    }
    return null;
  }

  generatePatrolRoute(startX, startY, length = 5) {
    const route = [{ x: startX, y: startY }];
    let x = startX;
    let y = startY;

    for (let i = 0; i < length; i++) {
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const validDirs = directions.filter(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        const tile = this.map.tiles[ny]?.[nx];
        return tile && tile.passable;
      });

      if (validDirs.length > 0) {
        const [dx, dy] = validDirs[Math.floor(Math.random() * validDirs.length)];
        x += dx;
        y += dy;
        route.push({ x, y });
      }
    }
    return route;
  }

  addPlayer(name) {
    const spawnPoints = this.map.spawnPoints;
    const spawn = spawnPoints[this.players.size % spawnPoints.length] || spawnPoints[0];

    const player = {
      id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      x: spawn.x,
      y: spawn.y,
      health: 100,
      max_health: 100,
      current_stealth: 50,
      posture: 'stand',
      movement_type: 'walk',
      is_moving: false,
      noise_level: 0,
      perception: 50,
      inventory: [],
      score: 0,
      stealth_gear: 0,
      radiation_resist: 0,
      view_bonus: 0,
      ammo: 0,
      has_key: false,
      detection_level: 'hidden',
      joined_at: Date.now()
    };

    this.players.set(player.id, player);
    console.log(`Player ${name} joined at (${spawn.x}, ${spawn.y})`);

    return player;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      console.log(`Player ${player.name} left the game`);
      return true;
    }
    return false;
  }

  movePlayer(playerId, targetX, targetY, posture = 'stand') {
    const player = this.players.get(playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    if (player.health <= 0) {
      return { success: false, reason: 'Player is dead' };
    }

    const tile = this.map.tiles[targetY]?.[targetX];
    if (!tile) {
      return { success: false, reason: 'Invalid position' };
    }

    if (!tile.passable) {
      return { success: false, reason: 'Tile is impassable' };
    }

    const distance = Math.sqrt(
      Math.pow(targetX - player.x, 2) + Math.pow(targetY - player.y, 2)
    );
    if (distance > 1.5) {
      return { success: false, reason: 'Move distance too far' };
    }

    player.previous_x = player.x;
    player.previous_y = player.y;
    player.x = targetX;
    player.y = targetY;
    player.posture = posture;
    player.is_moving = true;
    player.movement_type = posture === 'stand' ? 'walk' : posture === 'crouch' ? 'crawl' : 'crawl';

    player.noise_level = this.stealthDetector.calculateMovementNoise(player);

    player.current_stealth = this.stealthDetector.calculateStealthLevel(
      player,
      this.map.tiles[targetY][targetX]
    );

    player.current_stealth = this.dynamicEnv.getModifiedPlayerStealth(
      player,
      player.current_stealth
    );

    player.current_stealth = this.weatherSystem.getModifiedPlayerStealth(
      player,
      player.current_stealth
    );

    this.updatePlayerDetectionLevel(player);

    const envDamage = this.dangerCalculator.applyEnvironmentalDamage(
      player,
      this.map.tiles
    );

    if (envDamage.damage > 0) {
      console.log(`Player ${player.name} took ${envDamage.damage.toFixed(1)} damage from: ${envDamage.sources.join(', ')}`);
    }

    this.fogOfWar.revealArea(
      this.map.tiles,
      player.x,
      player.y,
      this.gameConfig.fog_of_war_radius + (player.view_bonus || 0)
    );

    return { success: true, player };
  }

  updatePlayerDetectionLevel(player) {
    let highestDetection = 'hidden';
    
    for (const enemy of this.enemies) {
      const modifiedEnemy = this.weatherSystem.getModifiedEnemyDetection(enemy);
      const detection = this.stealthDetector.getDetectionLevel(
        player,
        modifiedEnemy,
        this.map.tiles
      );
      
      if (detection === 'detected') {
        highestDetection = 'detected';
        break;
      } else if (detection === 'exposed' && highestDetection !== 'detected') {
        highestDetection = 'exposed';
      } else if (detection === 'partially_hidden' && highestDetection === 'hidden') {
        highestDetection = 'partially_hidden';
      }
    }
    
    player.detection_level = highestDetection;
    return highestDetection;
  }

  playerAction(playerId, action, payload = {}) {
    const player = this.players.get(playerId);
    if (!player || player.health <= 0) {
      return { success: false, reason: 'Player not found or dead' };
    }

    const tile = this.map.tiles[player.y][player.x];

    switch (action) {
      case 'search':
        const foundItems = this.itemSpawner.searchForHiddenItems(player, tile);
        return {
          success: true,
          data: {
            action: 'search',
            found: foundItems,
            tile: { x: player.x, y: player.y }
          }
        };

      case 'change_posture':
        player.posture = payload.posture || 'stand';
        player.current_stealth = this.stealthDetector.calculateStealthLevel(player, tile);
        return {
          success: true,
          data: {
            action: 'posture_changed',
            posture: player.posture,
            stealth: player.current_stealth
          }
        };

      case 'use_item':
        return this.useItem(player, payload.item_id);

      case 'collect_clue':
        return this.collectClue(playerId, payload.clue_id);

      case 'start_deduction':
        return this.clueSystem.startDeduction(playerId, payload.clue_ids || []);

      case 'complete_deduction':
        return this.clueSystem.completeDeduction(playerId, payload.deduction_id);

      case 'unlock_relic':
        return this.clueSystem.checkRelicUnlock(playerId, payload.relic_id);

      case 'get_clue_stats':
        return {
          success: true,
          data: this.clueSystem.getClueStats(playerId)
        };

      case 'get_collected_clues':
        return {
          success: true,
          data: this.clueSystem.getCollectedClues(playerId)
        };

      default:
        return { success: false, reason: 'Unknown action' };
    }
  }

  collectClue(playerId, clueId) {
    const result = this.clueSystem.collectClue(playerId, clueId);
    if (result.success && result.reward) {
      const player = this.players.get(playerId);
      if (player) {
        player.score = (player.score || 0) + result.reward.exp || 0;
      }
    }
    return result;
  }

  useItem(player, itemId) {
    const itemIndex = player.inventory.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      return { success: false, reason: 'Item not in inventory' };
    }

    const item = player.inventory[itemIndex];
    
    if (item.item_type === 'consumable') {
      this.itemSpawner.applyItemEffect(player, item);
      player.inventory.splice(itemIndex, 1);
      return {
        success: true,
        data: {
          action: 'item_used',
          item,
          player: { health: player.health }
        }
      };
    }

    return { success: false, reason: 'Item is not consumable' };
  }

  pickupItem(playerId, itemId) {
    const player = this.players.get(playerId);
    if (!player || player.health <= 0) {
      return { success: false, reason: 'Player not found or dead' };
    }

    const tile = this.map.tiles[player.y][player.x];
    const item = tile.items.find(i => i.id === itemId);

    if (!item) {
      return { success: false, reason: 'Item not found at current location' };
    }

    const result = this.itemSpawner.pickupItem(player, item, tile);
    return result;
  }

  updateAllTileDanger() {
    this.dangerCalculator.updateMapDangerLevels(
      this.map.tiles,
      this.enemies,
      this.dynamicEnv.environmentalEffects
    );
  }

  tick(deltaTime) {
    if (this.gamePhase !== 'playing' || !this.map || !this.map.tiles) return;

    this.gameTime += deltaTime;

    this.updateEnemies(deltaTime);

    if (this.gameTime - this.lastItemRespawn > this.gameConfig.respawn_items_interval * 1000) {
      const respawned = this.itemSpawner.respawnItems(this.map.tiles);
      if (respawned.length > 0) {
        console.log(`Respawned ${respawned.length} items`);
      }
      this.lastItemRespawn = this.gameTime;
    }

    if (this.gameTime - this.lastEnvironmentEvent > this.gameConfig.dynamic_event_interval * 1000) {
      const event = this.dynamicEnv.triggerRandomEvent(
        this.map.tiles,
        Array.from(this.players.values())
      );
      if (event) {
        console.log(`Environment event: ${event.type} at (${event.centerX}, ${event.centerY})`);
      }
      this.lastEnvironmentEvent = this.gameTime;
    }

    this.dynamicEnv.updateEvents(this.map.tiles, deltaTime);

    if (this.gameTime - this.lastTimeUpdate > 60000) {
      this.dynamicEnv.updateTimeOfDay();
      this.lastTimeUpdate = this.gameTime;
    }

    if (this.gameTime - this.lastWeatherUpdate > 30000) {
      this.weatherSystem.update(deltaTime);
      this.lastWeatherUpdate = this.gameTime;
    }

    this.clueSystem.update(deltaTime, this.map);

    this.updateAllTileDanger();

    for (const player of this.players.values()) {
      if (player.health > 0) {
        this.updatePlayerDetectionLevel(player);
      }
    }
  }

  updateEnemies(deltaTime) {
    for (let enemy of this.enemies) {
      let detectedPlayer = null;
      let highestDetection = 0;

      for (const player of this.players.values()) {
        if (player.health <= 0) continue;

        const detection = this.stealthDetector.isPlayerDetected(
          player,
          enemy,
          this.map.tiles,
          this.map.tiles[player.y][player.x]
        );

        if (detection) {
          const detectionLevel = this.stealthDetector.getDetectionLevel(
            player,
            enemy,
            this.map.tiles
          );
          if (detectionLevel === 'detected') {
            detectedPlayer = player;
            break;
          }
        }
      }

      if (detectedPlayer) {
        enemy = this.stealthDetector.updateEnemyAwareness(enemy, true);
        this.moveEnemyTowardsPlayer(enemy, detectedPlayer);
      } else {
        enemy = this.stealthDetector.updateEnemyAwareness(enemy, false);
        this.patrolEnemy(enemy, deltaTime);
      }

      const oldTile = this.map.tiles[enemy.y]?.[enemy.x];
      if (oldTile && oldTile.patrol_unit === enemy.id) {
        oldTile.has_patrol = false;
        oldTile.patrol_unit = null;
      }
      const newTile = this.map.tiles[enemy.y]?.[enemy.x];
      if (newTile) {
        newTile.has_patrol = true;
        newTile.patrol_unit = enemy.id;
      }
    }
  }

  moveEnemyTowardsPlayer(enemy, player) {
    if (Date.now() - enemy.last_move < 500) return;

    const dx = Math.sign(player.x - enemy.x);
    const dy = Math.sign(player.y - enemy.y);

    const moves = [];
    if (dx !== 0) moves.push({ x: enemy.x + dx, y: enemy.y });
    if (dy !== 0) moves.push({ x: enemy.x, y: enemy.y + dy });

    for (const move of moves) {
      const tile = this.map.tiles[move.y]?.[move.x];
      if (tile && tile.passable) {
        enemy.x = move.x;
        enemy.y = move.y;
        enemy.last_move = Date.now();
        break;
      }
    }
  }

  patrolEnemy(enemy, deltaTime) {
    if (Date.now() - enemy.last_move < 1000) return;
    if (enemy.state !== 'unaware' && enemy.state !== 'suspicious') return;

    const target = enemy.patrol_route[enemy.patrol_index];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;

    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      enemy.patrol_index = (enemy.patrol_index + 1) % enemy.patrol_route.length;
      return;
    }

    const moveX = Math.sign(dx);
    const moveY = Math.sign(dy);

    if (moveX !== 0) {
      const newX = enemy.x + moveX;
      const tile = this.map.tiles[enemy.y]?.[newX];
      if (tile && tile.passable) {
        enemy.x = newX;
        enemy.last_move = Date.now();
        return;
      }
    }

    if (moveY !== 0) {
      const newY = enemy.y + moveY;
      const tile = this.map.tiles[newY]?.[enemy.x];
      if (tile && tile.passable) {
        enemy.y = newY;
        enemy.last_move = Date.now();
        return;
      }
    }

    enemy.patrol_index = (enemy.patrol_index + 1) % enemy.patrol_route.length;
  }

  getSnapshot() {
    return {
      map: this.map ? JSON.parse(JSON.stringify(this.map)) : null,
      players: Array.from(this.players.values()).map(p => ({ ...p })),
      enemies: this.enemies.map(e => ({ ...e })),
      items: this.getAllItems(),
      gameTime: this.gameTime,
      gamePhase: this.gamePhase,
      environmentalEffects: this.dynamicEnv ? this.dynamicEnv.getEnvironmentStatus() : {},
      weather: this.weatherSystem ? this.weatherSystem.getWeatherState() : null,
      clues: this.clueSystem ? this.clueSystem.getState() : null
    };
  }

  getAllItems() {
    const items = [];
    if (!this.map || !this.map.tiles) return items;
    
    for (let y = 0; y < this.map.tiles.length; y++) {
      for (let x = 0; x < this.map.tiles[y].length; x++) {
        const tile = this.map.tiles[y][x];
        if (tile && tile.items) {
          for (const item of tile.items) {
            items.push(item);
          }
        }
      }
    }
    return items;
  }

  getFullState() {
    const snapshot = this.getSnapshot();
    this.previousState = snapshot;
    return this.stateSync.generateFullState(snapshot);
  }

  getDeltaState() {
    const currentState = this.getSnapshot();
    if (!this.previousState) {
      return this.getFullState();
    }

    const delta = this.stateSync.generateDeltaState(this.previousState, currentState);
    this.previousState = currentState;
    return delta;
  }

  getPlayerState(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    const fullState = this.getFullState();
    return this.stateSync.getStateForPlayer(fullState, playerId);
  }

  getEnvironmentStatus() {
    return this.dynamicEnv.getEnvironmentStatus();
  }

  getWeatherState() {
    return this.weatherSystem ? this.weatherSystem.getWeatherState() : null;
  }

  getClueSystem() {
    return this.clueSystem;
  }
}

module.exports = GameState;
