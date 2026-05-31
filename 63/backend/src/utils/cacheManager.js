const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CacheManager {
  constructor(cacheDir = 'cache') {
    this.cacheDir = path.join(process.cwd(), cacheDir);
    this.indexFile = path.join(this.cacheDir, 'index.json');
    this.metaFile = path.join(this.cacheDir, 'meta.json');
    this.maxCacheSize = 1024 * 1024 * 500;
    this.defaultTTL = 7 * 24 * 60 * 60 * 1000;
    
    this.init();
  }

  init() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify({
        entries: {},
        totalSize: 0,
        createdAt: Date.now()
      }, null, 2));
    }

    if (!fs.existsSync(this.metaFile)) {
      fs.writeFileSync(this.metaFile, JSON.stringify({
        hitCount: 0,
        missCount: 0,
        evictionCount: 0
      }, null, 2));
    }
  }

  generateKey(...parts) {
    return crypto
      .createHash('sha256')
      .update(parts.join(':'))
      .digest('hex');
  }

  getIndex() {
    try {
      return JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
    } catch (e) {
      return { entries: {}, totalSize: 0, createdAt: Date.now() };
    }
  }

  saveIndex(index) {
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
  }

  getMeta() {
    try {
      return JSON.parse(fs.readFileSync(this.metaFile, 'utf8'));
    } catch (e) {
      return { hitCount: 0, missCount: 0, evictionCount: 0 };
    }
  }

  saveMeta(meta) {
    fs.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2));
  }

  getFilePath(key) {
    const subDir = key.substring(0, 2);
    const dirPath = path.join(this.cacheDir, subDir);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    return path.join(dirPath, `${key}.json`);
  }

  set(key, data, ttl = this.defaultTTL, tags = []) {
    const filePath = this.getFilePath(key);
    const jsonData = JSON.stringify(data, null, 2);
    const dataSize = Buffer.byteLength(jsonData, 'utf8');

    fs.writeFileSync(filePath, jsonData);

    const index = this.getIndex();
    
    if (index.entries[key]) {
      index.totalSize -= index.entries[key].size;
    }

    index.entries[key] = {
      filePath,
      size: dataSize,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      tags,
      hitCount: 0
    };

    index.totalSize += dataSize;
    this.saveIndex(index);

    this.evictIfNeeded();

    return { key, size: dataSize, expiresAt: index.entries[key].expiresAt };
  }

  get(key, returnStale = false) {
    const index = this.getIndex();
    const entry = index.entries[key];
    const meta = this.getMeta();

    if (!entry) {
      meta.missCount++;
      this.saveMeta(meta);
      return null;
    }

    const now = Date.now();
    const isExpired = now > entry.expiresAt;

    if (isExpired && !returnStale) {
      meta.missCount++;
      this.saveMeta(meta);
      return null;
    }

    try {
      const filePath = this.getFilePath(key);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      entry.hitCount++;
      entry.lastAccessedAt = now;
      
      if (isExpired) {
        entry.expiresAt = now + this.defaultTTL;
      }
      
      index.entries[key] = entry;
      this.saveIndex(index);

      meta.hitCount++;
      this.saveMeta(meta);

      return {
        data,
        isStale: isExpired,
        hitCount: entry.hitCount,
        expiresAt: entry.expiresAt
      };
    } catch (e) {
      delete index.entries[key];
      this.saveIndex(index);
      
      meta.missCount++;
      this.saveMeta(meta);
      
      return null;
    }
  }

  has(key) {
    const index = this.getIndex();
    const entry = index.entries[key];
    
    if (!entry) return false;
    return Date.now() <= entry.expiresAt;
  }

  delete(key) {
    const index = this.getIndex();
    const entry = index.entries[key];
    
    if (!entry) return false;

    try {
      fs.unlinkSync(this.getFilePath(key));
    } catch (e) {
      console.warn('删除缓存文件失败:', e.message);
    }

    index.totalSize -= entry.size;
    delete index.entries[key];
    this.saveIndex(index);

    return true;
  }

  getOrSet(key, fetcher, ttl = this.defaultTTL, tags = []) {
    const cached = this.get(key);
    if (cached) return cached.data;

    const data = fetcher();
    this.set(key, data, ttl, tags);
    return data;
  }

  async getOrSetAsync(key, fetcher, ttl = this.defaultTTL, tags = []) {
    const cached = this.get(key);
    if (cached) return cached.data;

    const data = await fetcher();
    this.set(key, data, ttl, tags);
    return data;
  }

  invalidateByTag(tag) {
    const index = this.getIndex();
    let count = 0;

    Object.entries(index.entries).forEach(([key, entry]) => {
      if (entry.tags && entry.tags.includes(tag)) {
        this.delete(key);
        count++;
      }
    });

    return count;
  }

  invalidateByPattern(pattern) {
    const index = this.getIndex();
    const regex = new RegExp(pattern);
    let count = 0;

    Object.keys(index.entries).forEach(key => {
      if (regex.test(key)) {
        this.delete(key);
        count++;
      }
    });

    return count;
  }

  evictIfNeeded() {
    const index = this.getIndex();
    
    if (index.totalSize <= this.maxCacheSize) return;

    const entries = Object.entries(index.entries)
      .sort((a, b) => {
        const scoreA = (a[1].hitCount || 0) / ((Date.now() - a[1].createdAt) / 1000 + 1);
        const scoreB = (b[1].hitCount || 0) / ((Date.now() - b[1].createdAt) / 1000 + 1);
        return scoreA - scoreB;
      });

    const meta = this.getMeta();
    let evicted = 0;

    for (const [key] of entries) {
      if (index.totalSize <= this.maxCacheSize * 0.8) break;
      
      this.delete(key);
      evicted++;
    }

    meta.evictionCount += evicted;
    this.saveMeta(meta);
  }

  cleanExpired() {
    const index = this.getIndex();
    const now = Date.now();
    let count = 0;

    Object.entries(index.entries).forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        this.delete(key);
        count++;
      }
    });

    return count;
  }

  clearAll() {
    const index = this.getIndex();
    const count = Object.keys(index.entries).length;

    Object.keys(index.entries).forEach(key => {
      try {
        fs.unlinkSync(this.getFilePath(key));
      } catch (e) {}
    });

    index.entries = {};
    index.totalSize = 0;
    this.saveIndex(index);

    return count;
  }

  getStats() {
    const index = this.getIndex();
    const meta = this.getMeta();
    const totalRequests = meta.hitCount + meta.missCount;

    return {
      totalEntries: Object.keys(index.entries).length,
      totalSize: index.totalSize,
      maxSize: this.maxCacheSize,
      usagePercent: (index.totalSize / this.maxCacheSize * 100).toFixed(2),
      hitRate: totalRequests > 0 
        ? ((meta.hitCount / totalRequests) * 100).toFixed(2) 
        : '0.00',
      hitCount: meta.hitCount,
      missCount: meta.missCount,
      evictionCount: meta.evictionCount,
      createdAt: index.createdAt
    };
  }
}

const literatureCache = new CacheManager('cache/literature');
const searchCache = new CacheManager('cache/search');

module.exports = {
  CacheManager,
  literatureCache,
  searchCache
};
