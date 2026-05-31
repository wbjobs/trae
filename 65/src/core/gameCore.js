const { v4: uuidv4 } = require('uuid');
const CoordinateSystem = require('../modules/coordinate');
const CollisionDetector = require('../modules/collision');
const ResourceManager = require('../modules/resource');
const StateSynchronizer = require('../modules/sync');
const WeatherSystem = require('../modules/weather');
const { MapConfig } = require('../config/mapConfig');
const CombatSystem = require('./combatSystem');
const ScoreSystem = require('./scoreSystem');
const EventSystem = require('./eventSystem');
const { ReplayManager } = require('./replaySystem');

class Aircraft {
  constructor(id, playerId, spawnPoint) {
    this.id = id;
    this.playerId = playerId;
    this.position = { ...spawnPoint, timestamp: Date.now() };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.route = [];
    this.currentRouteIndex = 0;
    this.speed = 100;
    this.baseSpeed = 100;
    this.health = 100;
    this.maxHealth = 100;
    this.fuel = 100;
    this.maxFuel = 100;
    this.ammo = 50;
    this.maxAmmo = 50;
    this.shield = 0;
    this.maxShield = 100;
    this.score = 0;
    this.status = 'idle';
    this.targetId = null;
    this.effects = [];
    this.collisions = [];
    this.weatherEffects = [];
    this.currentSpeedModifier = { speedModifier: 1, accuracyModifier: 1 };
  }

  update(deltaTime, weatherSystem = null) {
    if (this.status !== 'flying' || this.route.length < 2) return;
    const speedModifier = this.currentSpeedModifier?.speedModifier || 1;
    const currentTarget = this.route[this.currentRouteIndex + 1];
    if (!currentTarget) {
      this.status = 'idle';
      return;
    }
    const dx = currentTarget.x - this.position.x;
    const dy = currentTarget.y - this.position.y;
    const dz = currentTarget.altitude - this.position.altitude;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < 10) {
      this.currentRouteIndex++;
      if (this.currentRouteIndex >= this.route.length - 1) {
        this.status = 'idle';
        this.route = [];
        this.currentRouteIndex = 0;
      }
      return;
    }
    const effectiveSpeed = this.speed * speedModifier;
    const moveDistance = effectiveSpeed * deltaTime / 1000;
    const ratio = Math.min(1, moveDistance / distance);
    this.position.x += dx * ratio;
    this.position.y += dy * ratio;
    this.position.altitude += dz * ratio;
    this.position.timestamp = Date.now();
    this.fuel = Math.max(0, this.fuel - 0.01 * deltaTime / 1000);
    if (this.fuel <= 0) {
      this.status = 'crashed';
    }
  }

  setRoute(waypoints) {
    this.route = [{ ...this.position }, ...waypoints];
    this.currentRouteIndex = 0;
    this.status = 'flying';
  }

  takeDamage(amount) {
    const actualDamage = Math.max(0, amount - this.shield);
    this.shield = Math.max(0, this.shield - amount);
    this.health = Math.max(0, this.health - actualDamage);
    return actualDamage;
  }

  applyEffect(effect) {
    this.effects.push({ ...effect, startTime: Date.now() });
    switch (effect.type) {
      case 'speed_boost':
        this.speed = this.baseSpeed * (effect.multiplier || 1.5);
        break;
      case 'shield':
        this.shield = Math.min(this.maxShield, this.shield + (effect.amount || 50));
        break;
      case 'repair':
        this.health = Math.min(this.maxHealth, this.health + (effect.amount || 30));
        break;
      case 'refuel':
        this.fuel = Math.min(this.maxFuel, this.fuel + (effect.amount || 50));
        break;
    }
  }

  addScore(points) {
    this.score += points;
  }
}

