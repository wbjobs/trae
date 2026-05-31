const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const fs = require('fs');
const path = require('path');

class ImageFinder {
  constructor(options = {}) {
    this.defaultThreshold = options.threshold || 0.85;
    this.defaultTimeout = options.timeout || 5000;
    this.defaultInterval = options.interval || 500;
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.screenshot-cache');
    this.ensureCacheDir();
    this.useOpenCV = this._tryLoadOpenCV();
  }

  _tryLoadOpenCV() {
    try {
      this.cv = require('opencv4nodejs');
      console.log('[ImageFinder] OpenCV 已加载，将使用高性能模板匹配');
      return true;
    } catch (err) {
      console.log('[ImageFinder] 未检测到 OpenCV，使用 JavaScript 模板匹配');
      return false;
    }
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async findImage(templatePath, screenshotBuffer, options = {}) {
    const threshold = options.threshold || this.defaultThreshold;
    
    const template = await this._loadImage(templatePath);
    const screenshot = await this._loadImageFromBuffer(screenshotBuffer);
    
    if (this.useOpenCV) {
      return this._findWithOpenCV(template, screenshot, threshold, options);
    } else {
      return this._findWithJS(template, screenshot, threshold, options);
    }
  }

  async findOnScreen(templatePath, options = {}) {
    const { screen, nativeImage } = require('electron');
    
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    
    const allResults = [];
    
    for (const display of displays) {
      try {
        const bounds = display.bounds;
        const screenshot = await this._captureDisplay(bounds);
        
        const result = await this.findImage(templatePath, screenshot, options);
        
        if (result.found) {
          result.displayBounds = bounds;
          result.displayId = display.id;
          result.isPrimary = display.id === primaryDisplay.id;
          
          result.screenX = bounds.x + result.x;
          result.screenY = bounds.y + result.y;
          result.centerScreenX = bounds.x + result.centerX;
          result.centerScreenY = bounds.y + result.centerY;
          
          allResults.push(result);
        }
      } catch (err) {
        console.error('[ImageFinder] 捕获显示器失败:', err);
      }
    }
    
    if (allResults.length === 0) {
      return { found: false, confidence: 0 };
    }
    
    allResults.sort((a, b) => b.confidence - a.confidence);
    
    return allResults[0];
  }

  async waitForImage(templatePath, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;
    const interval = options.interval || this.defaultInterval;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await this.findOnScreen(templatePath, options);
      
      if (result.found) {
        return result;
      }
      
      await this._delay(interval);
    }
    
    return { found: false, confidence: 0, timedOut: true };
  }

  async _findWithOpenCV(templateMat, screenshotMat, threshold, options) {
    try {
      const result = screenshotMat.matchTemplate(templateMat, this.cv.TM_CCOEFF_NORMED);
      const minMax = result.minMaxLoc();
      
      const confidence = minMax.maxVal;
      
      if (confidence >= threshold) {
        const { x, y } = minMax.maxLoc;
        return {
          found: true,
          x,
          y,
          width: templateMat.cols,
          height: templateMat.rows,
          centerX: x + Math.floor(templateMat.cols / 2),
          centerY: y + Math.floor(templateMat.rows / 2),
          confidence,
          method: 'opencv'
        };
      }
      
      return { found: false, confidence, method: 'opencv' };
    } catch (err) {
      console.error('[ImageFinder] OpenCV 匹配失败:', err);
      return { found: false, confidence: 0, error: err.message };
    }
  }

  async _findWithJS(template, screenshot, threshold, options) {
    const searchRegion = options.searchRegion || null;
    
    let searchX = 0, searchY = 0;
    let searchWidth = screenshot.width, searchHeight = screenshot.height;
    
    if (searchRegion) {
      searchX = Math.max(0, searchRegion.x || 0);
      searchY = Math.max(0, searchRegion.y || 0);
      searchWidth = Math.min(searchRegion.width || screenshot.width, screenshot.width - searchX);
      searchHeight = Math.min(searchRegion.height || screenshot.height, screenshot.height - searchY);
    }
    
    if (template.width > searchWidth || template.height > searchHeight) {
      return { found: false, confidence: 0 };
    }
    
    let bestMatch = { confidence: 0, x: 0, y: 0 };
    const stepX = options.stepX || 4;
    const stepY = options.stepY || 4;
    
    for (let y = searchY; y <= searchY + searchHeight - template.height; y += stepY) {
      for (let x = searchX; x <= searchX + searchWidth - template.width; x += stepX) {
        const confidence = this._calculateSimilarity(template, screenshot, x, y);
        
        if (confidence > bestMatch.confidence) {
          bestMatch = { confidence, x, y };
          
          if (confidence >= threshold) {
            return {
              found: true,
              x: bestMatch.x,
              y: bestMatch.y,
              width: template.width,
              height: template.height,
              centerX: bestMatch.x + Math.floor(template.width / 2),
              centerY: bestMatch.y + Math.floor(template.height / 2),
              confidence: bestMatch.confidence,
              method: 'javascript'
            };
          }
        }
      }
    }
    
    return { found: false, confidence: bestMatch.confidence, method: 'javascript' };
  }

