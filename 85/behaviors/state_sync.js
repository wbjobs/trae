class StateSync {
  constructor() {
    this.stateVersion = 0;
    this.deltaHistory = [];
    this.maxHistorySize = 100;
  }

  generateFullState(gameState) {
    return {
      type: 'full_state',
      version: ++this.stateVersion,
      timestamp: Date.now(),
      data: {
        map: this.serializeMap(gameState.map),
        players: this.serializePlayers(gameState.players),
        enemies: this.serializeEnemies(gameState.enemies),
        items: this.serializeItems(gameState.items),
        environmental_effects: gameState.environmentalEffects || {},
        game_time: gameState.gameTime || 0,
        game_phase: gameState.gamePhase || 'playing'
      }
    };
  }

  generateDeltaState(previousState, currentState) {
    const delta = {
      type: 'delta_state',
      version: ++this.stateVersion,
      timestamp: Date.now(),
      changes: {}
    };

    if (previousState.gameTime !== currentState.gameTime) {
      delta.changes.game_time = currentState.gameTime;
    }

    const playerChanges = this.getPlayerChanges(
      previousState.players,
      currentState.players
    );
    if (Object.keys(playerChanges).length > 0) {
      delta.changes.players = playerChanges;
    }

    const enemyChanges = this.getEnemyChanges(
      previousState.enemies,
      currentState.enemies
    );
    if (Object.keys(enemyChanges).length > 0) {
      delta.changes.enemies = enemyChanges;
    }

    const tileChanges = this.getTileChanges(
      previousState.map,
      currentState.map
    );
    if (tileChanges.length > 0) {
      delta.changes.tiles = tileChanges;
    }

    const itemChanges = this.getItemChanges(
      previousState.items,
      currentState.items
    );
    if (itemChanges.added.length > 0 || itemChanges.removed.length > 0) {
      delta.changes.items = itemChanges;
    }

    this.deltaHistory.push(delta);
    if (this.deltaHistory.length > this.maxHistorySize) {
      this.deltaHistory.shift();
    }

    return delta;
  }

  serializeMap(mapData) {
    if (!mapData || !mapData.tiles) return null;
    return {
      width: mapData.width,
      height: mapData.height,
      seed: mapData.seed,
      spawn_points: mapData.spawnPoints,
      tiles: mapData.tiles.map(row =>
        row.map(tile => ({
          id: tile.id,
          x: tile.x,
          y: tile.y,
          type: tile.type,
          passable: tile.passable,
          current_danger: tile.current_danger,
          items: tile.items.length,
          explored: tile.explored,
          has_patrol: tile.has_patrol
        }))
      )
    };
  }

  serializePlayers(players) {
    if (!players) return [];
    const playerArray = Array.isArray(players) ? players : Array.from(players.values());
    return playerArray.map(player => ({
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      health: player.health,
      max_health: player.max_health,
      stealth: player.current_stealth,
      posture: player.posture,
      inventory: player.inventory ? player.inventory.length : 0,
      score: player.score || 0,
      is_alive: player.health > 0,
      detection_level: player.detection_level || 'hidden'
    }));
  }

  serializeEnemies(enemies) {
    if (!enemies || !Array.isArray(enemies)) return [];
    return enemies.map(enemy => ({
      id: enemy.id,
      type: enemy.type,
      x: enemy.x,
      y: enemy.y,
      awareness: enemy.awareness,
      state: enemy.state,
      threat_level: enemy.threat_level
    }));
  }

  serializeItems(items) {
    if (!items || !Array.isArray(items)) return [];
    return items.map(item => ({
      id: item.id,
      type: item.type,
      x: item.x,
      y: item.y,
      detected: item.detected
    }));
  }

  getPlayerChanges(oldPlayers, newPlayers) {
    const changes = {};
    const oldArray = Array.isArray(oldPlayers) ? oldPlayers : (oldPlayers ? Array.from(oldPlayers.values()) : []);
    const newArray = Array.isArray(newPlayers) ? newPlayers : (newPlayers ? Array.from(newPlayers.values()) : []);
    const oldMap = new Map(oldArray.map(p => [p.id, p]));
    
    for (const newPlayer of newArray) {
      const oldPlayer = oldMap.get(newPlayer.id);
      if (!oldPlayer) {
        changes[newPlayer.id] = { action: 'add', player: this.serializePlayers([newPlayer])[0] };
      } else if (this.hasPlayerChanged(oldPlayer, newPlayer)) {
        changes[newPlayer.id] = { action: 'update', player: this.serializePlayers([newPlayer])[0] };
      }
      oldMap.delete(newPlayer.id);
    }
    
    for (const [id] of oldMap) {
      changes[id] = { action: 'remove' };
    }
    
    return changes;
  }

  hasPlayerChanged(oldPlayer, newPlayer) {
    return oldPlayer.x !== newPlayer.x ||
           oldPlayer.y !== newPlayer.y ||
           oldPlayer.health !== newPlayer.health ||
           oldPlayer.posture !== newPlayer.posture ||
           oldPlayer.score !== newPlayer.score;
  }

  getEnemyChanges(oldEnemies, newEnemies) {
    const changes = {};
    const oldArray = Array.isArray(oldEnemies) ? oldEnemies : [];
    const newArray = Array.isArray(newEnemies) ? newEnemies : [];
    const oldMap = new Map(oldArray.map(e => [e.id, e]));
    
    for (const newEnemy of newArray) {
      const oldEnemy = oldMap.get(newEnemy.id);
      if (!oldEnemy) {
        changes[newEnemy.id] = { action: 'add', enemy: this.serializeEnemies([newEnemy])[0] };
      } else if (this.hasEnemyChanged(oldEnemy, newEnemy)) {
        changes[newEnemy.id] = { action: 'update', enemy: this.serializeEnemies([newEnemy])[0] };
      }
      oldMap.delete(newEnemy.id);
    }
    
    for (const [id] of oldMap) {
      changes[id] = { action: 'remove' };
    }
    
    return changes;
  }

  hasEnemyChanged(oldEnemy, newEnemy) {
    return oldEnemy.x !== newEnemy.x ||
           oldEnemy.y !== newEnemy.y ||
           oldEnemy.awareness !== newEnemy.awareness ||
           oldEnemy.state !== newEnemy.state;
  }

  getTileChanges(oldMap, newMap) {
    const changes = [];
    if (!oldMap || !oldMap.tiles || !newMap || !newMap.tiles) return changes;
    
    for (let y = 0; y < oldMap.tiles.length; y++) {
      for (let x = 0; x < oldMap.tiles[y].length; x++) {
        const oldTile = oldMap.tiles[y][x];
        const newTile = newMap.tiles[y][x];
        if (oldTile.current_danger !== newTile.current_danger ||
            oldTile.items.length !== newTile.items.length ||
            oldTile.type !== newTile.type) {
          changes.push({
            x,
            y,
            type: newTile.type,
            current_danger: newTile.current_danger,
            items_count: newTile.items.length
          });
        }
      }
    }
    return changes;
  }

  getItemChanges(oldItems, newItems) {
    const changes = { added: [], removed: [] };
    const oldMap = new Map(oldItems.map(i => [i.id, i]));
    
    for (const newItem of newItems) {
      if (!oldMap.has(newItem.id)) {
        changes.added.push(this.serializeItems([newItem])[0]);
      }
      oldMap.delete(newItem.id);
    }
    
    for (const [id] of oldMap) {
      changes.removed.push(id);
    }
    
    return changes;
  }

  applyDeltaState(currentState, delta) {
    if (!delta || !delta.changes) return currentState;
    
    const newState = { ...currentState };
    
    if (delta.changes.game_time !== undefined) {
      newState.gameTime = delta.changes.game_time;
    }
    
    if (delta.changes.players) {
      newState.players = this.applyPlayerChanges(newState.players, delta.changes.players);
    }
    
    if (delta.changes.enemies) {
      newState.enemies = this.applyEnemyChanges(newState.enemies, delta.changes.enemies);
    }
    
    if (delta.changes.tiles) {
      newState.map = this.applyTileChanges(newState.map, delta.changes.tiles);
    }
    
    if (delta.changes.items) {
      newState.items = this.applyItemChanges(newState.items, delta.changes.items);
    }
    
    return newState;
  }

  applyPlayerChanges(players, changes) {
    const playerArray = players || [];
    const playerMap = new Map(playerArray.map(p => [p.id, p]));
    
    for (const [id, change] of Object.entries(changes)) {
      if (change.action === 'add') {
        playerMap.set(id, change.player);
      } else if (change.action === 'update') {
        playerMap.set(id, { ...playerMap.get(id), ...change.player });
      } else if (change.action === 'remove') {
        playerMap.delete(id);
      }
    }
    
    return Array.from(playerMap.values());
  }

  applyEnemyChanges(enemies, changes) {
    const enemyArray = enemies || [];
    const enemyMap = new Map(enemyArray.map(e => [e.id, e]));
    
    for (const [id, change] of Object.entries(changes)) {
      if (change.action === 'add') {
        enemyMap.set(id, change.enemy);
      } else if (change.action === 'update') {
        enemyMap.set(id, { ...enemyMap.get(id), ...change.enemy });
      } else if (change.action === 'remove') {
        enemyMap.delete(id);
      }
    }
    
    return Array.from(enemyMap.values());
  }

  applyTileChanges(map, changes) {
    for (const change of changes) {
      if (map.tiles[change.y] && map.tiles[change.y][change.x]) {
        Object.assign(map.tiles[change.y][change.x], change);
      }
    }
    return map;
  }

  applyItemChanges(items, changes) {
    const itemArray = items || [];
    const itemMap = new Map(itemArray.map(i => [i.id, i]));
    
    for (const added of changes.added || []) {
      itemMap.set(added.id, added);
    }
    
    for (const removed of changes.removed || []) {
      itemMap.delete(removed);
    }
    
    return Array.from(itemMap.values());
  }

  getStateForPlayer(fullState, playerId) {
    const player = fullState.data.players.find(p => p.id === playerId);
    if (!player) return fullState;
    
    return {
      ...fullState,
      data: {
        ...fullState.data,
        players: fullState.data.players.filter(p => p.id === playerId),
        other_players: fullState.data.players.filter(p => p.id !== playerId).map(p => ({
          id: p.id,
          x: p.x,
          y: p.y,
          is_alive: p.is_alive
        }))
      }
    };
  }
}

module.exports = StateSync;
