import { defineStore } from 'pinia';

const STORAGE_KEY = 'academic_citation_tags';

const DEFAULT_TAGS = [
  { id: 'read', name: '已读', color: '#67c23a', system: true },
  { id: 'reading', name: '在读', color: '#e6a23c', system: true },
  { id: 'unread', name: '未读', color: '#f56c6c', system: true },
  { id: 'important', name: '重要', color: '#c0392b', system: false },
  { id: 'reference', name: '待引用', color: '#8e44ad', system: false },
  { id: 'background', name: '背景资料', color: '#3498db', system: false },
  { id: 'method', name: '方法参考', color: '#1abc9c', system: false },
  { id: 'related', name: '相关研究', color: '#f39c12', system: false }
];

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('读取标签存储失败:', e);
  }
  return {
    tags: DEFAULT_TAGS,
    literatureTags: {}
  };
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('保存标签存储失败:', e);
  }
}

export const useTagsStore = defineStore('tags', {
  state: () => {
    const stored = loadFromStorage();
    return {
      tags: stored.tags,
      literatureTags: stored.literatureTags
    };
  },

  getters: {
    allTags: (state) => state.tags,
    systemTags: (state) => state.tags.filter(t => t.system),
    customTags: (state) => state.tags.filter(t => !t.system),
    tagCount: (state) => state.tags.length,
    
    getLiteratureTags: (state) => (literatureId) => {
      const tagIds = state.literatureTags[literatureId] || [];
      return state.tags.filter(t => tagIds.includes(t.id));
    },
    
    getLiteratureTagNames: (state) => (literatureId) => {
      const tagIds = state.literatureTags[literatureId] || [];
      return state.tags
        .filter(t => tagIds.includes(t.id))
        .map(t => t.name);
    },
    
    getLiteratureByTag: (state) => (tagId) => {
      return Object.entries(state.literatureTags)
        .filter(([_, tags]) => tags.includes(tagId))
        .map(([id]) => id);
    },
    
    getTagUsageCount: (state) => (tagId) => {
      return Object.values(state.literatureTags)
        .filter(tags => tags.includes(tagId))
        .length;
    },
    
    getTagsStats: (state) => {
      return state.tags.map(tag => ({
        ...tag,
        usageCount: Object.values(state.literatureTags)
          .filter(tags => tags.includes(tag.id))
          .length
      }));
    }
  },

  actions: {
    persist() {
      saveToStorage({
        tags: this.tags,
        literatureTags: this.literatureTags
      });
    },

    addTag(name, color, system = false) {
      const id = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newTag = { id, name, color, system };
      this.tags.push(newTag);
      this.persist();
      return newTag;
    },

    updateTag(id, updates) {
      const index = this.tags.findIndex(t => t.id === id);
      if (index !== -1 && !this.tags[index].system) {
        this.tags[index] = { ...this.tags[index], ...updates };
        this.persist();
        return this.tags[index];
      }
      return null;
    },

    deleteTag(id) {
      const index = this.tags.findIndex(t => t.id === id);
      if (index !== -1 && !this.tags[index].system) {
        this.tags.splice(index, 1);
        
        Object.keys(this.literatureTags).forEach(litId => {
          this.literatureTags[litId] = this.literatureTags[litId].filter(tid => tid !== id);
          if (this.literatureTags[litId].length === 0) {
            delete this.literatureTags[litId];
          }
        });
        
        this.persist();
        return true;
      }
      return false;
    },

    addTagToLiterature(literatureId, tagId) {
      if (!this.literatureTags[literatureId]) {
        this.literatureTags[literatureId] = [];
      }
      
      if (!this.literatureTags[literatureId].includes(tagId)) {
        this.literatureTags[literatureId].push(tagId);
        this.persist();
        return true;
      }
      return false;
    },

    addTagsToLiterature(literatureId, tagIds) {
      if (!this.literatureTags[literatureId]) {
        this.literatureTags[literatureId] = [];
      }
      
      let added = 0;
      tagIds.forEach(tagId => {
        if (!this.literatureTags[literatureId].includes(tagId)) {
          this.literatureTags[literatureId].push(tagId);
          added++;
        }
      });
      
      if (added > 0) {
        this.persist();
      }
      return added;
    },

    removeTagFromLiterature(literatureId, tagId) {
      if (this.literatureTags[literatureId]) {
        const initialLength = this.literatureTags[literatureId].length;
        this.literatureTags[literatureId] = this.literatureTags[literatureId].filter(tid => tid !== tagId);
        
        if (this.literatureTags[literatureId].length === 0) {
          delete this.literatureTags[literatureId];
        }
        
        if (initialLength !== this.literatureTags[literatureId]?.length || !this.literatureTags[literatureId]) {
          this.persist();
          return true;
        }
      }
      return false;
    },

    batchAddTags(literatureIds, tagIds) {
      let totalAdded = 0;
      
      literatureIds.forEach(litId => {
        const added = this.addTagsToLiterature(litId, tagIds);
        totalAdded += added;
      });
      
      return totalAdded;
    },

    batchRemoveTags(literatureIds, tagIds) {
      let totalRemoved = 0;
      
      literatureIds.forEach(litId => {
        tagIds.forEach(tagId => {
          if (this.removeTagFromLiterature(litId, tagId)) {
            totalRemoved++;
          }
        });
      });
      
      return totalRemoved;
    },

    getLiteratureByMultipleTags(tagIds, matchAll = true) {
      return Object.entries(this.literatureTags)
        .filter(([_, tags]) => {
          if (matchAll) {
            return tagIds.every(tid => tags.includes(tid));
          }
          return tagIds.some(tid => tags.includes(tid));
        })
        .map(([id]) => id);
    },

    clearAllTags() {
      this.tags = [...DEFAULT_TAGS];
      this.literatureTags = {};
      this.persist();
    }
  }
});
