const { screen, desktopCapturer, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const imageFinder = require('./ImageFinder');

class ScreenshotCapture {
  constructor() {
    this.selectionWindow = null;
    this.screenshotDir = path.join(process.cwd(), 'screenshots');
    this.ensureScreenshotDir();
    this.setupIPCHandlers();
  }

  ensureScreenshotDir() {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  setupIPCHandlers() {
    if (!ipcMain._screenshotCaptureSetup) {
      ipcMain.on('screenshot:start-selection', (event) => {
        this.startSelection(event.sender);
      });

      ipcMain.on('screenshot:cancel', () => {
        this.cancelSelection();
      });

      ipcMain.on('screenshot:capture', (event, rect) => {
        this.captureSelectedRegion(rect, event.sender);
      });

      ipcMain._screenshotCaptureSetup = true;
    }
  }

  async startSelection(sender) {
    if (this.selectionWindow) {
      this.cancelSelection();
    }

    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const display of displays) {
      const bounds = display.bounds;
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    this.selectionWindow = new BrowserWindow({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    this.selectionWindow.setIgnoreMouseEvents(false);
    
    const selectionHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      cursor: crosshair;
      background: transparent;
      position: relative;
    }
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      pointer-events: none;
    }
    .selection {
      position: absolute;
      border: 2px solid #0078d4;
      background: rgba(0, 120, 212, 0.1);
      pointer-events: none;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
    }
    .info {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 12px;
      pointer-events: none;
      z-index: 1000;
    }
    .toolbar {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      padding: 10px 20px;
      border-radius: 8px;
      display: flex;
      gap: 10px;
      pointer-events: auto;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn-confirm {
      background: #0078d4;
      color: white;
    }
    .btn-confirm:hover {
      background: #106ebe;
    }
    .btn-cancel {
      background: #5c5c5c;
      color: white;
    }
    .btn-cancel:hover {
      background: #4c4c4c;
    }
    .instructions {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="overlay"></div>
  <div class="instructions">
    拖动鼠标选择区域，按 Enter 确认，按 Escape 取消
  </div>
  <div id="info" class="info" style="display: none;"></div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    let startX = 0, startY = 0;
    let isSelecting = false;
    let currentRect = null;
    
    const overlay = document.querySelector('.overlay');
    const info = document.getElementById('info');
    
    document.addEventListener('mousedown', (e) => {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      
      let selection = document.querySelector('.selection');
      if (selection) selection.remove();
      
      selection = document.createElement('div');
      selection.className = 'selection';
      document.body.appendChild(selection);
      
      updateSelection(e.clientX, e.clientY);
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isSelecting) {
        updateSelection(e.clientX, e.clientY);
      }
      
      info.style.display = 'block';
      info.style.left = (e.clientX + 15) + 'px';
      info.style.top = (e.clientY + 15) + 'px';
      info.textContent = 'X: ' + e.clientX + ', Y: ' + e.clientY;
    });
    
    document.addEventListener('mouseup', (e) => {
      if (isSelecting) {
        isSelecting = false;
        showToolbar();
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ipcRenderer.send('screenshot:cancel');
      } else if (e.key === 'Enter' && currentRect) {
        confirmSelection();
      }
    });
    
    function updateSelection(endX, endY) {
      const selection = document.querySelector('.selection');
      if (!selection) return;
      
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      
      selection.style.left = x + 'px';
      selection.style.top = y + 'px';
      selection.style.width = width + 'px';
      selection.style.height = height + 'px';
      
      const { screen } = require('electron');
      const point = screen.getCursorScreenPoint();
      currentRect = { x: point.x - (e.clientX - x), y: point.y - (e.clientY - y), width, height };
      
      info.textContent = 'X: ' + x + ', Y: ' + y + ', W: ' + width + ', H: ' + height;
    }
    
    function showToolbar() {
      let toolbar = document.querySelector('.toolbar');
      if (toolbar) toolbar.remove();
      
      toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.innerHTML = \`
        <button class="btn btn-cancel" onclick="cancelSelection()">取消</button>
        <button class="btn btn-confirm" onclick="confirmSelection()">确认截图</button>
      \`;
      document.body.appendChild(toolbar);
    }
    
    function cancelSelection() {
      ipcRenderer.send('screenshot:cancel');
    }
    
    function confirmSelection() {
      if (currentRect && currentRect.width > 5 && currentRect.height > 5) {
        ipcRenderer.send('screenshot:capture', currentRect);
      }
    }
  </script>
</body>
</html>`;

    this.selectionWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(selectionHTML));
    
    this.selectionWindow.once('ready-to-show', () => {
      this.selectionWindow.show();
      this.selectionWindow.focus();
    });

    this.selectionWindow.on('closed', () => {
      this.selectionWindow = null;
    });
  }

  async captureSelectedRegion(rect, sender) {
    try {
      const displays = screen.getAllDisplays();
      
      let targetDisplay = null;
      for (const display of displays) {
        const bounds = display.bounds;
        if (rect.x >= bounds.x && rect.x < bounds.x + bounds.width &&
            rect.y >= bounds.y && rect.y < bounds.y + bounds.height) {
          targetDisplay = display;
          break;
        }
      }
      
      if (!targetDisplay) {
        targetDisplay = screen.getPrimaryDisplay();
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: targetDisplay.bounds.width,
          height: targetDisplay.bounds.height
        }
      });

      let targetSource = null;
      for (const source of sources) {
        const displayId = parseInt(source.display_id || '0');
        if (displayId === targetDisplay.id || 
            (displayId === 0 && targetDisplay.id === screen.getPrimaryDisplay().id)) {
          targetSource = source;
          break;
        }
      }

      if (!targetSource && sources.length > 0) {
        targetSource = sources[0];
      }

      if (!targetSource) {
        throw new Error('无法获取屏幕源');
      }

      const relativeX = rect.x - targetDisplay.bounds.x;
      const relativeY = rect.y - targetDisplay.bounds.y;
      
      const image = targetSource.thumbnail;
      const cropped = image.crop({
        x: Math.max(0, relativeX),
        y: Math.max(0, relativeY),
        width: Math.min(rect.width, targetDisplay.bounds.width - relativeX),
        height: Math.min(rect.height, targetDisplay.bounds.height - relativeY)
      });

      const timestamp = Date.now();
      const fileName = `template_${timestamp}.png`;
      const filePath = path.join(this.screenshotDir, fileName);
      
      const pngBuffer = cropped.toPNG();
      fs.writeFileSync(filePath, pngBuffer);

      this.cancelSelection();

      if (sender) {
        sender.send('screenshot:captured', {
          path: filePath,
          rect: rect,
          display: targetDisplay.id
        });
      }

      return { path: filePath, rect, displayId: targetDisplay.id };
    } catch (err) {
      console.error('[ScreenshotCapture] 截图失败:', err);
      if (sender) {
        sender.send('screenshot:error', err.message);
      }
      throw err;
    }
  }

  cancelSelection() {
    if (this.selectionWindow) {
      this.selectionWindow.close();
      this.selectionWindow = null;
    }
  }

  async quickCapture(x, y, width, height) {
    return await imageFinder.captureRegion(x, y, width, height);
  }

  getScreenshotDir() {
    return this.screenshotDir;
  }
}

const screenshotCapture = new ScreenshotCapture();
module.exports = screenshotCapture;
module.exports.ScreenshotCapture = ScreenshotCapture;
