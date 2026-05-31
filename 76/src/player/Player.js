const robot = require('robotjs');
const dpiManager = require('../utils/DPIManager');
const imageFinder = require('../vision/ImageFinder');

class Player {
  constructor() {
    this.isPlaying = false;
    this.isPaused = false;
    this.speed = 1;
    this.currentIndex = 0;
    this.script = null;
    this.variables = {};
    this.recordedScaleFactor = 1;
    this.onEventCallback = null;
    this.onStatusChange = null;
    this.onCompleteCallback = null;
    this.stopRequested = false;
    this.pauseResolve = null;
  }

  async play(script) {
    if (this.isPlaying) return;

    this.script = script;
    this.isPlaying = true;
    this.isPaused = false;
    this.stopRequested = false;
    this.currentIndex = 0;
    this.variables = { ...script.variables };
    this.recordedScaleFactor = script.screenInfo?.scaleFactor || 1;
    
    console.log('[Player] 录制时DPI缩放:', this.recordedScaleFactor);
    console.log('[Player] 当前DPI缩放:', dpiManager.getScaleFactor());

    if (this.onStatusChange) {
      this.onStatusChange({ playing: true, paused: false });
    }

    try {
      await this._executeEvents(script.events);
      
      if (this.onCompleteCallback) {
        this.onCompleteCallback({ success: true });
      }
    } catch (err) {
      console.error('Playback error:', err);
      if (this.onCompleteCallback) {
        this.onCompleteCallback({ success: false, error: err.message });
      }
    } finally {
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStatusChange) {
        this.onStatusChange({ playing: false, paused: false });
      }
    }
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    if (this.onStatusChange) {
      this.onStatusChange({ playing: true, paused: true });
    }
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    if (this.onStatusChange) {
      this.onStatusChange({ playing: true, paused: false });
    }
  }

  stop() {
    this.stopRequested = true;
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  async _executeEvents(events) {
    for (let i = 0; i < events.length; i++) {
      if (this.stopRequested) break;
      
      if (this.isPaused) {
        await new Promise(resolve => {
          this.pauseResolve = resolve;
        });
        if (this.stopRequested) break;
      }

      this.currentIndex = i;
      const event = events[i];
      
      if (this.onEventCallback) {
        this.onEventCallback(event, i);
      }

      await this._executeEvent(event);
    }
  }

  async _executeEvent(event) {
    if (event.delay && event.delay > 0) {
      const adjustedDelay = event.delay / this.speed;
      await this._delay(adjustedDelay);
    }

    switch (event.type) {
      case 'mouseMove':
        await this._executeMouseMove(event);
        break;
      case 'mouseClick':
        await this._executeMouseClick(event);
        break;
      case 'mouseWheel':
        await this._executeMouseWheel(event);
        break;
      case 'keyPress':
        await this._executeKeyPress(event);
        break;
      case 'typeText':
        await this._executeTypeText(event);
        break;
      case 'windowChange':
        await this._executeWindowChange(event);
        break;
      case 'wait':
        await this._executeWait(event);
        break;
      case 'if':
        await this._executeIf(event);
        break;
      case 'loop':
        await this._executeLoop(event);
        break;
      case 'setVariable':
        await this._executeSetVariable(event);
        break;
      case 'comment':
        break;
      case 'findImage':
        await this._executeFindImage(event);
        break;
      case 'clickImage':
        await this._executeClickImage(event);
        break;
      case 'waitForImage':
        await this._executeWaitForImage(event);
        break;
      default:
        console.warn('Unknown event type:', event.type);
    }
  }

  async _executeMouseMove(event) {
    const physicalX = this._resolveValue(event.x);
    const physicalY = this._resolveValue(event.y);
    const converted = dpiManager.convertForReplay(physicalX, physicalY, this.recordedScaleFactor);
    robot.moveMouse(converted.x, converted.y);
  }

  async _executeMouseClick(event) {
    const physicalX = this._resolveValue(event.x);
    const physicalY = this._resolveValue(event.y);
    const button = event.button || 'left';
    const action = event.action || 'click';

    const converted = dpiManager.convertForReplay(physicalX, physicalY, this.recordedScaleFactor);
    robot.moveMouse(converted.x, converted.y);
    
    if (action === 'down') {
      robot.mouseToggle('down', button);
    } else if (action === 'up') {
      robot.mouseToggle('up', button);
    } else {
      robot.mouseClick(button, event.clicks > 1);
    }
  }

  async _executeMouseWheel(event) {
    const physicalX = this._resolveValue(event.x);
    const physicalY = this._resolveValue(event.y);
    const amount = this._resolveValue(event.amount || 1);
    
    const converted = dpiManager.convertForReplay(physicalX, physicalY, this.recordedScaleFactor);
    robot.moveMouse(converted.x, converted.y);
    robot.scrollMouse(0, -amount);
  }

  async _executeKeyPress(event) {
    const key = this._resolveKey(event.key);
    const action = event.action || 'press';

    if (!key) return;

    if (action === 'down') {
      robot.keyToggle(key, 'down');
    } else if (action === 'up') {
      robot.keyToggle(key, 'up');
    } else {
      robot.keyTap(key);
    }
  }

  async _executeTypeText(event) {
    const text = this._resolveValue(event.text);
    if (text && !event.hasSensitive) {
      robot.typeString(text);
    }
  }

  async _executeWindowChange(event) {
    await this._delay(500 / this.speed);
  }

  async _executeWait(event) {
    const condition = event.condition;
    const timeout = event.timeout || 5000;
    const interval = event.interval || 100;

    if (!condition) {
      const duration = this._resolveValue(event.duration || 1000);
      await this._delay(duration / this.speed);
      return;
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (this.stopRequested) break;
      if (this.isPaused) {
        await new Promise(resolve => {
          this.pauseResolve = resolve;
        });
        if (this.stopRequested) break;
      }

      if (await this._evaluateCondition(condition)) {
        return;
      }

      await this._delay(interval);
    }

    if (event.throwOnTimeout !== false) {
      throw new Error('Wait condition timed out');
    }
  }

  async _executeIf(event) {
    const conditionMet = await this._evaluateCondition(event.condition);
    
    if (conditionMet && event.then) {
      await this._executeEvents(event.then);
    } else if (!conditionMet && event.else) {
      await this._executeEvents(event.else);
    }
  }

  async _executeLoop(event) {
    const times = this._resolveValue(event.times || 1);
    const loopEvents = event.events || [];

    for (let i = 0; i < times; i++) {
      if (this.stopRequested) break;
      
      this.variables.$index = i;
      this.variables.$iteration = i + 1;
      
      await this._executeEvents(loopEvents);
      
      if (this.stopRequested) break;
    }

    delete this.variables.$index;
    delete this.variables.$iteration;
  }

  async _executeSetVariable(event) {
    const name = event.name;
    const value = this._resolveValue(event.value);
    this.variables[name] = value;
  }

  async _executeFindImage(event) {
    const templatePath = this._resolveValue(event.templatePath);
    const threshold = event.threshold || 0.85;
    const options = {
      threshold: threshold,
      searchRegion: event.searchRegion || null,
      stepX: event.stepX || 4,
      stepY: event.stepY || 4
    };

    const result = await imageFinder.findOnScreen(templatePath, options);

    if (event.storeResultAs) {
      this.variables[event.storeResultAs] = result;
    }

    if (event.storePositionAs) {
      if (result.found) {
        this.variables[event.storePositionAs] = {
          x: result.centerScreenX || result.x,
          y: result.centerScreenY || result.y
        };
      }
    }

    if (event.moveTo && result.found) {
      const x = result.centerScreenX || result.x;
      const y = result.centerScreenY || result.y;
      robot.moveMouse(x, y);
    }

    if (!result.found && event.throwOnNotFound !== false) {
      throw new Error(`Image not found: ${templatePath}, best confidence: ${result.confidence}`);
    }

    return result;
  }

  async _executeClickImage(event) {
    const templatePath = this._resolveValue(event.templatePath);
    const threshold = event.threshold || 0.85;
    const button = event.button || 'left';
    const options = {
      threshold: threshold,
      searchRegion: event.searchRegion || null,
      stepX: event.stepX || 4,
      stepY: event.stepY || 4
    };

    const result = await imageFinder.waitForImage(templatePath, {
      ...options,
      timeout: event.timeout || 5000,
      interval: event.interval || 500
    });

    if (!result.found) {
      if (event.throwOnNotFound !== false) {
        throw new Error(`Image not found for click: ${templatePath}`);
      }
      return result;
    }

    const x = result.centerScreenX || result.x;
    const y = result.centerScreenY || result.y;

    robot.moveMouse(x, y);
    
    if (event.action === 'down') {
      robot.mouseToggle('down', button);
    } else if (event.action === 'up') {
      robot.mouseToggle('up', button);
    } else {
      robot.mouseClick(button, event.clicks > 1);
    }

    if (event.storeResultAs) {
      this.variables[event.storeResultAs] = result;
    }

    return result;
  }

  async _executeWaitForImage(event) {
    const templatePath = this._resolveValue(event.templatePath);
    const threshold = event.threshold || 0.85;
    const timeout = event.timeout || 5000;
    const interval = event.interval || 500;
    const options = {
      threshold,
      timeout,
      interval,
      searchRegion: event.searchRegion || null,
      stepX: event.stepX || 4,
      stepY: event.stepY || 4
    };

    const result = await imageFinder.waitForImage(templatePath, options);

    if (event.storeResultAs) {
      this.variables[event.storeResultAs] = result;
    }

    if (event.storePositionAs && result.found) {
      this.variables[event.storePositionAs] = {
        x: result.centerScreenX || result.x,
        y: result.centerScreenY || result.y
      };
    }

    if (!result.found && event.throwOnTimeout !== false) {
      throw new Error(`Timeout waiting for image: ${templatePath}`);
    }

    return result;
  }

  async _evaluateCondition(condition) {
    if (!condition) return true;

    switch (condition.type) {
      case 'pixelColor':
        return this._checkPixelColor(condition);
      case 'windowActive':
        return this._checkWindowActive(condition);
      case 'variable':
        return this._checkVariable(condition);
      case 'imageExists':
        return await this._checkImageExists(condition);
      case 'and':
        for (const c of condition.conditions) {
          if (!(await this._evaluateCondition(c))) return false;
        }
        return true;
      case 'or':
        for (const c of condition.conditions) {
          if (await this._evaluateCondition(c)) return true;
        }
        return false;
      case 'not':
        return !(await this._evaluateCondition(condition.condition));
      default:
        return false;
    }
  }

  async _checkImageExists(condition) {
    const templatePath = this._resolveValue(condition.templatePath);
    const threshold = condition.threshold || 0.85;
    
    try {
      const result = await imageFinder.findOnScreen(templatePath, {
        threshold,
        searchRegion: condition.searchRegion || null
      });
      return result.found;
    } catch (err) {
      console.error('Error checking image exists:', err);
      return false;
    }
  }

  _checkPixelColor(condition) {
    const physicalX = this._resolveValue(condition.x);
    const physicalY = this._resolveValue(condition.y);
    const expectedColor = this._resolveValue(condition.color).toLowerCase();
    const tolerance = condition.tolerance || 0;

    const converted = dpiManager.convertForReplay(physicalX, physicalY, this.recordedScaleFactor);
    try {
      const actualColor = robot.getPixelColor(converted.x, converted.y);
      
      if (tolerance === 0) {
        return actualColor.toLowerCase() === expectedColor;
      }

      return this._colorDistance(actualColor, expectedColor) <= tolerance;
    } catch (err) {
      return false;
    }
  }

  _checkWindowActive(condition) {
    return true;
  }

  _checkVariable(condition) {
    const name = condition.name;
    const expected = this._resolveValue(condition.value);
    const actual = this.variables[name];
    const operator = condition.operator || '==';

    switch (operator) {
      case '==':
        return actual == expected;
      case '!=':
        return actual != expected;
      case '>':
        return actual > expected;
      case '<':
        return actual < expected;
      case '>=':
        return actual >= expected;
      case '<=':
        return actual <= expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'matches':
        return new RegExp(expected).test(String(actual));
      default:
        return false;
    }
  }

  _colorDistance(color1, color2) {
    const r1 = parseInt(color1.substr(0, 2), 16);
    const g1 = parseInt(color1.substr(2, 2), 16);
    const b1 = parseInt(color1.substr(4, 2), 16);
    
    const r2 = parseInt(color2.substr(0, 2), 16);
    const g2 = parseInt(color2.substr(2, 2), 16);
    const b2 = parseInt(color2.substr(4, 2), 16);

    return Math.sqrt(
      Math.pow(r1 - r2, 2) + 
      Math.pow(g1 - g2, 2) + 
      Math.pow(b1 - b2, 2)
    );
  }

  _resolveValue(value) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const varName = value.slice(2, -1);
      return this.variables[varName] !== undefined ? this.variables[varName] : value;
    }
    return value;
  }

  _resolveKey(keyName) {
    const keyMap = {
      'Space': 'space',
      'Enter': 'enter',
      'Return': 'enter',
      'Backspace': 'backspace',
      'Delete': 'delete',
      'Tab': 'tab',
      'Escape': 'escape',
      'Escape': 'escape',
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      'Up': 'up',
      'Down': 'down',
      'Left': 'left',
      'Right': 'right',
      'PageUp': 'pageup',
      'PageDown': 'pagedown',
      'Home': 'home',
      'End': 'end',
      'Insert': 'insert',
      'CapsLock': 'capslock',
      'NumLock': 'numlock',
      'ScrollLock': 'scrolllock',
      'PrintScreen': 'printscreen',
      'Pause': 'pause',
      'F1': 'f1',
      'F2': 'f2',
      'F3': 'f3',
      'F4': 'f4',
      'F5': 'f5',
      'F6': 'f6',
      'F7': 'f7',
      'F8': 'f8',
      'F9': 'f9',
      'F10': 'f10',
      'F11': 'f11',
      'F12': 'f12',
      'Control': 'control',
      'LeftControl': 'control',
      'RightControl': 'control',
      'Shift': 'shift',
      'LeftShift': 'shift',
      'RightShift': 'shift',
      'Alt': 'alt',
      'LeftAlt': 'alt',
      'RightAlt': 'alt',
      'Meta': 'command',
      'LeftMeta': 'command',
      'RightMeta': 'command'
    };

    if (keyName.length === 1) {
      return keyName.toLowerCase();
    }

    return keyMap[keyName] || keyName.toLowerCase();
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      playing: this.isPlaying,
      paused: this.isPaused,
      currentIndex: this.currentIndex,
      speed: this.speed,
      variables: { ...this.variables }
    };
  }

  onEvent(callback) {
    this.onEventCallback = callback;
  }

  onStatus(callback) {
    this.onStatusChange = callback;
  }

  onComplete(callback) {
    this.onCompleteCallback = callback;
  }
}

module.exports = Player;
