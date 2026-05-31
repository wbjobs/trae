<template>
  <div class="container">
    <header class="header">
      <h1>P2P CDN 边缘节点调度系统</h1>
      <p>基于 libp2p + WebRTC 的分布式内容分发网络</p>
    </header>

    <div class="grid grid-2">
      <div class="card">
        <h2 class="card-title">节点状态</h2>
        <div class="info-list">
          <li>
            <span class="info-label">节点ID</span>
            <span class="info-value">{{ nodeId || '未连接' }}</span>
          </li>
          <li>
            <span class="info-label">连接状态</span>
            <span :class="['status-badge', 'status-' + connectionStatus]">
              {{ statusText }}
            </span>
          </li>
          <li>
            <span class="info-label">地理位置</span>
            <span class="info-value">{{ locationText }}</span>
          </li>
          <li>
            <span class="info-label">上传速度</span>
            <span class="info-value">{{ bandwidthText }}</span>
          </li>
          <li>
            <span class="info-label">贡献度</span>
            <span :class="['info-value', contributionRatio < 0.3 ? 'text-danger' : '']">
              {{ contributionRatioText }}
            </span>
          </li>
          <li v-if="chokeStatus">
            <span class="info-label">Choke状态</span>
            <span :class="['status-badge', chokeStatus.is_choked ? 'status-disconnected' : 'status-connected']">
              {{ chokeStatus.is_choked ? '已限制' : '正常' }}
            </span>
          </li>
          <li v-if="chokeStatus?.is_choked && chokeStatus.download_speed_limit">
            <span class="info-label">限速至</span>
            <span class="info-value text-danger">
              {{ (chokeStatus.download_speed_limit / 1000000).toFixed(1) }} Mbps
            </span>
          </li>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 12px;">
          <button 
            class="btn btn-primary" 
            @click="connectToTracker" 
            :disabled="connectionStatus !== 'disconnected' && connectionStatus !== 'error'"
          >
            {{ connectionStatus === 'disconnected' ? '连接到Tracker' : '重新连接' }}
          </button>
          <button 
            class="btn btn-danger" 
            @click="disconnectFromTracker" 
            :disabled="connectionStatus === 'disconnected'"
          >
            断开连接
          </button>
        </div>
      </div>

      <div class="card">
        <h2 class="card-title">网络统计</h2>
        <div class="stats-grid">
          <div class="stat-card">
          <div class="stat-value">{{ nodes.length }}</div>
          <div class="stat-label">活跃节点</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ files.length }}</div>
          <div class="stat-label">文件总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ totalChunksHeld }}</div>
          <div class="stat-label">持有分片</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatSize(totalBytesHeld) }}</div>
          <div class="stat-label">缓存大小</div>
        </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">文件上传与分发</h2>
      
      <div 
        class="upload-area"
        :class="{ dragover: isDragOver }"
        @click="triggerFileInput"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <input 
          type="file" 
          ref="fileInput" 
          style="display: none" 
          @change="handleFileSelect"
        />
        <div class="upload-icon">📁</div>
        <div style="margin-bottom: 8px; font-size: 1.1rem; font-weight: 500;">
          点击或拖拽文件到此处上传
        </div>
        <div class="upload-hint">支持最大 1GB 文件，自动分片并通过 P2P 网络分发</div>
      </div>

      <div v-if="uploadState" class="progress-container">
        <div class="progress-bar">
          <div 
          class="progress-fill" 
          :style="{ width: uploadState.progress * 100 + '%' }"
        ></div>
        </div>
        <div class="progress-text">
          {{ uploadState.statusText }} - {{ (uploadState.progress * 100).toFixed(1) }}%
        </div>
        <div class="chunk-grid">
          <div 
            v-for="i in uploadState.totalChunks" 
            :key="i"
            :class="[
              'chunk-item',
              uploadState.completedChunks.has(i - 1) ? 'chunk-held' : ''
            ]"
          ></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">文件列表</h2>
      <div v-if="files.length === 0" style="color: #94a3b8; text-align: center; padding: 20px;">
        暂无文件
      </div>
      <div v-else>
        <div v-for="file in files" :key="file.id" class="file-item">
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">
              {{ formatSize(file.size) }} · {{ file.total_chunks }} 个分片 · {{ formatDate(file.created_at) }}
            </div>
            <div class="chunk-grid">
              <div 
                v-for="i in file.total_chunks" 
                :key="i"
                :class="[
                  'chunk-item',
                  hasChunk(file.id, i - 1) ? 'chunk-held' : ''
                ]"
              ></div>
            </div>
          </div>
          <div class="file-actions">
            <button 
              class="btn btn-success" 
              @click="downloadFile(file.id)"
              :disabled="!isConnected"
            >
              下载
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">节点列表</h2>
      <div v-if="nodes.length === 0" style="color: #94a3b8; text-align: center; padding: 20px;">
        暂无节点
      </div>
      <div v-else>
        <div v-for="node in nodes" :key="node.id" class="node-item">
          <div :class="['node-status', node.is_choked ? 'node-choked' : (node.is_active ? 'node-active' : 'node-inactive')]"></div>
          <div class="node-info">
            <div class="node-id">
              {{ node.id }}
              <span v-if="node.is_choked" class="status-badge status-disconnected" style="margin-left: 8px;">已限制</span>
            </div>
            <div class="node-meta">
              评分: {{ (node.score * 100).toFixed(0) }}分 · 
              贡献度: {{ (node.stats?.contribution_ratio ?? 1).toFixed(2) }} · 
              延迟: {{ node.bandwidth.latency_ms }}ms · 
              位置: {{ node.location.city || node.location.country || '未知' }}
            </div>
            <div v-if="node.stats" class="node-meta" style="margin-top: 4px;">
              上传: {{ formatSize(node.stats.total_uploaded) }} · 
              下载: {{ formatSize(node.stats.total_downloaded) }}
            </div>
          </div>
        </div>
      </div>
      <div style="margin-top: 16px;">
        <button class="btn btn-primary" @click="refreshNodes" :disabled="!isConnected">
          刷新节点列表
        </button>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Demo: 生成测试文件</h2>
      <p style="color: #94a3b8; margin-bottom: 16px;">
        快速生成指定大小的测试文件用于演示 P2P 分发功能</p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-primary" @click="generateTestFile(100 * 1024 * 1024)">生成 100MB</button>
        <button class="btn btn-primary" @click="generateTestFile(500 * 1024 * 1024)">生成 500MB</button>
        <button class="btn btn-primary" @click="generateTestFile(1024 * 1024 * 1024)">生成 1GB</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { p2pManager, ConnectionStatus } from './services/p2pManager';
