const fs = require('fs');
const path = require('path');

class ClueSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.config = this.loadConfig('clue_config.json');
    this.clues = new Map();
    this.collectedClues = new Map();
    this.deductionProgress = new Map();
    this.unlockedRelics = new Set();
    this._clueIdCounter = 0;
    this._lastRespawnTime = Date.now();
  }

  loadConfig(filename) {
    const configPath = path.join(__dirname, '..', 'configs', filename);
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.error(`Failed to load clue config: ${error.message}`);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      clue_types: {
        document: { name: '文献残页', weight: 1, base_reward: { exp: 10, reputation: 5 } }
      },
      rarity_levels: {
        common: { name: '普通', multiplier: 1.0 }
      },
      deduction_rules: {
        max_deduction_level: 5,
        base_success_rate: 0.6
      },
      spawn_config: {
        base_count: 5,
        max_spawn_attempts: 20,
        spawn_on_tiles: ['ground']
      },
      relics: {}
    };
  }

  initialize(map) {
    if (!map || !map.tiles) return;
    
    this.clues.clear();
    this.collectedClues.clear();
    this.deductionProgress.clear();
    this.unlockedRelics.clear();
    
    const playerCount = this.gameState ? this.gameState.players.size : 1;
    const spawnConfig = this.config.spawn_config || {};
    const clueCount = Math.min(
      (spawnConfig.base_count || 5) + (spawnConfig.count_per_player || 1) * playerCount,
      spawnConfig.max_clues_on_map || 20
    );
    
    for (let i = 0; i < clueCount; i++) {
      this.spawnClue(map);
    }
  }

  spawnClue(map) {
    if (!map || !map.tiles) return null;
    
    const spawnConfig = this.config.spawn_config || {};
    const maxAttempts = spawnConfig.max_spawn_attempts || 20;
    const minDistance = spawnConfig.min_distance || 3;
    const allowedTiles = spawnConfig.spawn_on_tiles || ['ground'];
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.floor(Math.random() * map.width);
      const y = Math.floor(Math.random() * map.height);
      
      const tile = map.tiles[y]?.[x];
      if (!tile || !allowedTiles.includes(tile.type)) continue;
      
      const tooClose = Array.from(this.clues.values()).some(clue => {
        const dx = clue.x - x;
        const dy = clue.y - y;
        return Math.sqrt(dx * dx + dy * dy) < minDistance;
      });
      
      if (tooClose) continue;
      
      const clue = this.createClue(x, y);
      this.clues.set(clue.id, clue);
      return clue;
    }
    
    return null;
  }

  createClue(x, y) {
    const type = this.selectRandomClueType();
    const rarity = this.selectRandomRarity(type);
    const typeConfig = this.config.clue_types[type];
    const rarityConfig = this.config.rarity_levels[rarity];
    
    const fragmentCount = Math.floor(
      Math.random() * ((rarityConfig?.max_fragments || 3) - (rarityConfig?.min_fragments || 1) + 1)
    ) + (rarityConfig?.min_fragments || 1);
    
    return {
      id: `clue_${++this._clueIdCounter}`,
      type,
      rarity,
      x,
      y,
      fragmentCount,
      collected: false,
      spawnTime: Date.now(),
      data: {
        title: this.generateClueTitle(type, rarity),
        description: this.generateClueDescription(type, rarity),
        content: this.generateClueContent(type, rarity),
        timestamp: Math.floor(Math.random() * 1000)
      }
    };
  }

  selectRandomClueType() {
    const types = Object.entries(this.config.clue_types || {});
    if (types.length === 0) return 'document';
    
    const totalWeight = types.reduce((sum, [, config]) => sum + (config.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const [type, config] of types) {
      random -= (config.weight || 1);
      if (random <= 0) return type;
    }
    
    return types[0][0];
  }

  selectRandomRarity(clueType) {
    const typeConfig = this.config.clue_types[clueType];
    const weights = typeConfig?.rarity_weights || { common: 100 };
    
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = Math.random() * totalWeight;
    
    for (const [rarity, weight] of entries) {
      random -= weight;
      if (random <= 0) return rarity;
    }
    
    return 'common';
  }

  generateClueTitle(type, rarity) {
    const typeConfig = this.config.clue_types[type];
    const rarityConfig = this.config.rarity_levels[rarity];
    const typeName = typeConfig?.name || '线索';
    const rarityName = rarityConfig?.name || '';
    return `${rarityName}${typeName}`;
  }

  generateClueDescription(type, rarity) {
    const descriptions = {
      document: [
        '边缘泛黄的羊皮纸，上面写满了古老的文字',
        '残破的书页，依稀能辨认出部分内容',
        '保存完好的卷轴，墨迹依然清晰'
      ],
      artifact: [
        '沾满泥土的金属碎片，似乎是某个器物的一部分',
        '雕刻精美的饰品，散发着神秘的气息',
        '古老的工具，上面刻有奇怪的符号'
      ],
      inscription: [
        '石壁上的刻痕，记载着远古的信息',
        '石碑上的铭文，已经部分风化',
        '金属板上的文字，在微光下若隐若现'
      ],
      map_fragment: [
        '残破的地图一角，标注着模糊的方位',
        '羊皮地图残片，上面有奇怪的标记',
        '绘制在兽皮上的地图，边缘已经烧焦'
      ],
      trace: [
        '地上的脚印，似乎是前人留下的',
        '墙壁上的划痕，像是某种标记',
        '灰烬中的余迹，暗示着曾经的活动'
      ]
    };
    
    const typeDescriptions = descriptions[type] || descriptions.document;
    return typeDescriptions[Math.floor(Math.random() * typeDescriptions.length)];
  }

  generateClueContent(type, rarity) {
    const rarityMultiplier = this.config.rarity_levels[rarity]?.multiplier || 1;
    const complexity = Math.floor(rarityMultiplier * 3);
    
    const contents = {
      document: [
        '...于神庙深处，藏有远古的秘密...',
        '...当星辰对齐，通道将开启...',
        '...守护者的考验，唯有智者能通过...',
        '...三件神器，解锁最终的真相...',
        '...时间的长河中，遗迹沉睡千年...'
      ],
      artifact: [
        '这个器物似乎是某种仪式用品',
        '上面的符文与已知的文明都不相符',
        '手感温润，蕴含着某种能量',
        '制作工艺精湛，非比寻常',
        '隐约能感受到它的脉动'
      ],
      inscription: [
        '「来者止步，此处为禁地」',
        '「唯有心存敬畏者，方能得见真容」',
        '「时间在此停滞，永恒在此驻足」',
        '「寻找散落的碎片，拼凑完整的真相」',
        '「王者之证，在此长眠」'
      ],
      map_fragment: [
        '地图上标注了几个重要地点',
        'X标记的位置似乎是入口',
        '虚线连接的路径隐藏着危险',
        '边缘的注释提到了守护者',
        '看起来还有更多的部分等待发现'
      ],
      trace: [
        '这里似乎有人来过',
        '痕迹还很新鲜，要小心',
        '看起来是紧急撤离的迹象',
        '留下的物品暗示着什么',
        '这里曾经发生过什么'
      ]
    };
    
    const typeContents = contents[type] || contents.document;
    const selectedContents = [];
    for (let i = 0; i < Math.min(complexity, typeContents.length); i++) {
      const idx = Math.floor(Math.random() * typeContents.length);
      selectedContents.push(typeContents[idx]);
    }
    
    return selectedContents.join(' ');
  }

  collectClue(playerId, clueId) {
    const clue = this.clues.get(clueId);
    if (!clue || clue.collected) {
      return { success: false, reason: 'clue_not_found_or_collected' };
    }
    
    const player = this.gameState?.players?.get?.(playerId);
    if (!player) {
      return { success: false, reason: 'player_not_found' };
    }
    
    const distance = this.getDistance(player.x, player.y, clue.x, clue.y);
    if (distance > 1.5) {
      return { success: false, reason: 'too_far' };
    }
    
    clue.collected = true;
    clue.collectedBy = playerId;
    clue.collectedAt = Date.now();
    
    if (!this.collectedClues.has(playerId)) {
      this.collectedClues.set(playerId, []);
    }
    this.collectedClues.get(playerId).push(clue);
    
    const reward = this.calculateReward(clue);
    
    return {
      success: true,
      clue,
      reward,
      message: `发现了${this.config.rarity_levels[clue.rarity]?.name || ''}${this.config.clue_types[clue.type]?.name || '线索'}`
    };
  }

  calculateReward(clue) {
    const typeConfig = this.config.clue_types[clue.type];
    const rarityConfig = this.config.rarity_levels[clue.rarity];
    
    const baseExp = typeConfig?.base_reward?.exp || 10;
    const baseRep = typeConfig?.base_reward?.reputation || 5;
    const multiplier = rarityConfig?.multiplier || 1;
    
    return {
      exp: Math.floor(baseExp * multiplier),
      reputation: Math.floor(baseRep * multiplier),
      fragments: clue.fragmentCount
    };
  }

  getCluesAtPosition(x, y) {
    return Array.from(this.clues.values()).filter(clue => 
      !clue.collected && Math.abs(clue.x - x) <= 1 && Math.abs(clue.y - y) <= 1
    );
  }

  getCollectedClues(playerId) {
    return this.collectedClues.get(playerId) || [];
  }

  getClueStats(playerId) {
    const collected = this.getCollectedClues(playerId);
    const stats = {
      total: collected.length,
      byType: {},
      byRarity: {},
      fragments: 0
    };
    
    for (const clue of collected) {
      stats.byType[clue.type] = (stats.byType[clue.type] || 0) + 1;
      stats.byRarity[clue.rarity] = (stats.byRarity[clue.rarity] || 0) + 1;
      stats.fragments += clue.fragmentCount;
    }
    
    return stats;
  }

  startDeduction(playerId, clueIds) {
    const collected = this.getCollectedClues(playerId);
    const selectedClues = collected.filter(c => clueIds.includes(c.id));
    
    if (selectedClues.length < 2) {
      return { success: false, reason: 'not_enough_clues' };
    }
    
    const deductionId = `deduction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const analysis = this.analyzeClueRelationships(selectedClues);
    const successRate = this.calculateDeductionSuccessRate(selectedClues, analysis);
    const potentialRewards = this.predictDeductionRewards(selectedClues, analysis);
    
    const deduction = {
      id: deductionId,
      playerId,
      clueIds,
      clues: selectedClues,
      analysis,
      successRate,
      potentialRewards,
      startedAt: Date.now(),
      completed: false
    };
    
    this.deductionProgress.set(deductionId, deduction);
    
    return {
      success: true,
      deductionId,
      analysis,
      successRate,
      potentialRewards
    };
  }

  analyzeClueRelationships(clues) {
    const analysis = {
      sameTypeCount: 0,
      sameRarityCount: 0,
      locationCluster: false,
      timeSequence: false,
      totalBonus: 0,
      deductions: []
    };
    
    const typeCounts = {};
    const rarityCounts = {};
    
    for (const clue of clues) {
      typeCounts[clue.type] = (typeCounts[clue.type] || 0) + 1;
      rarityCounts[clue.rarity] = (rarityCounts[clue.rarity] || 0) + 1;
    }
    
    analysis.sameTypeCount = Object.values(typeCounts).filter(c => c >= 2).length;
    analysis.sameRarityCount = Object.values(rarityCounts).filter(c => c >= 2).length;
    
    if (clues.length >= 2) {
      let maxDistance = 0;
      for (let i = 0; i < clues.length; i++) {
        for (let j = i + 1; j < clues.length; j++) {
          const dist = this.getDistance(clues[i].x, clues[i].y, clues[j].x, clues[j].y);
          maxDistance = Math.max(maxDistance, dist);
        }
      }
      analysis.locationCluster = maxDistance <= 8;
    }
    
    const sortedByTime = [...clues].sort((a, b) => (a.data.timestamp || 0) - (b.data.timestamp || 0));
    let isSequence = true;
    for (let i = 1; i < sortedByTime.length; i++) {
      const diff = (sortedByTime[i].data.timestamp || 0) - (sortedByTime[i - 1].data.timestamp || 0);
      if (diff < 0 || diff > 500) {
        isSequence = false;
        break;
      }
    }
    analysis.timeSequence = isSequence && clues.length >= 3;
    
    const rules = this.config.deduction_rules || {};
    if (analysis.sameTypeCount > 0) {
      analysis.totalBonus += analysis.sameTypeCount * (rules.same_type_bonus || 0.15);
      analysis.deductions.push(`发现${analysis.sameTypeCount}组相同类型线索，获得关联加成`);
    }
    if (analysis.sameRarityCount > 0) {
      analysis.totalBonus += analysis.sameRarityCount * (rules.same_rarity_bonus || 0.10);
      analysis.deductions.push(`发现${analysis.sameRarityCount}组相同稀有度线索，获得匹配加成`);
    }
    if (analysis.locationCluster) {
      analysis.totalBonus += (rules.location_cluster_bonus || 0.20);
      analysis.deductions.push('线索来自同一区域，获得地域关联加成');
    }
    if (analysis.timeSequence) {
      analysis.totalBonus += (rules.time_sequence_bonus || 0.25);
      analysis.deductions.push('线索形成时间序列，获得逻辑链加成');
    }
    
    return analysis;
  }

  calculateDeductionSuccessRate(clues, analysis) {
    const rules = this.config.deduction_rules || {};
    let baseRate = rules.base_success_rate || 0.6;
    
    const rarityMultiplier = clues.reduce((sum, clue) => {
      return sum + (this.config.rarity_levels[clue.rarity]?.multiplier || 1);
    }, 0) / clues.length;
    
    baseRate *= Math.min(rarityMultiplier, 2);
    baseRate += analysis.totalBonus;
    
    return Math.min(baseRate, 0.95);
  }

  predictDeductionRewards(clues, analysis) {
    const totalExp = clues.reduce((sum, clue) => {
      return sum + (this.config.clue_types[clue.type]?.base_reward?.exp || 10) * 
                   (this.config.rarity_levels[clue.rarity]?.multiplier || 1);
    }, 0);
    
    const totalRep = clues.reduce((sum, clue) => {
      return sum + (this.config.clue_types[clue.type]?.base_reward?.reputation || 5) * 
                   (this.config.rarity_levels[clue.rarity]?.multiplier || 1);
    }, 0);
    
    const bonusMultiplier = 1 + analysis.totalBonus;
    
    return {
      minExp: Math.floor(totalExp * 0.5 * bonusMultiplier),
      maxExp: Math.floor(totalExp * 1.5 * bonusMultiplier),
      minReputation: Math.floor(totalRep * 0.5 * bonusMultiplier),
      maxReputation: Math.floor(totalRep * 1.5 * bonusMultiplier),
      possibleRelics: this.findMatchingRelics(clues)
    };
  }

  findMatchingRelics(clues) {
    const relics = this.config.relics || {};
    const clueTypeCounts = {};
    
    for (const clue of clues) {
      clueTypeCounts[clue.type] = (clueTypeCounts[clue.type] || 0) + 1;
    }
    
    const matching = [];
    for (const [relicId, relic] of Object.entries(relics)) {
      if (this.unlockedRelics.has(relicId)) continue;
      
      const required = relic.required_clues || {};
      let matches = true;
      let matchCount = 0;
      let totalRequired = 0;
      
      for (const [type, count] of Object.entries(required)) {
        totalRequired += count;
        if ((clueTypeCounts[type] || 0) >= count) {
          matchCount += count;
        } else {
          matches = false;
        }
      }
      
      matching.push({
        relicId,
        name: relic.name,
        description: relic.description,
        progress: Math.floor((matchCount / totalRequired) * 100),
        canUnlock: matches
      });
    }
    
    return matching;
  }

  completeDeduction(playerId, deductionId) {
    const deduction = this.deductionProgress.get(deductionId);
    if (!deduction || deduction.completed) {
      return { success: false, reason: 'deduction_not_found_or_completed' };
    }
    
    if (deduction.playerId !== playerId) {
      return { success: false, reason: 'not_your_deduction' };
    }
    
    const roll = Math.random();
    const success = roll <= deduction.successRate;
    
    deduction.completed = true;
    deduction.completedAt = Date.now();
    deduction.result = success;
    deduction.roll = roll;
    
    let rewards = null;
    let unlockedRelic = null;
    
    if (success) {
      rewards = {
        exp: Math.floor(
          deduction.potentialRewards.minExp + 
          Math.random() * (deduction.potentialRewards.maxExp - deduction.potentialRewards.minExp)
        ),
        reputation: Math.floor(
          deduction.potentialRewards.minReputation + 
          Math.random() * (deduction.potentialRewards.maxReputation - deduction.potentialRewards.minReputation)
        )
      };
      
      const unlockable = deduction.potentialRewards.possibleRelics.filter(r => r.canUnlock);
      if (unlockable.length > 0) {
        const relic = unlockable[Math.floor(Math.random() * unlockable.length)];
        this.unlockedRelics.add(relic.relicId);
        unlockedRelic = relic;
      }
    }
    
    return {
      success: true,
      deductionSuccess: success,
      rewards,
      unlockedRelic,
      message: success ? '推演成功！' : '推演失败，线索之间的关联不够清晰'
    };
  }

  checkRelicUnlock(playerId, relicId) {
    if (this.unlockedRelics.has(relicId)) {
      return { success: false, reason: 'already_unlocked' };
    }
    
    const relic = this.config.relics?.[relicId];
    if (!relic) {
      return { success: false, reason: 'relic_not_found' };
    }
    
    const collected = this.getCollectedClues(playerId);
    const clueTypeCounts = {};
    for (const clue of collected) {
      clueTypeCounts[clue.type] = (clueTypeCounts[clue.type] || 0) + 1;
    }
    
    const required = relic.required_clues || {};
    for (const [type, count] of Object.entries(required)) {
      if ((clueTypeCounts[type] || 0) < count) {
        return {
          success: false,
          reason: 'insufficient_clues',
          required,
          current: clueTypeCounts
        };
      }
    }
    
    this.unlockedRelics.add(relicId);
    
    return {
      success: true,
      relic,
      reward: relic.reward
    };
  }

  update(deltaTime, map) {
    const spawnConfig = this.config.spawn_config || {};
    if (!spawnConfig.respawn_enabled) return;
    
    const now = Date.now();
    if (now - this._lastRespawnTime < (spawnConfig.respawn_interval || 120000)) return;
    
    this._lastRespawnTime = now;
    
    const collectedCount = Array.from(this.clues.values()).filter(c => c.collected).length;
    const activeCount = this.clues.size - collectedCount;
    const maxClues = spawnConfig.max_clues_on_map || 20;
    
    if (activeCount < maxClues * 0.5) {
      const toSpawn = Math.min(
        Math.floor(collectedCount * 0.5),
        maxClues - activeCount
      );
      
      for (let i = 0; i < toSpawn; i++) {
        this.spawnClue(map);
      }
    }
    
    const nowTime = Date.now();
    const cluesToDelete = [];
    for (const [clueId, clue] of this.clues) {
      if (clue.collected) continue;
      
      const typeConfig = this.config.clue_types[clue.type];
      const decayRate = typeConfig?.decay_rate || 0.01;
      const age = nowTime - clue.spawnTime;
      const decayChance = decayRate * (age / 60000);
      
      if (Math.random() < decayChance) {
        cluesToDelete.push(clueId);
      }
    }
    
    for (const clueId of cluesToDelete) {
      this.clues.delete(clueId);
    }
  }

  getDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getState() {
    return {
      activeClues: Array.from(this.clues.values()).filter(c => !c.collected),
      unlockedRelics: Array.from(this.unlockedRelics),
      totalCluesCollected: Array.from(this.collectedClues.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  getPlayerDeductions(playerId) {
    return Array.from(this.deductionProgress.values())
      .filter(d => d.playerId === playerId)
      .map(d => ({
        id: d.id,
        successRate: d.successRate,
        completed: d.completed,
        result: d.result,
        startedAt: d.startedAt,
        completedAt: d.completedAt
      }));
  }
}

module.exports = ClueSystem;
