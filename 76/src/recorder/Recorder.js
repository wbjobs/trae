const GlobalHook = require('../hooks/GlobalHook');
const SensitiveFilter = require('../security/SensitiveFilter');
const dpiManager = require('../utils/DPIManager');

class Recorder {
  constructor(options = {}) {
    this.hook = new GlobalHook();
    this.filter = new SensitiveFilter();
    
    this.isRecording = false;
    this.events = [];
    this.startTime = 0;
    this.lastEventTime = 0;
    
    this.captureMouseMove = options.captureMouseMove !== false;
    this.captureWheel = options.captureWheel !== false;
    this.mouseMoveThreshold = options.mouseMoveThreshold || 10;
    this.combineKeyStrokes = options.combineKeyStrokes !== false;
    
    this.lastMousePos = { x: 0, y: 0 };
    this.currentText = '';
    this.currentTextStartTime = 0;
    this.keyBuffer = [];
    
    this.onEventCallback = null;
    this.onStatusChange = null;
  }

  start() {
    if (this.isRecording) return;

    this.events = [];
    this.startTime = Date.now();
    this.lastEventTime = this.startTime;
    this.isRecording = true;
    this.lastMousePos = { x: 0, y: 0 };
    this.currentText = '';
    this.keyBuffer = [];

    this.hook.start();

    this.hook.on('mousedown', (e) => this._onMouseDown(e));
    this.hook.on('mouseup', (e) => this._onMouseUp(e));
    this.hook.on('mousemove', (e) => this._onMouseMove(e));
    this.hook.on('wheel', (e) => this._onWheel(e));
    this.hook.on('keydown', (e) => this._onKeyDown(e));
    this.hook.on('keyup', (e) => this._onKeyUp(e));
    this.hook.on('windowChange', (e) => this._onWindowChange(e));

    if (this.onStatusChange) {
      this.onStatusChange({ recording: true });
    }
  }

  stop() {
    if (!this.isRecording) return;

    this._flushTextBuffer();
    this.hook.stop();
    this.isRecording = false;

    if (this.onStatusChange) {
      this.onStatusChange({ recording: false });
    }

    return this.getScript();
  }

  pause() {
    this.isRecording = false;
  }

  resume() {
    this.isRecording = true;
    this.lastEventTime = Date.now();
  }

  _onMouseDown(e) {
    if (!this.isRecording) return;
    this._flushTextBuffer();
    
    const event = {
      type: 'mouseClick',
      action: 'down',
      x: e.x,
      y: e.y,
      button: e.button === 1 ? 'left' : e.button === 2 ? 'right' : 'middle',
      clicks: e.clicks,
      delay: this._getDelay(e.timestamp)
    };
    
    this._addEvent(event);
  }

  _onMouseUp(e) {
    if (!this.isRecording) return;
    
    const event = {
      type: 'mouseClick',
      action: 'up',
      x: e.x,
      y: e.y,
      button: e.button === 1 ? 'left' : e.button === 2 ? 'right' : 'middle',
      delay: this._getDelay(e.timestamp)
    };
    
    this._addEvent(event);
  }

  _onMouseMove(e) {
    if (!this.isRecording || !this.captureMouseMove) return;

    const dx = Math.abs(e.x - this.lastMousePos.x);
    const dy = Math.abs(e.y - this.lastMousePos.y);

    if (dx >= this.mouseMoveThreshold || dy >= this.mouseMoveThreshold) {
      this.lastMousePos = { x: e.x, y: e.y };
      
      const event = {
        type: 'mouseMove',
        x: e.x,
        y: e.y,
        delay: this._getDelay(e.timestamp)
      };
      
      this._addEvent(event);
    }
  }

  _onWheel(e) {
    if (!this.isRecording || !this.captureWheel) return;
    this._flushTextBuffer();
    
    const event = {
      type: 'mouseWheel',
      x: e.x,
      y: e.y,
      amount: e.amount,
      rotation: e.rotation,
      direction: e.direction,
      delay: this._getDelay(e.timestamp)
    };
    
    this._addEvent(event);
  }