class GameCore {
  constructor(options = {}) {
    this.id = uuidv4();
    this.mapConfig = new MapConfig();
    this.mapConfig.loadMap(options.mapId || 'default');
    
    this.coordSystem = new CoordinateSystem(this.mapConfig.getBounds());
    this.collisionDetector = new CollisionDetector(this.coordSystem);
    this.resourceManager = new ResourceManager(this.coordSystem, options.resourceConfig);
    this.stateSync = new StateSynchronizer(options.syncConfig);
    this.weatherSystem = new WeatherSystem(this.coordSystem, options.weatherConfig);
    this.combatSystem = new CombatSystem(this.collisionDetector, options.combatConfig);
    this.scoreSystem = new ScoreSystem(options.scoreConfig);
    this.eventSystem = new EventSystem(options.eventConfig);
    this.replayManager = options.replayManager || new ReplayManager();

    this.aircrafts = new Map();
    this.players = new Map();
    this.projectiles = [];
    
    this.config = {
      gameDuration: options.gameDuration || 600000,
      tickRate: options.tickRate || 50,
      maxPlayers: options.maxPlayers || this.mapConfig.getMaxPlayers(),
      winScore: options.winScore || 1000,
      enableWeather: options.enableWeather !== false,
      enableReplay: options.enableReplay !== false,
      ...options
    };

    this.status = 'waiting';
    this.startTime = null;
    this.endTime = null;
    this.winner = null;
    this.gameLoop = null;
    this.replayId = null;
  }

  start() {
    if (this.status !== 'waiting') return false;
    
    this.status = 'playing';
    this.startTime = Date.now();
    this.endTime = this.startTime + this.config.gameDuration;
    
    this.resourceManager.spawnInitialResources(5);
    this.resourceManager.startAutoRefresh();
    
    if (this.config.enableWeather) {
      this.weatherSystem.startAutoUpdate(this.mapConfig.getBounds());
    }
    
    if (this.config.enableReplay) {
      this.replayId = this.replayManager.startRecording(this.id, {
        gameId: this.id,
        map: this.mapConfig.currentMap?.id,
        playerCount: this.players.size
      });
    }
    
    this.startGameLoop();
    
    this.eventSystem.emit('game_start', {
      gameId: this.id,
      startTime: this.startTime,
      playerCount: this.players.size
    });
    
    return true;
  }

  pause() {
    if (this.status !== 'playing') return false;
    this.status = 'paused';
    this.stopGameLoop();
    this.eventSystem.emit('game_paused', {});
    return true;
  }

  resume() {
    if (this.status !== 'paused') return false;
    this.status = 'playing';
    this.startGameLoop();
    this.eventSystem.emit('game_resumed', {});
    return true;
  }

  end(reason = 'time_up') {
    if (this.status === 'finished') return this.getGameResult();
    
    this.status = 'finished';
    this.stopGameLoop();
    
    try {
      this.resourceManager.stopAutoRefresh();
    } catch (e) {
      console.error('停止资源刷新失败:', e);
    }
    
    try {
      this.weatherSystem.stopAutoUpdate();
    } catch (e) {
      console.error('停止天气系统失败:', e);
    }
    
    try {
      if (this.replayId) {
        this.replayManager.stopRecording(this.id, true);
      }
    } catch (e) {
      console.error('停止回放录制失败:', e);
    }
    
    try {
      const finalScores = this.getScores();
      this.winner = finalScores.length > 0 ? finalScores[0] : null;
      
      this.eventSystem.emit('game_end', {
        reason,
        winner: this.winner,
        scores: finalScores,
        duration: Date.now() - this.startTime
      });
    } catch (e) {
      console.error('游戏结束处理失败:', e);
    }
    
    return this.getGameResult();
  }

