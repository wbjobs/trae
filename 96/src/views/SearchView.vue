<template>
  <div class="search-window">
    <div class="search-header">
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索文档... (按 ESC 关闭)"
        @input="handleSearch"
        @keydown="handleKeydown"
      />
    </div>

    <div class="search-results">
      <div
        v-for="(result, index) in searchResults"
        :key="result.id"
        class="result-item"
        :class="{ active: selectedIndex === index }"
        @click="openResult(result)"
        @mouseenter="selectedIndex = index"
      >
        <div class="result-title" v-html="highlightText(result.title, searchQuery)"></div>
        <div
          class="result-preview"
          v-html="highlightText(getPreviewText(result.content, searchQuery, 150), searchQuery)"
        ></div>
        <div class="result-path">{{ result.path }}</div>
      </div>

      <div v-if="searchQuery && searchResults.length === 0" class="empty-state">
        未找到相关结果
      </div>

      <div v-if="!searchQuery" class="empty-state hint">
        输入关键词开始搜索<br />
        <span class="shortcut">Ctrl+Shift+F 随时唤起</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { SearchResult } from '../types'
import { highlightText, getPreviewText } from '../utils/highlight'

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const selectedIndex = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  searchInput.value?.focus()
})

watch(searchQuery, () => {
  selectedIndex.value = 0
})

async function handleSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  searchTimeout = setTimeout(async () => {
    if (window.api?.search) {
      searchResults.value = await window.api.search(searchQuery.value)
    }
  }, 150)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    window.api?.closeSearchWindow()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (selectedIndex.value < searchResults.value.length - 1) {
      selectedIndex.value++
    }
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (selectedIndex.value > 0) {
      selectedIndex.value--
    }
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const selected = searchResults.value[selectedIndex.value]
    if (selected) {
      openResult(selected)
    }
    return
  }
}

function openResult(result: SearchResult) {
  if (window.api?.openDocument) {
    window.api.openDocument(result.id)
    window.api?.closeSearchWindow()
  }
}
</script>

<style scoped>
.search-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.search-header {
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.15);
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.result-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.result-item:hover,
.result-item.active {
  background: #f5f5f5;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin-bottom: 6px;
  line-height: 1.4;
}

.result-preview {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
  margin-bottom: 6px;
}

.result-path {
  font-size: 11px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
  text-align: center;
}

.empty-state.hint {
  line-height: 1.8;
}

.shortcut {
  font-size: 12px;
  color: #bbb;
  margin-top: 8px;
}
</style>