  _onKeyDown(e) {
    if (!this.isRecording) return;

    const filteredEvent = this.filter.filterKeyEvent(e);
    
    const isPrintable = this._isPrintableKey(filteredEvent.keyName);
    const isModifier = this._isModifierKey(filteredEvent.keyName);

    if (isPrintable && !isModifier) {
      if (this.currentText === '') {
        this.currentTextStartTime = e.timestamp;
      }
      this.keyBuffer.push(filteredEvent);
    } else {
      this._flushTextBuffer();
      
      const event = {
        type: 'keyPress',
        action: 'down',
        key: filteredEvent.keyName,
        keycode: filteredEvent.keycode,
        isSensitive: filteredEvent.isSensitive || false,
        delay: this._getDelay(e.timestamp)
      };
      
      this._addEvent(event);
    }
  }

  _onKeyUp(e) {
    if (!this.isRecording) return;

    const filteredEvent = this.filter.filterKeyEvent(e);
    const isPrintable = this._isPrintableKey(filteredEvent.keyName);
    const isModifier = this._isModifierKey(filteredEvent.keyName);

    if (!isPrintable || isModifier) {
      const event = {
        type: 'keyPress',
        action: 'up',
        key: filteredEvent.keyName,
        keycode: filteredEvent.keycode,
        isSensitive: filteredEvent.isSensitive || false,
        delay: this._getDelay(e.timestamp)
      };
      
      this._addEvent(event);
    }
  }

  _onWindowChange(e) {
    if (!this.isRecording) return;

    this.filter.checkWindow(e.window);
    
    const event = {
      type: 'windowChange',
      window: {
        title: e.window.title,
        owner: e.window.owner
      },
      isSensitive: this.filter.isInSensitiveContext(),
      delay: this._getDelay(e.timestamp)
    };
    
    this._addEvent(event);
  }

  _flushTextBuffer() {
    if (this.keyBuffer.length > 0 && this.combineKeyStrokes) {
      const text = this.keyBuffer
        .map(k => k.keyName.length === 1 ? k.keyName : `{${k.keyName}}`)
        .join('');
      
      const event = {
        type: 'typeText',
        text: text,
        hasSensitive: this.keyBuffer.some(k => k.isSensitive),
        delay: this._getDelay(this.currentTextStartTime)
      };
      
      this._addEvent(event);
      this.keyBuffer = [];
      this.currentText = '';
    }
  }

  _isPrintableKey(keyName) {
    if (keyName.length === 1) return true;
    if (keyName === 'Space') return true;
    return false;
  }

  _isModifierKey(keyName) {
    const modifiers = [
      'Shift', 'Control', 'Alt', 'Meta',
      'LeftShift', 'RightShift',
      'LeftControl', 'RightControl',
      'LeftAlt', 'RightAlt',
      'LeftMeta', 'RightMeta',
      'CapsLock', 'NumLock', 'ScrollLock'
    ];
    return modifiers.includes(keyName);
  }

  _getDelay(timestamp) {
    const delay = timestamp - this.lastEventTime;
    this.lastEventTime = timestamp;
    return Math.max(0, delay);
  }

  _addEvent(event) {
    this.events.push(event);
    if (this.onEventCallback) {
      this.onEventCallback(event);
    }
  }

  getScript() {
    const screenInfo = dpiManager.getScreenInfo();
    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      duration: this.lastEventTime - this.startTime,
      eventCount: this.events.length,
      screenInfo: screenInfo,
      settings: {
        captureMouseMove: this.captureMouseMove,
        captureWheel: this.captureWheel,
        mouseMoveThreshold: this.mouseMoveThreshold
      },
      variables: {},
      events: this.events
    };
  }

  getEvents() {
    return [...this.events];
  }

  getStatus() {
    return {
      recording: this.isRecording,
      eventCount: this.events.length,
      duration: this.isRecording ? Date.now() - this.startTime : 0,
      inSensitiveContext: this.filter.isInSensitiveContext()
    };
  }

  setSensitiveFilterEnabled(enabled) {
    this.filter.setEnabled(enabled);
  }

  onEvent(callback) {
    this.onEventCallback = callback;
  }

  onStatus(callback) {
    this.onStatusChange = callback;
  }
}

module.exports = Recorder;
