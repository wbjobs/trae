import { defineStore } from 'pinia';

export const useLiteratureStore = defineStore('literature', {
  state: () => ({
    searchResults: [],
    selectedLiterature: null,
    citationList: [],
    currentFormat: 'GB/T7714',
    searchHistory: [],
    isLoading: false
  }),

  getters: {
    citationCount: (state) => state.citationList.length,
    formattedCitations: (state) => state.citationList
  },

  actions: {
    setSearchResults(results) {
      this.searchResults = results;
    },

    selectLiterature(literature) {
      this.selectedLiterature = literature;
    },

    addToCitation(literature) {
      const exists = this.citationList.find(item => item.id === literature.id);
      if (!exists) {
        this.citationList.push({
          ...literature,
          addedAt: new Date().toISOString()
        });
      }
    },

    removeFromCitation(id) {
      this.citationList = this.citationList.filter(item => item.id !== id);
    },

    clearCitationList() {
      this.citationList = [];
    },

    setCurrentFormat(format) {
      this.currentFormat = format;
    },

    addSearchHistory(query) {
      if (query && query.trim()) {
        this.searchHistory = [query, ...this.searchHistory.filter(q => q !== query)].slice(0, 10);
      }
    },

    setLoading(loading) {
      this.isLoading = loading;
    },

    clearSearch() {
      this.searchResults = [];
      this.selectedLiterature = null;
    }
  }
});