  _calculateSimilarity(template, screenshot, offsetX, offsetY) {
    let matchCount = 0;
    let totalPixels = 0;
    
    const sampleRate = 2;
    
    for (let y = 0; y < template.height; y += sampleRate) {
      for (let x = 0; x < template.width; x += sampleRate) {
        const templateIdx = (y * template.width + x) * 4;
        const screenshotIdx = ((offsetY + y) * screenshot.width + (offsetX + x)) * 4;
        
        if (template.data[templateIdx + 3] < 128) {
          continue;
        }
        
        totalPixels++;
        
        const tr = template.data[templateIdx];
        const tg = template.data[templateIdx + 1];
        const tb = template.data[templateIdx + 2];
        
        const sr = screenshot.data[screenshotIdx];
        const sg = screenshot.data[screenshotIdx + 1];
        const sb = screenshot.data[screenshotIdx + 2];
        
        const distance = Math.sqrt(
          Math.pow(tr - sr, 2) + 
          Math.pow(tg - sg, 2) + 
          Math.pow(tb - sb, 2)
        );
        
        if (distance < 50) {
          matchCount++;
        }
      }
    }
    
    return totalPixels > 0 ? matchCount / totalPixels : 0;
  }

  async _loadImage(filePath) {
    if (this.useOpenCV) {
      return this.cv.imreadAsync(filePath);
    }
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(new PNG())
        .on('parsed', function() {
          resolve(this);
        })
        .on('error', reject);
    });
  }

  async _loadImageFromBuffer(buffer) {
    if (this.useOpenCV) {
      return this.cv.imdecodeAsync(buffer);
    }
    
    return new Promise((resolve, reject) => {
      const png = new PNG();
      png.parse(buffer, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  async _captureDisplay(bounds) {
    const { desktopCapturer } = require('electron');
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: bounds.width,
        height: bounds.height
      }
    });
    
    for (const source of sources) {
      const displayId = parseInt(source.display_id || '0');
      const display = require('electron').screen.getAllDisplays().find(d => d.id === displayId);
      
      if (display && display.bounds.x === bounds.x && display.bounds.y === bounds.y) {
        const thumbnail = source.thumbnail;
        return thumbnail.toPNG();
      }
    }
    
    const primarySource = sources[0];
    if (primarySource) {
      return primarySource.thumbnail.toPNG();
    }
    
    throw new Error('无法捕获显示器截图');
  }

  async captureRegion(x, y, width, height) {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    
    let targetDisplay = null;
    for (const display of displays) {
      const bounds = display.bounds;
      if (x >= bounds.x && x < bounds.x + bounds.width &&
          y >= bounds.y && y < bounds.y + bounds.height) {
        targetDisplay = display;
        break;
      }
    }
    
    if (!targetDisplay) {
      targetDisplay = screen.getPrimaryDisplay();
    }
    
    const relativeX = x - targetDisplay.bounds.x;
    const relativeY = y - targetDisplay.bounds.y;
    
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height
      }
    });
    
    for (const source of sources) {
      const displayId = parseInt(source.display_id || '0');
      if (displayId === targetDisplay.id || 
          (displayId === 0 && targetDisplay.id === screen.getPrimaryDisplay().id)) {
        const image = source.thumbnail;
        const cropped = image.crop({
          x: relativeX,
          y: relativeY,
          width: width,
          height: height
        });
        return cropped.toPNG();
      }
    }
    
    throw new Error('无法捕获指定区域');
  }

  async saveImage(buffer, filePath) {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, buffer, (err) => {
        if (err) reject(err);
        else resolve(filePath);
      });
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const imageFinder = new ImageFinder();
module.exports = imageFinder;
module.exports.ImageFinder = ImageFinder;
