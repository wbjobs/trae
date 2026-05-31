const storage = require('../utils/storage');
const { mockUsers, mockLiteratures } = require('../data/mockLiterature');
const validator = require('../utils/validator');

class UserController {
  async getUserProfile(req, res, next) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID'
        });
      }

      let profile = storage.getUserProfile(userId);
      
      if (!profile) {
        profile = mockUsers[userId];
      }

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }

      res.json({
        success: true,
        data: profile,
        message: '获取用户档案成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUserProfile(req, res, next) {
    try {
      const { userId } = req.params;
      const profileData = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID'
        });
      }

      const updated = storage.saveUserProfile(userId, profileData);

      res.json({
        success: true,
        data: updated,
        message: '更新用户档案成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserCollection(req, res, next) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID'
        });
      }

      const collection = storage.getUserCollection(userId);

      res.json({
        success: true,
        data: {
          items: collection,
          count: collection.length
        },
        message: '获取用户收藏成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async addToCollection(req, res, next) {
    try {
      const { userId } = req.params;
      const { literature } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID'
        });
      }

      if (!literature) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数据'
        });
      }

      const collection = storage.addToUserCollection(userId, literature);

      res.json({
        success: true,
        data: {
          items: collection,
          count: collection.length
        },
        message: '添加收藏成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async removeFromCollection(req, res, next) {
    try {
      const { userId, id } = req.params;
      
      if (!userId || !id) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID和文献ID'
        });
      }

      const collection = storage.removeFromUserCollection(userId, id);

      res.json({
        success: true,
        data: {
          items: collection,
          count: collection.length
        },
        message: '移除收藏成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async syncAcademicProfile(req, res, next) {
    try {
      const { userId } = req.params;
      const { 
        orcid, 
        googleScholarId, 
        researchGateId, 
        forceSync,
        profile,
        collection,
        lastSyncAt,
        pendingChanges
      } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID'
        });
      }

      const syncResult = await this.performSync(userId, { 
        orcid, 
        googleScholarId, 
        researchGateId, 
        forceSync,
        clientProfile: profile,
        clientCollection: collection,
        clientLastSyncAt: lastSyncAt,
        pendingChanges
      });

      res.json({
        success: true,
        data: syncResult,
        message: '学术档案同步成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async performSync(userId, options) {
    console.log(`[Sync] 开始同步用户学术档案: ${userId}`);

    const serverProfile = storage.getUserProfile(userId) || mockUsers[userId] || { id: userId };
    const serverCollection = storage.getUserCollection(userId);
    
    const syncStats = {
      orcid: options.orcid ? 'synced' : 'skipped',
      googleScholar: options.googleScholarId ? 'synced' : 'skipped',
      researchGate: options.researchGateId ? 'synced' : 'skipped',
      profileMerged: false,
      collectionMerged: false,
      conflictsResolved: 0
    };

    const mergedProfile = this.mergeProfiles(serverProfile, options.clientProfile, options.forceSync);
    if (mergedProfile !== serverProfile) {
      syncStats.profileMerged = true;
    }

    if (options.pendingChanges && options.pendingChanges.length > 0) {
      this.applyPendingChanges(userId, options.pendingChanges);
      syncStats.conflictsResolved = options.pendingChanges.length;
    }

    const mergedCollection = this.mergeCollections(
      serverCollection,
      options.clientCollection || [],
      options.forceSync
    );
    if (mergedCollection.length !== serverCollection.length) {
      syncStats.collectionMerged = true;
    }

    const updatedProfile = {
      ...mergedProfile,
      orcid: options.orcid || mergedProfile.orcid,
      lastSyncAt: new Date().toISOString(),
      version: (mergedProfile.version || 0) + 1
    };

    storage.saveUserProfile(userId, updatedProfile);
    storage.saveUserCollection(userId, mergedCollection);

    return {
      profile: updatedProfile,
      collection: mergedCollection,
      syncStats,
      syncedAt: new Date().toISOString(),
      version: updatedProfile.version
    };
  }

  mergeProfiles(serverProfile, clientProfile, forceSync) {
    if (!clientProfile) return serverProfile;
    if (!serverProfile) return clientProfile;
    if (forceSync) return { ...serverProfile, ...clientProfile };

    const serverUpdated = new Date(serverProfile.updatedAt || 0);
    const clientUpdated = new Date(clientProfile.updatedAt || 0);

    if (clientUpdated > serverUpdated) {
      return { ...serverProfile, ...clientProfile };
    } else if (serverUpdated > clientUpdated) {
      return serverProfile;
    }

    const merged = { ...serverProfile };
    Object.keys(clientProfile).forEach(key => {
      if (clientProfile[key] !== undefined && clientProfile[key] !== null) {
        if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
          merged[key] = clientProfile[key];
        }
      }
    });

    return merged;
  }

  mergeCollections(serverCollection, clientCollection, forceSync) {
    const serverMap = new Map(serverCollection.map(item => [item.id, item]));
    const clientMap = new Map(clientCollection.map(item => [item.id, item]));
    const merged = [];

    serverMap.forEach((serverItem, id) => {
      const clientItem = clientMap.get(id);
      if (clientItem) {
        const serverTime = new Date(serverItem.addedAt || 0);
        const clientTime = new Date(clientItem.addedAt || 0);
        merged.push(clientTime > serverTime ? { ...serverItem, ...clientItem } : serverItem);
      } else {
        merged.push(serverItem);
      }
    });

    clientMap.forEach((clientItem, id) => {
      if (!serverMap.has(id)) {
        merged.push(clientItem);
      }
    });

    return merged;
  }

  applyPendingChanges(userId, pendingChanges) {
    const collection = storage.getUserCollection(userId);
    const collectionMap = new Map(collection.map(item => [item.id, item]));

    pendingChanges.forEach(change => {
      switch (change.type) {
        case 'add':
          if (change.data && !collectionMap.has(change.id)) {
            collection.push({
              ...change.data,
              addedAt: change.timestamp,
              syncedAt: new Date().toISOString()
            });
          }
          break;
        case 'remove':
          const index = collection.findIndex(item => item.id === change.id);
          if (index !== -1) {
            collection.splice(index, 1);
          }
          break;
      }
    });

    storage.saveUserCollection(userId, collection);
  }

  async getUserStatistics(req, res, next) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '请提供用户ID'
        });
      }

      const profile = storage.getUserProfile(userId) || mockUsers[userId];
      const collection = storage.getUserCollection(userId);

      const statistics = this.calculateStatistics(profile, collection);

      res.json({
        success: true,
        data: statistics,
        message: '获取用户统计信息成功'
      });
    } catch (error) {
      next(error);
    }
  }

  calculateStatistics(profile, collection) {
    const fieldCounts = {};
    const yearCounts = {};
    const sourceCounts = {};

    collection.forEach(item => {
      (item.keywords || []).forEach(kw => {
        fieldCounts[kw] = (fieldCounts[kw] || 0) + 1;
      });

      if (item.year) {
        yearCounts[item.year] = (yearCounts[item.year] || 0) + 1;
      }

      if (item.source) {
        sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
      }
    });

    const topFields = Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const yearDistribution = Object.entries(yearCounts)
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year: parseInt(year), count }));

    const sourceDistribution = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }));

    return {
      totalCollected: collection.length,
      totalPublications: profile?.publicationCount || 0,
      totalCitations: profile?.totalCitations || 0,
      hIndex: profile?.hIndex || 0,
      researchFields: profile?.researchFields || [],
      topKeywords: topFields,
      yearDistribution,
      sourceDistribution,
      averageCitationPerPaper: profile?.totalCitations && profile?.publicationCount
        ? Math.round(profile.totalCitations / profile.publicationCount * 100) / 100
        : 0
    };
  }
}

module.exports = new UserController();
