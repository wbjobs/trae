const MESSAGE_TYPES = {
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  PLAYER_MOVE: 'player_move',
  PLAYER_ACTION: 'player_action',
  STATE_SYNC: 'state_sync',
  DELTA_SYNC: 'delta_sync',
  ITEM_PICKUP: 'item_pickup',
  DANGER_ALERT: 'danger_alert',
  ENVIRONMENT_CHANGE: 'environment_change',
  CHAT: 'chat',
  PING: 'ping',
  PONG: 'pong',
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  ERROR: 'error'
};

class Protocol {
  static createMessage(type, data = {}) {
    return JSON.stringify({
      type,
      timestamp: Date.now(),
      data
    });
  }

  static parseMessage(message) {
    try {
      return JSON.parse(message);
    } catch (e) {
      return { type: 'error', data: { message: 'Invalid message format' } };
    }
  }

  static createPlayerJoin(player) {
    return this.createMessage(MESSAGE_TYPES.PLAYER_JOIN, {
      playerId: player.id,
      name: player.name,
      x: player.x,
      y: player.y
    });
  }

  static createPlayerLeave(playerId) {
    return this.createMessage(MESSAGE_TYPES.PLAYER_LEAVE, { playerId });
  }

  static createPlayerMove(playerId, x, y, posture) {
    return this.createMessage(MESSAGE_TYPES.PLAYER_MOVE, {
      playerId,
      x,
      y,
      posture,
      timestamp: Date.now()
    });
  }

  static createPlayerAction(playerId, action, payload = {}) {
    return this.createMessage(MESSAGE_TYPES.PLAYER_ACTION, {
      playerId,
      action,
      payload,
      timestamp: Date.now()
    });
  }

  static createStateSync(state) {
    return this.createMessage(MESSAGE_TYPES.STATE_SYNC, state);
  }

  static createDeltaSync(delta) {
    return this.createMessage(MESSAGE_TYPES.DELTA_SYNC, delta);
  }

  static createItemPickup(playerId, item) {
    return this.createMessage(MESSAGE_TYPES.ITEM_PICKUP, {
      playerId,
      item
    });
  }

  static createDangerAlert(playerId, dangerLevel, source) {
    return this.createMessage(MESSAGE_TYPES.DANGER_ALERT, {
      playerId,
      dangerLevel,
      source,
      timestamp: Date.now()
    });
  }

  static createEnvironmentChange(event) {
    return this.createMessage(MESSAGE_TYPES.ENVIRONMENT_CHANGE, {
      event
    });
  }

  static createChat(playerId, message) {
    return this.createMessage(MESSAGE_TYPES.CHAT, {
      playerId,
      message,
      timestamp: Date.now()
    });
  }

  static createPing() {
    return this.createMessage(MESSAGE_TYPES.PING, { timestamp: Date.now() });
  }

  static createPong(pingTimestamp) {
    return this.createMessage(MESSAGE_TYPES.PONG, {
      pingTimestamp,
      pongTimestamp: Date.now()
    });
  }

  static createGameStart(config) {
    return this.createMessage(MESSAGE_TYPES.GAME_START, {
      config,
      startTime: Date.now()
    });
  }

  static createGameEnd(results) {
    return this.createMessage(MESSAGE_TYPES.GAME_END, {
      results,
      endTime: Date.now()
    });
  }

  static createError(message) {
    return this.createMessage(MESSAGE_TYPES.ERROR, { message });
  }
}

module.exports = { Protocol, MESSAGE_TYPES };
