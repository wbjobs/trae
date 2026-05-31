const { screen } = require('electron');
const robot = require('robotjs');

class DPIManager {
  constructor() {
    this.scaleFactor = 1;
    this.logicalScreenSize = { width: 0, height: 0 };
    this.physicalScreenSize = { width: 0, height: 0 };
    this._refreshDPI();
    this._setupChangeListener();
  }

  _refreshDPI() {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      this.scaleFactor = primaryDisplay.scaleFactor || 1;
      this.logicalScreenSize = {
        width: primaryDisplay.workAreaSize.width,
        height: primaryDisplay.workAreaSize.height
      };
      
      const robotScreen = robot.getScreenSize();
      this.physicalScreenSize = {
        width: robotScreen.width,
        height: robotScreen.height
      };

      console.log('[DPI] 检测到的DPI缩放比例:', this.scaleFactor);
      console.log('[DPI] 逻辑分辨率:', this.logicalScreenSize);
      console.log('[DPI] 物理分辨率:', this.physicalScreenSize);
    } catch (err) {
      console.warn('[DPI] 获取DPI信息失败，使用默认缩放比例1.0:', err.message);
      this.scaleFactor = 1;
      const robotScreen = robot.getScreenSize();
      this.logicalScreenSize = { ...robotScreen };
      this.physicalScreenSize = { ...robotScreen };
    }
  }

  _setupChangeListener() {
    try {
      screen.on('display-metrics-changed', () => {
        this._refreshDPI();
        console.log('[DPI] 显示器配置已更新');
      });
    } catch (err) {
      console.warn('[DPI] 无法监听显示器变化事件:', err.message);
    }
  }

  getScaleFactor() {
    return this.scaleFactor;
  }

  logicalToPhysical(logicalX, logicalY) {
    return {
      x: Math.round(logicalX * this.scaleFactor),
      y: Math.round(logicalY * this.scaleFactor)
    };
  }

  physicalToLogical(physicalX, physicalY, targetScaleFactor = null) {
    const scale = targetScaleFactor || this.scaleFactor;
    return {
      x: Math.round(physicalX / scale),
      y: Math.round(physicalY / scale)
    };
  }

  convertForReplay(physicalX, physicalY, recordedScaleFactor) {
    const logicalX = physicalX / recordedScaleFactor;
    const logicalY = physicalY / recordedScaleFactor;
    return {
      x: Math.round(logicalX * this.scaleFactor),
      y: Math.round(logicalY * this.scaleFactor)
    };
  }

  convertForReplayWithInfo(physicalX, physicalY, recordedScaleFactor, targetScaleFactor) {
    const logicalX = physicalX / recordedScaleFactor;
    const logicalY = physicalY / recordedScaleFactor;
    return {
      x: Math.round(logicalX * targetScaleFactor),
      y: Math.round(logicalY * targetScaleFactor)
    };
  }

  getScreenInfo() {
    return {
      scaleFactor: this.scaleFactor,
      logicalWidth: this.logicalScreenSize.width,
      logicalHeight: this.logicalScreenSize.height,
      physicalWidth: this.physicalScreenSize.width,
      physicalHeight: this.physicalScreenSize.height
    };
  }
}

const dpiManager = new DPIManager();
module.exports = dpiManager;
