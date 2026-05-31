const fs = require('fs');
const path = require('path');

class ItemSpawner {
  constructor() {
    this.itemConfig = this.loadConfig('item_config.json');
    this.itemTypes = this.itemConfig.item_types;
    this.spawnRules = this.itemConfig.spawn_rules;
    this._itemIdCounter = 0;
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  spawnInitialItems(map) {
    if (!map || map.length === 0 || !map[0]) return map;
    
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        const tile = map[y][x];
        if (!tile) continue;
        if (!tile.items) tile.items = [];
        
        if (tile.passable && !tile.is_spawn) {
          const itemCount = Math.floor(Math.random() * (this.spawnRules.max_items_per_tile + 1));
          for (let i = 0; i < itemCount; i++) {
            const item = this.generateRandomItem(tile);
            if (item && !this.hasDuplicateItem(tile, item)) {
              tile.items.push(item);
            }
          }
        }
      }
    }
    return map;
  }

  generateRandomItem(tile) {
    const itemKeys = Object.keys(this.itemTypes);
    const weightedItems = [];

    for (const key of itemKeys) {
      const item = this.itemTypes[key];
      const spawnChance = item.spawn_chance * this.getTileSpawnModifier(tile);
      if (Math.random() < spawnChance) {
        weightedItems.push({ key, weight: item.weight });
      }
    }

    if (weightedItems.length === 0) return null;

    const totalWeight = weightedItems.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const weighted of weightedItems) {
      random -= weighted.weight;
      if (random <= 0) {
        return this.createItemInstance(weighted.key, tile);
      }
    }
    return null;
  }

  getTileSpawnModifier(tile) {
    switch (tile.type) {
      case 'abandoned_building': return 2.0;
      case 'rubble': return 1.5;
      case 'radiation_zone': return 0.3;
      case 'trap': return 0.5;
      default: return 1.0;
    }
  }

  createItemInstance(itemType, tile) {
    const template = this.itemTypes[itemType];
    const isHidden = Math.random() < this.spawnRules.hidden_chance;
    this._itemIdCounter++;
    
    return {
      id: `item_${Date.now()}_${this._itemIdCounter}_${Math.random().toString(36).substr(2, 9)}`,
      type: itemType,
      name: template.name,
      item_type: template.type,
      rarity: template.rarity,
      effect: template.effect,
      hidden: isHidden,
      detection_required: template.hidden_detection_required,
      detected: !isHidden,
      x: tile.x,
      y: tile.y
    };
  }

  hasDuplicateItem(tile, newItem) {
    if (!tile.items || tile.items.length === 0) return false;
    const sameTypeCount = tile.items.filter(item => item.type === newItem.type).length;
    return sameTypeCount >= 2;
  }

  respawnItems(map, interval = 60000) {
    const respawned = [];
    if (!map || map.length === 0 || !map[0]) return respawned;
    
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[0].length; x++) {
        const tile = map[y][x];
        if (!tile || !tile.items) continue;
        
        if (tile.passable && tile.items.length < this.spawnRules.max_items_per_tile) {
          if (Math.random() < 0.1) {
            const item = this.generateRandomItem(tile);
            if (item && !this.hasDuplicateItem(tile, item)) {
              tile.items.push(item);
              respawned.push(item);
            }
          }
        }
      }
    }
    return respawned;
  }

  pickupItem(player, item, tile) {
    if (!player || !item || !tile || !tile.items) {
      return { success: false, reason: '无效参数' };
    }
    
    if (!item.detected && player.perception < item.detection_required) {
      return { success: false, reason: '无法发现隐藏物品' };
    }

    const itemIndex = tile.items.findIndex(i => i.id === item.id);
    if (itemIndex === -1) {
      return { success: false, reason: '物品不存在' };
    }

    tile.items.splice(itemIndex, 1);
    if (!player.inventory) player.inventory = [];
    player.inventory.push(item);
    
    this.applyItemEffect(player, item);

    return { success: true, item, player };
  }

  applyItemEffect(player, item) {
    const effect = item.effect;
    if (effect.heal) {
      player.health = Math.min(player.max_health, player.health + effect.heal);
    }
    if (effect.stealth_bonus) {
      player.stealth_gear = (player.stealth_gear || 0) + effect.stealth_bonus;
    }
    if (effect.radiation_resist) {
      player.radiation_resist = (player.radiation_resist || 0) + effect.radiation_resist;
    }
    if (effect.reveal_area) {
      player.view_bonus = (player.view_bonus || 0) + effect.reveal_area;
    }
    if (effect.score) {
      player.score = (player.score || 0) + effect.score;
    }
    if (effect.ammo) {
      player.ammo = (player.ammo || 0) + effect.ammo;
    }
    if (effect.unlock) {
      player.has_key = true;
    }
  }

  searchForHiddenItems(player, tile) {
    const found = [];
    if (!player || !tile || !tile.items) return found;
    
    for (const item of tile.items) {
      if (item.hidden && !item.detected) {
        if (player.perception >= item.detection_required) {
          item.detected = true;
          found.push(item);
        } else if (item.detection_required > 0 && Math.random() < player.perception / item.detection_required) {
          item.detected = true;
          found.push(item);
        }
      }
    }
    return found;
  }
}

module.exports = ItemSpawner;
