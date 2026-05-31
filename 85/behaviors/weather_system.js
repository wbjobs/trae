const fs = require('fs');
const path = require('path');

class WeatherSystem {
  constructor() {
    this.weatherConfig = this.loadConfig('weather_config.json');
    this.weatherTypes = this.weatherConfig.weather_types;
    this.weatherTransitions = this.weatherConfig.weather_transitions;
    this.timeOfDayEffects = this.weatherConfig.time_of_day_effects;

    this.currentWeather = 'clear';
    this.weatherDuration = 0;
    this.weatherStartTime = 0;
    this.footprints = [];
    this.activeWeatherEffects = [];
    this.maxFootprints = this.weatherConfig.weather_effects.footprint_tracking.max_tracks;
    this.lightningFlashActive = false;
    this.lightningFlashEndTime = 0;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  initialize(map) {
    this.currentWeather = 'clear';
    this.weatherDuration = this.getRandomWeatherDuration();
    this.weatherStartTime = Date.now();
    this.footprints = [];
    this.activeWeatherEffects = [];
    this.lightningFlashActive = false;
    return this.getCurrentWeatherInfo();
  }

  getRandomWeatherDuration() {
    return (Math.floor(Math.random() * 120) + 60) * 1000;
  }

  getCurrentWeatherInfo() {
    const weatherData = this.weatherTypes[this.currentWeather];
    return {
      type: this.currentWeather,
      name: weatherData.name,
      ...weatherData,
      remainingTime: Math.max(0, this.weatherDuration - (Date.now() - this.weatherStartTime)),
      lightning_flash: this.lightningFlashActive
    };
  }

  update(deltaTime, map, players, enemies) {
    const elapsed = Date.now() - this.weatherStartTime;

    if (elapsed >= this.weatherDuration) {
      this.transitionWeather();
    }

    this.updateWeatherEffects(map, players, enemies);

    return this.getCurrentWeatherInfo();
  }

  transitionWeather() {
    const possibleTransitions = this.weatherTransitions[this.currentWeather] || ['clear'];
    const nextWeather = possibleTransitions[Math.floor(Math.random() * possibleTransitions.length)];

    const oldWeather = this.currentWeather;
    this.currentWeather = nextWeather;
    this.weatherDuration = this.getRandomWeatherDuration();
    this.weatherStartTime = Date.now();

    console.log(`天气变化: ${this.weatherTypes[oldWeather].name} → ${this.weatherTypes[nextWeather].name}`);

    return {
      oldWeather,
      newWeather: nextWeather,
      weatherData: this.weatherTypes[nextWeather]
    };
  }

  setWeather(weatherType) {
    if (this.weatherTypes[weatherType]) {
      const oldWeather = this.currentWeather;
      this.currentWeather = weatherType;
      this.weatherDuration = this.getRandomWeatherDuration();
      this.weatherStartTime = Date.now();
      return {
        oldWeather,
        newWeather: weatherType,
        weatherData: this.weatherTypes[weatherType]
      };
    }
    return null;
  }

  updateWeatherEffects(map, players, enemies) {
    const weatherData = this.weatherTypes[this.currentWeather];

    if (weatherData.lightning_flash_chance && Math.random() < weatherData.lightning_flash_chance * 0.01) {
      this.triggerLightningFlash(map, players, enemies, weatherData.lightning_reveal_radius);
    }

    if (this.lightningFlashActive && Date.now() >= this.lightningFlashEndTime) {
      this.lightningFlashActive = false;
    }

    if (weatherData.environmental_damage > 0) {
      this.applyWeatherDamage(players, weatherData.environmental_damage, 'weather');
    }

    if (weatherData.cold_damage > 0) {
      this.applyWeatherDamage(players, weatherData.cold_damage, 'cold');
    }

    if (weatherData.radiation_damage > 0) {
      this.applyWeatherDamage(players, weatherData.radiation_damage, 'radiation');
    }

    if (weatherData.toxic_damage > 0) {
      this.applyWeatherDamage(players, weatherData.toxic_damage, 'toxic');
    }

    if (weatherData.slippery_chance && Math.random() < weatherData.slippery_chance * 0.001) {
      this.triggerSlipperyEffect(players);
    }

    this.updateFootprints(players);
  }

  triggerLightningFlash(map, players, enemies, radius) {
    this.lightningFlashActive = true;
    this.lightningFlashEndTime = Date.now() + this.weatherConfig.weather_effects.lightning_flash.duration;

    for (const player of players) {
      if (player.health <= 0) continue;

      const stealthPenalty = this.weatherConfig.weather_effects.lightning_flash.stealth_penalty;
      player.current_stealth = Math.max(0, player.current_stealth - stealthPenalty);
      player.detection_level = 'exposed';

      console.log(`⚡ 闪电！玩家 ${player.name} 暴露位置，潜行值 -${stealthPenalty}`);
    }

    return {
      type: 'lightning_flash',
      duration: this.weatherConfig.weather_effects.lightning_flash.duration,
      radius
    };
  }

  triggerSlipperyEffect(players) {
    for (const player of players) {
      if (player.health <= 0) continue;

      if (Math.random() < this.weatherConfig.weather_effects.slippery_ground.fall_chance) {
        player.is_prone = true;
        player.posture = 'prone';
        player.noise_level += this.weatherConfig.weather_effects.slippery_ground.noise_increase;

        setTimeout(() => {
          player.is_prone = false;
        }, 2000);

        console.log(`💦 玩家 ${player.name} 滑倒了！`);
      }
    }
  }

  applyWeatherDamage(players, damage, damageType) {
    for (const player of players) {
      if (player.health <= 0) continue;

      let actualDamage = damage;

      if (damageType === 'toxic' && player.radiation_resist) {
        actualDamage *= (1 - player.radiation_resist / 100);
      }
      if (damageType === 'cold' && player.cold_resist) {
        actualDamage *= (1 - player.cold_resist / 100);
      }
      if (damageType === 'radiation' && player.radiation_resist) {
        actualDamage *= (1 - player.radiation_resist / 100);
      }

      if (actualDamage > 0) {
        player.health = Math.max(0, player.health - actualDamage * 0.1);
      }
    }
  }

  updateFootprints(players) {
    const weatherData = this.weatherTypes[this.currentWeather];

    if (!weatherData.footprint_visibility || weatherData.footprint_visibility <= 0) {
      this.footprints = [];
      return;
    }

    for (const player of players) {
      if (player.health <= 0 || !player.is_moving) continue;

      if (Math.random() < 0.3) {
        const footprint = {
          id: `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          playerId: player.id,
          x: player.x,
          y: player.y,
          visibility: weatherData.footprint_visibility,
          createdAt: Date.now(),
          duration: weatherData.footprint_duration || 15000,
          direction: player.facing || 'down'
        };

        this.footprints.push(footprint);

        if (this.footprints.length > this.maxFootprints) {
          this.footprints.shift();
        }
      }
    }

    const now = Date.now();
    this.footprints = this.footprints.filter(fp => now - fp.createdAt < fp.duration);
  }

  getFootprintsNear(x, y, radius) {
    return this.footprints.filter(fp => {
      const distance = Math.sqrt(Math.pow(fp.x - x, 2) + Math.pow(fp.y - y, 2));
      return distance <= radius;
    });
  }

  getStealthModifier(player, currentTile) {
    const weatherData = this.weatherTypes[this.currentWeather];
    let modifier = weatherData.stealth_modifier || 0;

    if (currentTile && currentTile.type === 'fog_zone' && this.currentWeather === 'fog') {
      modifier += 15;
    }

    if (this.lightningFlashActive) {
      modifier -= this.weatherConfig.weather_effects.lightning_flash.stealth_penalty;
    }

    if (player.is_prone) {
      modifier += 10;
    }

    return modifier;
  }

  getEnemyDetectionModifier() {
    const weatherData = this.weatherTypes[this.currentWeather];
    let modifier = weatherData.enemy_detection_modifier || 1.0;

    if (this.lightningFlashActive) {
      modifier *= 1.5;
    }

    return modifier;
  }

  getMovementNoiseModifier() {
    const weatherData = this.weatherTypes[this.currentWeather];
    return weatherData.movement_noise_modifier || 1.0;
  }

  getViewRadiusModifier() {
    const weatherData = this.weatherTypes[this.currentWeather];
    return 1 - (weatherData.view_radius_penalty || 0) / 10;
  }

  getSoundPropagationModifier() {
    const weatherData = this.weatherTypes[this.currentWeather];
    return weatherData.sound_propagation || 1.0;
  }

  getVisibilityModifier() {
    const weatherData = this.weatherTypes[this.currentWeather];
    return weatherData.visibility_modifier || 1.0;
  }

  getMovementSpeedModifier() {
    const weatherData = this.weatherTypes[this.currentWeather];
    return 1 - (weatherData.movement_speed_penalty || 0);
  }

  canPlayerHearSound(listenerX, listenerY, soundX, soundY, baseVolume) {
    const distance = Math.sqrt(
      Math.pow(listenerX - soundX, 2) + Math.pow(listenerY - soundY, 2)
    );
    const propagation = this.getSoundPropagationModifier();
    const effectiveRange = baseVolume * propagation;

    return distance <= effectiveRange;
  }

  canEnemySeePlayer(enemy, player, map) {
    const visibility = this.getVisibilityModifier();
    const detectionModifier = this.getEnemyDetectionModifier();

    const baseDistance = Math.sqrt(
      Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2)
    );

    const effectiveDetectionRange = enemy.detection_range * visibility * detectionModifier;

    return baseDistance <= effectiveDetectionRange;
  }

  getWeatherForecast() {
    const transitions = this.weatherTransitions[this.currentWeather] || ['clear'];
    return transitions.map(w => ({
      type: w,
      name: this.weatherTypes[w].name,
      probability: 1 / transitions.length
    }));
  }

  getWeatherEffectsList() {
    return Object.keys(this.weatherTypes).map(key => ({
      type: key,
      name: this.weatherTypes[key].name,
      description: this.getWeatherDescription(key)
    }));
  }

  getWeatherDescription(weatherType) {
    const w = this.weatherTypes[weatherType];
    if (!w) return '';

    const effects = [];
    if (w.stealth_modifier > 0) effects.push(`潜行+${w.stealth_modifier}`);
    if (w.stealth_modifier < 0) effects.push(`潜行${w.stealth_modifier}`);
    if (w.visibility_modifier < 1) effects.push(`能见度${Math.round(w.visibility_modifier * 100)}%`);
    if (w.environmental_damage > 0) effects.push(`环境伤害${w.environmental_damage}/s`);
    if (w.radiation_damage > 0) effects.push(`辐射伤害${w.radiation_damage}/s`);
    if (w.toxic_damage > 0) effects.push(`毒性伤害${w.toxic_damage}/s`);

    return effects.join('，');
  }

  getTimeOfDayModifier(timeOfDay) {
    const todEffects = this.timeOfDayEffects[timeOfDay];
    return todEffects || this.timeOfDayEffects.day;
  }

  getCombinedStealthModifier(player, currentTile, timeOfDay) {
    let modifier = this.getStealthModifier(player, currentTile);
    const todEffects = this.getTimeOfDayModifier(timeOfDay);
    modifier += todEffects.stealth_modifier || 0;
    return Math.max(-50, Math.min(50, modifier));
  }

  getCombinedDetectionModifier(timeOfDay) {
    let modifier = this.getEnemyDetectionModifier();
    const todEffects = this.getTimeOfDayModifier(timeOfDay);
    modifier *= todEffects.enemy_detection_modifier || 1.0;
    return Math.max(0.1, modifier);
  }

  getCombinedVisibility(timeOfDay) {
    let visibility = this.getVisibilityModifier();
    const todEffects = this.getTimeOfDayModifier(timeOfDay);
    visibility *= todEffects.visibility_modifier || 1.0;
    return Math.max(0.1, visibility);
  }

  getModifiedPlayerStealth(player, baseStealth) {
    const stealthModifier = this.getStealthModifier(player, null);
    return Math.max(0, Math.min(100, baseStealth + stealthModifier));
  }

  getModifiedEnemyDetection(enemy) {
    const detectionModifier = this.getEnemyDetectionModifier();
    return {
      ...enemy,
      detection_range: enemy.detection_range * detectionModifier
    };
  }

  getWeatherState() {
    const weatherInfo = this.getCurrentWeatherInfo();
    return {
      type: this.currentWeather,
      name: weatherInfo.name,
      visibility: this.getVisibilityModifier(),
      stealthModifier: weatherInfo.stealth_modifier || 0,
      detectionModifier: this.getEnemyDetectionModifier(),
      movementModifier: this.getMovementSpeedModifier(),
      remainingTime: weatherInfo.remainingTime,
      lightningFlash: this.lightningFlashActive,
      forecast: this.getWeatherForecast()
    };
  }

  update(deltaTime) {
    const elapsed = Date.now() - this.weatherStartTime;

    if (elapsed >= this.weatherDuration) {
      this.transitionWeather();
    }

    if (this.lightningFlashActive && Date.now() >= this.lightningFlashEndTime) {
      this.lightningFlashActive = false;
    }

    return this.getCurrentWeatherInfo();
  }
}

module.exports = WeatherSystem;
