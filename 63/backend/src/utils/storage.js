const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DATA_STORAGE_PATH } = require('../config');

class Storage {
  constructor() {
    this.basePath = path.resolve(DATA_STORAGE_PATH);
    this.ensureDirs();
  }

  ensureDirs() {
    const dirs = [
      this.basePath,
      path.join(this.basePath, 'users'),
      path.join(this.basePath, 'literature'),
      path.join(this.basePath, 'crawl-tasks'),
      path.join(this.basePath, 'collections')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  readJson(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[Storage] 读取文件失败:', filePath, err.message);
    }
    return null;
  }

  writeJson(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[Storage] 写入文件失败:', filePath, err.message);
      return false;
    }
  }

  saveUserProfile(userId, profile) {
    const filePath = path.join(this.basePath, 'users', `${userId}.json`);
    const existing = this.readJson(filePath) || {};
    const updated = {
      ...existing,
      ...profile,
      id: userId,
      updatedAt: new Date().toISOString()
    };
    this.writeJson(filePath, updated);
    return updated;
  }

  getUserProfile(userId) {
    const filePath = path.join(this.basePath, 'users', `${userId}.json`);
    return this.readJson(filePath);
  }

  saveLiterature(literature) {
    const id = literature.id || uuidv4();
    const filePath = path.join(this.basePath, 'literature', `${id}.json`);
    const updated = {
      ...literature,
      id,
      updatedAt: new Date().toISOString()
    };
    this.writeJson(filePath, updated);
    return updated;
  }

  getLiterature(id) {
    const filePath = path.join(this.basePath, 'literature', `${id}.json`);
    return this.readJson(filePath);
  }

  saveCrawlTask(taskId, task) {
    const filePath = path.join(this.basePath, 'crawl-tasks', `${taskId}.json`);
    const updated = {
      ...task,
      id: taskId,
      updatedAt: new Date().toISOString()
    };
    this.writeJson(filePath, updated);
    return updated;
  }

  getCrawlTask(taskId) {
    const filePath = path.join(this.basePath, 'crawl-tasks', `${taskId}.json`);
    return this.readJson(filePath);
  }

  getUserCollection(userId) {
    const filePath = path.join(this.basePath, 'collections', `${userId}.json`);
    return this.readJson(filePath) || [];
  }

  addToUserCollection(userId, literature) {
    const collection = this.getUserCollection(userId);
    const existingIndex = collection.findIndex(item => item.id === literature.id);
    
    if (existingIndex === -1) {
      collection.push({
        ...literature,
        addedAt: new Date().toISOString()
      });
    } else {
      collection[existingIndex] = {
        ...collection[existingIndex],
        ...literature,
        updatedAt: new Date().toISOString()
      };
    }

    const filePath = path.join(this.basePath, 'collections', `${userId}.json`);
    this.writeJson(filePath, collection);
    return collection;
  }

  removeFromUserCollection(userId, literatureId) {
    const collection = this.getUserCollection(userId);
    const filtered = collection.filter(item => item.id !== literatureId);
    
    const filePath = path.join(this.basePath, 'collections', `${userId}.json`);
    this.writeJson(filePath, filtered);
    return filtered;
  }

  saveUserCollection(userId, collection) {
    const filePath = path.join(this.basePath, 'collections', `${userId}.json`);
    const cleaned = collection.map(item => {
      const { _status, ...rest } = item;
      return rest;
    });
    this.writeJson(filePath, cleaned);
    return cleaned;
  }

  syncUserProfile(userId, profileData) {
    const profile = this.getUserProfile(userId) || { id: userId };
    const merged = {
      ...profile,
      ...profileData,
      syncedAt: new Date().toISOString()
    };
    return this.saveUserProfile(userId, merged);
  }

  listAllLiterature() {
    const litPath = path.join(this.basePath, 'literature');
    if (!fs.existsSync(litPath)) return [];
    
    const files = fs.readdirSync(litPath).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const content = this.readJson(path.join(litPath, f));
      return content;
    }).filter(Boolean);
  }
}

module.exports = new Storage();