  addPlayer(playerId, playerName) {
    if (this.players.size >= this.config.maxPlayers) {
      return { success: false, error: 'Game is full' };
    }
    const spawnIndex = this.players.size;
    const spawnPoint = this.mapConfig.getSpawnPoint(spawnIndex);
    const aircraftId = `aircraft_${playerId}`;
    const aircraft = new Aircraft(aircraftId, playerId, spawnPoint);
    
    this.aircrafts.set(aircraftId, aircraft);
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      aircraftId,
      joinTime: Date.now(),
      isReady: false
    });
    this.scoreSystem.addScore(playerId, 0, 'join');
    this.stateSync.setState(`player:${playerId}`, this.players.get(playerId));
    this.stateSync.setState(`aircraft:${aircraftId}`, this.serializeAircraft(aircraft));
    this.eventSystem.emit('player_join', { playerId, playerName, spawnPoint });
    
    return { success: true, aircraft, spawnPoint };
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    this.aircrafts.delete(player.aircraftId);
    this.players.delete(playerId);
    this.stateSync.deleteState(`player:${playerId}`);
    this.stateSync.deleteState(`aircraft:${player.aircraftId}`);
    this.eventSystem.emit('player_leave', { playerId });
    if (this.status === 'playing' && this.players.size < 1) {
      this.end('all_players_left');
    }
    return true;
  }

  setPlayerReady(playerId, isReady = true) {
    const player = this.players.get(playerId);
    if (!player) return false;
    player.isReady = isReady;
    this.stateSync.updateState(`player:${playerId}`, { isReady });
    if (this.status === 'waiting' && this.checkAllReady()) {
      this.start();
    }
    return true;
  }

  checkAllReady() {
    if (this.players.size < 2) return false;
    return Array.from(this.players.values()).every(p => p.isReady);
  }

  setRoute(playerId, waypoints) {
    const player = this.players.get(playerId);
    if (!player) return null;
    const aircraft = this.aircrafts.get(player.aircraftId);
    if (!aircraft || aircraft.status === 'crashed') return null;
    const validWaypoints = waypoints.filter(wp => 
      this.mapConfig.validatePosition(wp) &&
      !this.isInNoFlyZone(wp)
    );
    if (validWaypoints.length === 0) return null;
    aircraft.setRoute(validWaypoints);
    this.stateSync.updateState(`aircraft:${aircraft.id}`, {
      route: aircraft.route,
      currentRouteIndex: aircraft.currentRouteIndex,
      status: aircraft.status
    });
    this.eventSystem.emit('route_set', { playerId, waypoints: validWaypoints });
    return { success: true, route: validWaypoints };
  }

  fireWeapon(playerId, targetId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    const attacker = this.aircrafts.get(player.aircraftId);
    if (!attacker || attacker.status === 'crashed') return null;
    const targetAircraft = this.aircrafts.get(targetId);
    if (!targetAircraft || targetAircraft.status === 'crashed') return null;
    
    const weatherModifier = attacker.currentSpeedModifier?.accuracyModifier || 1;
    const result = this.combatSystem.fireWeapon(attacker, targetAircraft, weatherModifier);
    
    if (result.success) {
      if (result.hit) {
        this.scoreSystem.addScore(playerId, result.damage, 'damage');
        if (result.destroyed) {
          this.scoreSystem.addKill(playerId);
          this.eventSystem.emit('aircraft_destroyed', {
            targetId,
            attackerId: playerId,
            score: 100
          });
        }
      }
      this.stateSync.updateState(`aircraft:${targetAircraft.id}`, {
        health: targetAircraft.health,
        shield: targetAircraft.shield,
        status: targetAircraft.status
      });
      this.eventSystem.emit('weapon_fire', {
        attackerId: playerId,
        targetId,
        hit: result.hit,
        damage: result.damage
      });
    }
    return result;
  }

  captureResource(playerId, resourceId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    const aircraft = this.aircrafts.get(player.aircraftId);
    if (!aircraft || aircraft.status === 'crashed') return null;
    const resource = this.resourceManager.getResource(resourceId);
    if (!resource || !resource.isActive) return null;
    const overlap = this.collisionDetector.checkResourceOverlap(aircraft.position, resource.position);
    if (!overlap.isOverlapping) {
      return { success: false, reason: 'too_far', captureProgress: overlap.captureProgress };
    }
    const result = this.resourceManager.captureResource(resourceId, playerId, overlap.captureProgress * 10);
    
    if (result.captureCompleted) {
      this.applyResourceEffect(aircraft, resource);
      this.scoreSystem.addResourceCapture(playerId, resource.value);
      aircraft.addScore(resource.value);
      
      this.stateSync.updateState(`aircraft:${aircraft.id}`, {
        score: aircraft.score,
        health: aircraft.health,
        fuel: aircraft.fuel,
        shield: aircraft.shield,
        ammo: aircraft.ammo
      });
      this.eventSystem.emit('resource_captured', {
        playerId,
        resourceId,
        resourceType: resource.type,
        value: resource.value
      });
      this.checkWinCondition();
    }
    return result;
  }

  applyResourceEffect(aircraft, resource) {
    switch (resource.type) {
      case 'fuel':
        aircraft.applyEffect({ type: 'refuel', amount: resource.value });
        break;
      case 'ammo':
        aircraft.ammo = Math.min(aircraft.maxAmmo, aircraft.ammo + Math.floor(resource.value / 2));
        break;
      case 'shield':
        aircraft.applyEffect({ type: 'shield', amount: resource.value });
        break;
      case 'speed':
        aircraft.applyEffect({ type: 'speed_boost', multiplier: 1.5, duration: 10000 });
        break;
      case 'repair':
        aircraft.applyEffect({ type: 'repair', amount: resource.value });
        break;
    }
  }

  isInNoFlyZone(position) {
    const noFlyZones = this.mapConfig.getNoFlyZones();
    return noFlyZones.some(nfz => this.collisionDetector.checkNoFlyZone(position, nfz));
  }

  startGameLoop() {
    this.stopGameLoop();
    let lastTick = Date.now();
    this.gameLoop = setInterval(() => {
      const now = Date.now();
      const deltaTime = now - lastTick;
      lastTick = now;
      this.tick(deltaTime);
    }, this.config.tickRate);
  }

  stopGameLoop() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  tick(deltaTime) {
    if (this.status !== 'playing') return;
    try {
      this.aircrafts.forEach(aircraft => {
        if (aircraft && aircraft.status !== 'crashed') {
          try {
            if (this.config.enableWeather && this.weatherSystem) {
              const weatherResult = this.weatherSystem.applyWeatherToAircraft(aircraft, deltaTime);
              if (weatherResult?.damaged) {
                this.eventSystem.emit('weather_damage', {
                  aircraftId: aircraft.id,
                  damage: weatherResult.damage
                });
              }
            }
            aircraft.update(deltaTime, this.weatherSystem);
          } catch (e) {
            console.error('更新飞机状态失败:', e);
          }
        }
      });
      this.checkCollisions();
      this.syncAircraftStates();
      if (this.config.enableReplay && this.replayId) {
        this.replayManager.recordFrame(this.id, this.getReplayFrame());
      }
      if (this.endTime && Date.now() >= this.endTime) {
        this.end('time_up');
      }
    } catch (error) {
      console.error('游戏tick错误:', error);
    }
  }

  checkCollisions() {
    try {
      const activeAircrafts = Array.from(this.aircrafts.values())
        .filter(a => a && a.status !== 'crashed' && a.position);
      for (let i = 0; i < activeAircrafts.length; i++) {
        for (let j = i + 1; j < activeAircrafts.length; j++) {
          const a1 = activeAircrafts[i];
          const a2 = activeAircrafts[j];
          if (!a1.position || !a2.position) continue;
          const result = this.collisionDetector.checkPointCollision(
            a1.position, a2.position,
            { minHorizontal: 30, minVertical: 50 }
          );
          if (result.isCollision) {
            const combatResult = this.combatSystem.handleCollision(a1, a2, result);
            if (combatResult.destroyed1) {
              this.eventSystem.emit('aircraft_crashed', { aircraftId: a1.id, reason: 'collision' });
            }
            if (combatResult.destroyed2) {
              this.eventSystem.emit('aircraft_crashed', { aircraftId: a2.id, reason: 'collision' });
            }
            this.eventSystem.emit('collision', {
              aircraft1: a1.id,
              aircraft2: a2.id,
              severity: result.severity
            });
          }
        }
      }
    } catch (error) {
      console.error('碰撞检测错误:', error);
    }
  }

  syncAircraftStates() {
    this.aircrafts.forEach((aircraft, id) => {
      this.stateSync.setState(`aircraft:${id}`, this.serializeAircraft(aircraft), { priority: 'low' });
    });
  }

  serializeAircraft(aircraft) {
    return {
      id: aircraft.id,
      playerId: aircraft.playerId,
      position: aircraft.position,
      velocity: aircraft.velocity,
      route: aircraft.route,
      currentRouteIndex: aircraft.currentRouteIndex,
      speed: aircraft.speed,
      health: aircraft.health,
      maxHealth: aircraft.maxHealth,
      fuel: aircraft.fuel,
      maxFuel: aircraft.maxFuel,
      ammo: aircraft.ammo,
      maxAmmo: aircraft.maxAmmo,
      shield: aircraft.shield,
      maxShield: aircraft.maxShield,
      score: aircraft.score,
      status: aircraft.status,
      weatherEffects: aircraft.weatherEffects,
      speedModifier: aircraft.currentSpeedModifier
    };
  }

  getReplayFrame() {
    return {
      aircrafts: Array.from(this.aircrafts.values()).map(a => ({
        id: a.id,
        position: a.position,
        status: a.status,
        health: a.health
      })),
      resources: this.resourceManager.getActiveResources().map(r => ({
        id: r.id,
        position: r.position,
        type: r.type,
        isActive: r.isActive
      })),
      weather: this.weatherSystem.getActiveWeatherSummary()
    };
  }

  checkWinCondition() {
    const scores = this.getScores();
    if (scores.length > 0 && scores[0].score >= this.config.winScore) {
      this.end('score_reached');
    }
  }

  getScores() {
    return Array.from(this.players.values()).map(player => {
      const aircraft = this.aircrafts.get(player.aircraftId);
      return {
        playerId: player.id,
        playerName: player.name,
        score: aircraft ? aircraft.score : 0,
        health: aircraft ? aircraft.health : 0
      };
    }).sort((a, b) => b.score - a.score);
  }

  getGameState() {
    return {
      id: this.id,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      remainingTime: this.endTime ? Math.max(0, this.endTime - Date.now()) : this.config.gameDuration,
      winner: this.winner,
      players: Array.from(this.players.values()),
      aircrafts: Array.from(this.aircrafts.values()).map(a => this.serializeAircraft(a)),
      resources: this.resourceManager.getActiveResources(),
      weather: this.config.enableWeather ? this.weatherSystem.getActiveWeatherSummary() : [],
      scores: this.getScores(),
      map: this.mapConfig.currentMap ? this.mapConfig.currentMap.id : 'default',
      combatStats: this.combatSystem.getStats(),
      scoreStats: this.scoreSystem.getStats()
    };
  }

  getGameResult() {
    return {
      gameId: this.id,
      replayId: this.replayId,
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      winner: this.winner,
      scores: this.getScores(),
      playerCount: this.players.size,
      map: this.mapConfig.currentMap ? this.mapConfig.currentMap.id : 'default',
      events: this.eventSystem.getEvents(),
      resourceStats: this.resourceManager.getStats(),
      combatStats: this.combatSystem.getStats(),
      scoreStats: this.scoreSystem.getStats()
    };
  }

  getEvents(since = 0) {
    return this.eventSystem.getEvents({ since });
  }

  getDeltaState(since = 0) {
    return {
      state: this.stateSync.getFullState(),
      events: this.getEvents(since),
      timestamp: Date.now()
    };
  }
}

module.exports = { GameCore, Aircraft };