import { fileManager } from './services/fileManager';
import { trackerApi } from './services/api';
import type { FileInfo, NodeInfo, UploadState, ChokeStatus } from './types';

const fileInput = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);
const nodeId = ref<string | null>(null);
const connectionStatus = ref<ConnectionStatus>('disconnected');
const nodes = ref<NodeInfo[]>([]);
const files = ref<FileInfo[]>([]);
const uploadState = ref<UploadState | null>(null);
const heldChunks = ref<Map<string, Set<number>>>(new Map());
const chokeStatus = ref<ChokeStatus | null>(null);

const statusText = computed(() => {
  const map: Record<ConnectionStatus, string> = {
    disconnected: '未连接',
    connecting: '连接中',
    connected: '已连接',
    error: '连接错误',
  };
  return map[connectionStatus.value];
});

const isConnected = computed(() => connectionStatus.value === 'connected');

const locationText = computed(() => {
  const loc = p2pManager['location'];
  if (loc.city || loc.country) {
    return `${loc.city || ''} ${loc.country || ''}`;
  }
  return `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
});

const bandwidthText = computed(() => {
  const bw = p2pManager['bandwidth'];
  if (bw.upload_speed === 0) return '未检测';
  return `${(bw.upload_speed / 1000000).toFixed(1)} Mbps`;
});

const contributionRatio = computed(() => {
  return chokeStatus.value?.contribution_ratio ?? 1.0;
});

const contributionRatioText = computed(() => {
  const ratio = contributionRatio.value;
  if (ratio < 0.3) {
    return `${(ratio * 100).toFixed(1)}% ⚠️`;
  }
  return `${(ratio * 100).toFixed(1)}%`;
});

const totalChunksHeld = computed(() => {
  let count = 0;
  heldChunks.value.forEach((chunks) => {
    count += chunks.size;
  });
  return count;
});

const totalBytesHeld = computed(() => {
  let total = 0;
  heldChunks.value.forEach((chunks, fileId) => {
  const file = files.value.find(f => f.id === fileId);
    if (file) {
      total += chunks.size * 4 * 1024 * 1024;
    }
  });
  return total;
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function hasChunk(fileId: string, chunkIndex: number): boolean {
  return heldChunks.value.get(fileId)?.has(chunkIndex) || false;
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    uploadFile(input.files[0]);
  }
}

function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    uploadFile(event.dataTransfer.files[0]);
  }
}

async function uploadFile(file: File) {
  if (!isConnected.value) {
    alert('请先连接到Tracker服务器');
    return;
  }
  try {
    uploadState.value = await fileManager.uploadFile(file);
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

async function connectToTracker() {
  try {
    connectionStatus.value = 'connecting';
    await p2pManager.detectLocation();
    await p2pManager.measureBandwidth();
    nodeId.value = await p2pManager.connect();
    connectionStatus.value = 'connected';
    refreshNodes();
    refreshFiles();
  } catch (error) {
    connectionStatus.value = 'error';
    console.error('Connection failed:', error);
  }
}

function disconnectFromTracker() {
  p2pManager.disconnect();
  nodeId.value = null;
  connectionStatus.value = 'disconnected';
  nodes.value = [];
}

async function refreshNodes() {
  if (!isConnected.value) return;
  try {
    nodes.value = await trackerApi.listNodes();
  } catch (error) {
    console.error('Failed to fetch nodes:', error);
  }
}

async function refreshFiles() {
  if (!isConnected.value) return;
  try {
    files.value = await trackerApi.listFiles();
  } catch (error) {
    console.error('Failed to fetch files:', error);
  }
}

async function downloadFile(fileId: string) {
  if (!isConnected.value) return;
  try {
    const file = await fileManager.downloadFile(fileId);
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    alert('下载失败: ' + error);
  }
}

async function generateTestFile(size: number) {
  if (!isConnected.value) {
    alert('请先连接到Tracker服务器');
    return;
  }
  try {
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);
    crypto.getRandomValues(view);
    const file = new File([buffer], `test_${formatSize(size)}.bin`, { type: 'application/octet-stream' });
    await uploadFile(file);
  } catch (error) {
    console.error('Failed to generate test file:', error);
  }
}

function handleUploadProgress(state: UploadState) {
  uploadState.value = {
    ...state,
    statusText: getStatusText(state.status),
  };
  if (state.status === 'completed') {
    refreshFiles();
  }
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    idle: '就绪',
    hashing: '计算哈希中',
    uploading: '上传中',
    distributing: 'P2P分发中',
    completed: '完成',
    error: '错误',
  };
  return map[status] || status;
}

let refreshInterval: number | null = null;

function handleChokeStatusChange(status: ChokeStatus | null) {
  chokeStatus.value = status;
}

onMounted(() => {
  p2pManager.onConnectionChange((status) => {
    connectionStatus.value = status;
  });

  p2pManager.onChokeStatusChange(handleChokeStatusChange);

  fileManager.onUploadProgress(handleUploadProgress);

  refreshInterval = window.setInterval(() => {
    if (isConnected.value) {
      refreshNodes();
      refreshFiles();
    }
  }, 10000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  p2pManager.offChokeStatusChange(handleChokeStatusChange);
  fileManager.offUploadProgress(handleUploadProgress);
});
</script>
