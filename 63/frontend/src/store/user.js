import { defineStore } from 'pinia';

const STORAGE_KEY = 'academic_citation_user_data';

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('读取本地存储失败:', e);
  }
  return null;
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('保存本地存储失败:', e);
  }
}

export const useUserStore = defineStore('user', {
  state: () => {
    const stored = loadFromStorage();
    return {
      userId: stored?.userId || 'user-001',
      profile: stored?.profile || null,
      collection: stored?.collection || [],
      statistics: stored?.statistics || null,
      isLoading: false,
      lastSyncAt: stored?.lastSyncAt || null,
      pendingChanges: stored?.pendingChanges || []
    };
  },

  getters: {
    isLoggedIn: (state) => !!state.profile,
    collectionCount: (state) => state.collection.length,
    hasPendingChanges: (state) => state.pendingChanges.length > 0
  },

  actions: {
    persist() {
      saveToStorage({
        userId: this.userId,
        profile: this.profile,
        collection: this.collection,
        statistics: this.statistics,
        lastSyncAt: this.lastSyncAt,
        pendingChanges: this.pendingChanges
      });
    },

    setProfile(profile) {
      this.profile = {
        ...this.profile,
        ...profile,
        updatedAt: new Date().toISOString()
      };
      this.persist();
    },

    setCollection(collection) {
      this.collection = collection.map(item => ({
        ...item,
        syncedAt: item.syncedAt || new Date().toISOString()
      }));
      this.persist();
    },

    setStatistics(statistics) {
      this.statistics = statistics;
      this.persist();
    },

    addToCollection(literature) {
      const exists = this.collection.find(item => item.id === literature.id);
      if (!exists) {
        const newItem = {
          ...literature,
          addedAt: new Date().toISOString(),
          _status: 'pending_add'
        };
        this.collection.push(newItem);
        this.pendingChanges.push({
          type: 'add',
          id: literature.id,
          data: newItem,
          timestamp: new Date().toISOString()
        });
        this.persist();
        return true;
      }
      return false;
    },

    removeFromCollection(id) {
      const item = this.collection.find(item => item.id === id);
      if (item) {
        this.collection = this.collection.filter(item => item.id !== id);
        this.pendingChanges.push({
          type: 'remove',
          id,
          timestamp: new Date().toISOString()
        });
        this.persist();
        return true;
      }
      return false;
    },

    updateProfileField(field, value) {
      if (this.profile) {
        this.profile[field] = value;
        this.profile.updatedAt = new Date().toISOString();
        this.pendingChanges.push({
          type: 'profile_update',
          field,
          value,
          timestamp: new Date().toISOString()
        });
        this.persist();
      }
    },

    mergeWithServer(serverData) {
      if (!serverData) return;

      if (serverData.profile) {
        const serverUpdatedAt = new Date(serverData.profile.updatedAt || 0);
        const localUpdatedAt = new Date(this.profile?.updatedAt || 0);
        
        if (serverUpdatedAt > localUpdatedAt) {
          this.profile = serverData.profile;
        } else if (this.profile) {
          this.profile = { ...serverData.profile, ...this.profile };
        } else {
          this.profile = serverData.profile;
        }
      }

      if (serverData.collection && Array.isArray(serverData.collection)) {
        const serverItems = new Map(serverData.collection.map(item => [item.id, item]));
        const localItems = new Map(this.collection.map(item => [item.id, item]));
        const merged = [];

        serverItems.forEach((serverItem, id) => {
          const localItem = localItems.get(id);
          if (localItem) {
            const serverTime = new Date(serverItem.addedAt || 0);
            const localTime = new Date(localItem.addedAt || 0);
            merged.push(serverTime > localTime ? serverItem : localItem);
          } else {
            merged.push(serverItem);
          }
        });

        localItems.forEach((localItem, id) => {
          if (!serverItems.has(id) && localItem._status !== 'pending_remove') {
            merged.push(localItem);
          }
        });

        this.collection = merged.map(item => ({ ...item, _status: undefined }));
      }

      if (serverData.statistics) {
        this.statistics = serverData.statistics;
      }

      this.lastSyncAt = new Date().toISOString();
      this.pendingChanges = [];
      this.persist();
    },

    markAsSynced() {
      this.collection = this.collection.map(item => ({
        ...item,
        _status: undefined,
        syncedAt: new Date().toISOString()
      }));
      this.pendingChanges = [];
      this.lastSyncAt = new Date().toISOString();
      this.persist();
    },

    setLoading(loading) {
      this.isLoading = loading;
    },

    clearUser() {
      this.profile = null;
      this.collection = [];
      this.statistics = null;
      this.pendingChanges = [];
      this.lastSyncAt = null;
      localStorage.removeItem(STORAGE_KEY);
    }
  }
});
