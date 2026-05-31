const { uIOhook, UiohookKey } = require('uiohook-napi');
const activeWin = require('active-win');
const robot = require('robotjs');
const dpiManager = require('../utils/DPIManager');

class GlobalHook {
  constructor() {
    this.listeners = {
      mousedown: [],
      mouseup: [],
      mousemove: [],
      wheel: [],
      keydown: [],
      keyup: [],
      windowChange: []
    };
    this.isRunning = false;
    this.currentWindow = null;
    this.windowCheckInterval = null;
    this.keyCodeMap = this._buildKeyCodeMap();
  }

  _buildKeyCodeMap() {
    const map = {};
    for (const [name, code] of Object.entries(UiohookKey)) {
      map[code] = name;
    }
    return map;
  }

  start() {
    if (this.isRunning) return;
    
    uIOhook.on('mousedown', (e) => this._handleMouseDown(e));
    uIOhook.on('mouseup', (e) => this._handleMouseUp(e));
    uIOhook.on('mousemove', (e) => this._handleMouseMove(e));
    uIOhook.on('wheel', (e) => this._handleWheel(e));
    uIOhook.on('keydown', (e) => this._handleKeyDown(e));
    uIOhook.on('keyup', (e) => this._handleKeyUp(e));

    uIOhook.start();
    this.isRunning = true;

    this._startWindowMonitoring();
  }

  stop() {
    if (!this.isRunning) return;

    uIOhook.removeAllListeners();
    uIOhook.stop();
    this.isRunning = false;

    if (this.windowCheckInterval) {
      clearInterval(this.windowCheckInterval);
      this.windowCheckInterval = null;
    }
  }

  _startWindowMonitoring() {
    this._checkWindowChange();
    this.windowCheckInterval = setInterval(() => {
      this._checkWindowChange();
    }, 500);
  }

  async _checkWindowChange() {
    try {
      const win = await activeWin();
      if (win) {
        const windowInfo = {
          title: win.title,
          owner: win.owner.name,
          processId: win.processId,
          bounds: win.bounds
        };

        if (!this.currentWindow || 
            this.currentWindow.title !== windowInfo.title || 
            this.currentWindow.owner !== windowInfo.owner) {
          this.currentWindow = windowInfo;
          this._emit('windowChange', {
            window: windowInfo,
            timestamp: Date.now()
          });
        }
      }
    } catch (err) {
      console.error('Error checking window:', err);
    }
  }

  _handleMouseDown(e) {
    const physical = dpiManager.logicalToPhysical(e.x, e.y);
    this._emit('mousedown', {
      x: physical.x,
      y: physical.y,
      logicalX: e.x,
      logicalY: e.y,
      button: e.button,
      clicks: e.clicks,
      timestamp: Date.now()
    });
  }

  _handleMouseUp(e) {
    const physical = dpiManager.logicalToPhysical(e.x, e.y);
    this._emit('mouseup', {
      x: physical.x,
      y: physical.y,
      logicalX: e.x,
      logicalY: e.y,
      button: e.button,
      timestamp: Date.now()
    });
  }

  _handleMouseMove(e) {
    const physical = dpiManager.logicalToPhysical(e.x, e.y);
    this._emit('mousemove', {
      x: physical.x,
      y: physical.y,
      logicalX: e.x,
      logicalY: e.y,
      timestamp: Date.now()
    });
  }

  _handleWheel(e) {
    const physical = dpiManager.logicalToPhysical(e.x, e.y);
    this._emit('wheel', {
      x: physical.x,
      y: physical.y,
      logicalX: e.x,
      logicalY: e.y,
      amount: e.amount,
      rotation: e.rotation,
      direction: e.direction,
      timestamp: Date.now()
    });
  }

  _handleKeyDown(e) {
    const keyName = this.keyCodeMap[e.keycode] || `KEY_${e.keycode}`;
    this._emit('keydown', {
      keycode: e.keycode,
      keyName: keyName,
      rawcode: e.rawcode,
      timestamp: Date.now()
    });
  }

  _handleKeyUp(e) {
    const keyName = this.keyCodeMap[e.keycode] || `KEY_${e.keycode}`;
    this._emit('keyup', {
      keycode: e.keycode,
      keyName: keyName,
      rawcode: e.rawcode,
      timestamp: Date.now()
    });
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in ${event} listener:`, err);
        }
      });
    }
  }

  getMousePosition() {
    return robot.getMousePos();
  }

  getScreenSize() {
    return robot.getScreenSize();
  }

  getKeyName(keycode) {
    return this.keyCodeMap[keycode] || `KEY_${keycode}`;
  }

  static getKeyCode(keyName) {
    return UiohookKey[keyName];
  }
}

module.exports = GlobalHook;
