<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGraphStore } from '@/stores/graph';
import { websocketService } from '@/services/websocket';
import { useGraphRenderer } from '@/composables/useGraphRenderer';
import { apiService } from '@/services/api';
import { OperationFactory } from '@collaborative-graph/shared';
import type { Node, Branch, MergeResult } from '@collaborative-graph/shared';
import BranchManager from '@/components/BranchManager.vue';

const route = useRoute();
const router = useRouter();
const graphStore = useGraphStore();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isHistoryPanelOpen = ref(false);
const historyOffset = ref(0);
const historyLimit = 50;
const hasMoreHistory = ref(false);
const replaySliderValue = ref(0);

const newNodeLabel = ref('新节点');
const selectedNodeLabel = ref('');
const selectedEdgeLabel = ref('');

const isBranchPanelOpen = ref(false);
const currentBranchId = ref<string | null>(null);
const currentBranchName = ref('main');
const mergeMessage = ref<string | null>(null);

const {
  initCanvasKit,
  initCanvas,
  startRenderLoop,
  stopRenderLoop,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleWheel,
  handleContextMenu,
  setEmitHandlers,
} = useGraphRenderer(canvasRef);

function emitMoveNode(node: Node, fromX: number, fromY: number, toX: number, toY: number): void {
  const op = OperationFactory.createMoveNode({
    userId: graphStore.userId,
    graphId: graphStore.graphId || '',
    version: graphStore.version,
    nodeId: node.id,
    fromX,
    fromY,
    toX,
    toY,
  });
  websocketService.sendOperation(op);
}

function emitAddEdge(sourceId: string, targetId: string): void {
  const op = OperationFactory.createAddEdge({
    userId: graphStore.userId,
    graphId: graphStore.graphId || '',
    version: graphStore.version,
    sourceId,
    targetId,
  });
  websocketService.sendOperation(op);
}

function addNode(): void {
  const x = 300 + Math.random() * 400;
  const y = 200 + Math.random() * 300;

  const op = OperationFactory.createAddNode({
    userId: graphStore.userId,
    graphId: graphStore.graphId || '',
    version: graphStore.version,
    label: newNodeLabel.value || '新节点',
    x,
    y,
  });

  websocketService.sendOperation(op);
  newNodeLabel.value = '新节点';
}

function deleteSelected(): void {
  if (graphStore.selectedNodeId) {
    const op = OperationFactory.createDeleteNode({
      userId: graphStore.userId,
      graphId: graphStore.graphId || '',
      version: graphStore.version,
      nodeId: graphStore.selectedNodeId,
    });
    websocketService.sendOperation(op);
    graphStore.clearSelection();
  } else if (graphStore.selectedEdgeId) {
    const edge = graphStore.edges.get(graphStore.selectedEdgeId);
    if (edge) {
      const op = OperationFactory.createDeleteEdge({
        userId: graphStore.userId,
        graphId: graphStore.graphId || '',
        version: graphStore.version,
        edgeId: graphStore.selectedEdgeId,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
      });
      websocketService.sendOperation(op);
      graphStore.clearSelection();
    }
  }
}

function updateSelectedNodeLabel(): void {
  if (!graphStore.selectedNodeId || !selectedNodeLabel.value) return;

  const node = graphStore.nodes.get(graphStore.selectedNodeId);
  if (!node) return;

  const op = OperationFactory.createUpdateNodeLabel({
    userId: graphStore.userId,
    graphId: graphStore.graphId || '',
    version: graphStore.version,
    nodeId: graphStore.selectedNodeId,
    oldLabel: node.label,
    newLabel: selectedNodeLabel.value,
  });

  websocketService.sendOperation(op);
}

function updateSelectedEdgeLabel(): void {
  if (!graphStore.selectedEdgeId || !selectedEdgeLabel.value) return;

  const edge = graphStore.edges.get(graphStore.selectedEdgeId);
  if (!edge) return;

  const op = OperationFactory.createUpdateEdgeLabel({
    userId: graphStore.userId,
    graphId: graphStore.graphId || '',
    version: graphStore.version,
    edgeId: graphStore.selectedEdgeId,
    oldLabel: edge.label || '',
    newLabel: selectedEdgeLabel.value,
  });

  websocketService.sendOperation(op);
}

function loadMoreHistory(): void {
  websocketService.requestHistory(graphStore.graphId || '', historyLimit, historyOffset.value);
}

function toggleHistoryPanel(): void {
  isHistoryPanelOpen.value = !isHistoryPanelOpen.value;
  if (isHistoryPanelOpen.value) {
    websocketService.requestHistory(graphStore.graphId || '', historyLimit, 0);
    historyOffset.value = historyLimit;
  }
}

function replayToVersion(version: number): void {
  if (version < 0 || version > graphStore.historyCount) return;
  websocketService.replayToVersion(graphStore.graphId || '', version);
}

function resetToCurrent(): void {
  graphStore.stopReplay();
  websocketService.requestState(graphStore.graphId || '');
}

function goBack(): void {
  if (graphStore.graphId) {
    websocketService.leaveGraph(graphStore.graphId, graphStore.userId);
  }
  graphStore.reset();
  router.push('/');
}

function toggleBranchPanel(): void {
  isBranchPanelOpen.value = !isBranchPanelOpen.value;
}

async function switchToBranch(branch: Branch): void {
  if (!graphStore.graphId) return;

  mergeMessage.value = null;

  websocketService.leaveGraph(graphStore.graphId, graphStore.userId);

  currentBranchId.value = branch.id;
  currentBranchName.value = branch.name;

  const { state } = await apiService.getGraphState(graphStore.graphId, branch.currentVersion);
  graphStore.setGraphState(state);

  websocketService.joinGraph(graphStore.graphId, graphStore.userId);
  isBranchPanelOpen.value = false;
}

function handleMerge(result: MergeResult): void {
  if (result.success) {
    mergeMessage.value = `✅ 合并成功！应用了 ${result.mergedOperations.length} 个操作`;
    isBranchPanelOpen.value = false;

    setTimeout(async () => {
      if (graphStore.graphId) {
        websocketService.leaveGraph(graphStore.graphId, graphStore.userId);
        const { state } = await apiService.getGraphState(
          graphStore.graphId,
          result.newVersion,
        );
        graphStore.setGraphState(state);
        websocketService.joinGraph(graphStore.graphId, graphStore.userId);
      }
    }, 1000);
  } else {
    mergeMessage.value = `⚠️ 合并存在 ${result.conflicts.length} 个未解决的冲突`;
  }

  setTimeout(() => {
    mergeMessage.value = null;
  }, 5000);
}

function handleBranchError(message: string): void {
  console.error('Branch error:', message);
}

function handleSelectedNodeChange(): void {
  if (graphStore.selectedNodeId) {
    const node = graphStore.nodes.get(graphStore.selectedNodeId);
    selectedNodeLabel.value = node?.label || '';
  }
}

function handleSelectedEdgeChange(): void {
  if (graphStore.selectedEdgeId) {
    const edge = graphStore.edges.get(graphStore.selectedEdgeId);
    selectedEdgeLabel.value = edge?.label || '';
  }
}

watch(() => graphStore.selectedNodeId, handleSelectedNodeChange);
watch(() => graphStore.selectedEdgeId, handleSelectedEdgeChange);
watch(() => graphStore.historyCount, (newCount) => {
  replaySliderValue.value = newCount;
  hasMoreHistory.value = historyOffset.value < newCount;
});

function handleResize(): void {
  initCanvas();
}

onMounted(async () => {
  const graphId = route.params.id as string;
  graphStore.graphId = graphId;

  websocketService.setStore(graphStore);

  await initCanvasKit();
  initCanvas();
  startRenderLoop();

  setEmitHandlers(emitMoveNode, emitAddEdge);

  try {
    const mainBranch = await apiService.getMainBranch(graphId);
    currentBranchId.value = mainBranch.id;
    currentBranchName.value = mainBranch.name;
  } catch (err) {
    console.warn('Failed to load main branch:', err);
  }

  websocketService.joinGraph(graphId, graphStore.userId);
  websocketService.requestHistory(graphId, historyLimit, 0);
  historyOffset.value = historyLimit;

  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);
});

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return;
    }
    deleteSelected();
  }
  if (event.key === 'Escape') {
    graphStore.clearSelection();
  }
}

onUnmounted(() => {
  stopRenderLoop();
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
  if (graphStore.graphId) {
    websocketService.leaveGraph(graphStore.graphId, graphStore.userId);
  }
});
</script>

<template>
  <div class="graph-editor">
    <div class="top-bar">
      <button class="btn btn-secondary" @click="goBack">
        ← 返回
      </button>
      <div class="graph-info">
        <span class="graph-id">图 ID: {{ graphStore.graphId }}</span>
        <span class="branch">🌿 分支: {{ currentBranchName }}</span>
        <span class="version">版本: {{ graphStore.version }}</span>
        <span class="node-count">节点: {{ graphStore.nodeCount }}</span>
        <span class="edge-count">边: {{ graphStore.edgeCount }}</span>
        <span class="users">在线用户: {{ graphStore.connectedUsers.length }}</span>
      </div>
      <div class="top-bar-actions">
        <button class="btn btn-secondary" @click="toggleBranchPanel">
          分支管理
        </button>
        <button class="btn btn-secondary" @click="toggleHistoryPanel">
          历史记录
        </button>
      </div>
    </div>

    <div v-if="mergeMessage" class="merge-message">
      {{ mergeMessage }}
    </div>

    <div class="main-content">
      <div class="sidebar">
        <div class="tool-panel card">
          <h3>操作工具</h3>
          <div class="tool-section">
            <input
              v-model="newNodeLabel"
              type="text"
              placeholder="节点名称"
              @keyup.enter="addNode"
            />
            <button class="btn btn-primary" @click="addNode">
              + 添加节点
            </button>
          </div>
          <div class="tool-section">
            <button class="btn btn-danger" @click="deleteSelected" :disabled="!graphStore.selectedNodeId && !graphStore.selectedEdgeId">
              删除选中
            </button>
            <p class="hint">提示：选中节点后按 Shift+拖拽到另一个节点来创建边</p>
            <p class="hint">右键拖拽可移动视图，滚轮可缩放</p>
          </div>
        </div>

        <div v-if="graphStore.selectedNodeId" class="properties-panel card">
          <h3>节点属性</h3>
          <div class="property">
            <label>节点名称:</label>
            <input
              v-model="selectedNodeLabel"
              type="text"
              @keyup.enter="updateSelectedNodeLabel"
            />
            <button class="btn btn-primary btn-sm" @click="updateSelectedNodeLabel">
              更新
            </button>
          </div>
        </div>

        <div v-if="graphStore.selectedEdgeId" class="properties-panel card">
          <h3>边属性</h3>
          <div class="property">
            <label>边标签:</label>
            <input
              v-model="selectedEdgeLabel"
              type="text"
              placeholder="边标签（可选）"
              @keyup.enter="updateSelectedEdgeLabel"
            />
            <button class="btn btn-primary btn-sm" @click="updateSelectedEdgeLabel">
              更新
            </button>
          </div>
        </div>
      </div>

      <div class="canvas-container">
        <canvas
          ref="canvasRef"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @wheel="handleWheel"
          @contextmenu="handleContextMenu"
        ></canvas>

        <div v-if="graphStore.isReplaying" class="replay-overlay">
          <div class="replay-controls">
            <span>历史回放模式 - 版本: {{ replaySliderValue }}</span>
            <button class="btn btn-primary" @click="resetToCurrent">
              返回当前状态
            </button>
          </div>
        </div>
      </div>

      <div v-if="isHistoryPanelOpen" class="history-panel card">
        <div class="history-header">
          <h3>操作历史</h3>
          <span>总操作数: {{ graphStore.historyCount }}</span>
        </div>

        <div class="replay-controls">
          <label>回放到版本:</label>
          <input
            v-model.number="replaySliderValue"
            type="range"
            min="0"
            :max="graphStore.historyCount"
            step="1"
            @input="replayToVersion(replaySliderValue)"
          />
          <span>{{ replaySliderValue }}</span>
        </div>

        <div class="history-list">
          <div
            v-for="entry in graphStore.history"
            :key="entry.sequenceNumber"
            class="history-item"
            @click="replayToVersion(entry.sequenceNumber + 1)"
          >
            <div class="op-type">{{ entry.operation.type }}</div>
            <div class="op-info">{{ JSON.stringify(entry.operation).substring(0, 60) }}...</div>
            <div class="op-time">{{ new Date(entry.timestamp).toLocaleTimeString() }}</div>
          </div>
        </div>

        <button
          v-if="hasMoreHistory"
          class="btn btn-secondary"
          @click="loadMoreHistory"
        >
          加载更多
        </button>
      </div>

      <div v-if="isBranchPanelOpen" class="branch-panel card">
        <BranchManager
          :graphId="graphStore.graphId || ''"
          :currentBranchId="currentBranchId"
          @switch="switchToBranch"
          @merged="handleMerge"
          @error="handleBranchError"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-editor {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f5;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background-color: white;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.graph-info {
  display: flex;
  gap: 20px;
  flex: 1;
  font-size: 14px;
  color: #666;
}

.graph-info span {
  background-color: #f0f0f0;
  padding: 4px 8px;
  border-radius: 4px;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  background-color: #fafafa;
  border-right: 1px solid #ddd;
}

.tool-panel h3,
.properties-panel h3,
.history-header h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #333;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.hint {
  font-size: 12px;
  color: #888;
  margin: 4px 0;
}

.property {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.property label {
  font-size: 13px;
  color: #666;
}

.btn-sm {
  align-self: flex-start;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.canvas-container canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.replay-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background-color: rgba(255, 87, 34, 0.9);
  color: white;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
}

.history-panel {
  width: 350px;
  display: flex;
  flex-direction: column;
  margin: 20px;
  padding: 16px;
  overflow: hidden;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.history-header span {
  font-size: 13px;
  color: #888;
}

.replay-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.replay-controls input[type="range"] {
  flex: 1;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 12px;
}

.history-item {
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 4px;
  background-color: #f9f9f9;
  transition: background-color 0.2s;
}

.history-item:hover {
  background-color: #e3f2fd;
}

.op-type {
  font-weight: 500;
  font-size: 13px;
  color: #00bcd4;
  margin-bottom: 2px;
}

.op-info {
  font-size: 11px;
  color: #666;
  font-family: monospace;
  margin-bottom: 2px;
  word-break: break-all;
}

.op-time {
  font-size: 11px;
  color: #999;
}

.top-bar-actions {
  display: flex;
  gap: 8px;
}

.merge-message {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: var(--bg-secondary, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  animation: fadeInOut 5s ease-in-out;
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  10% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  90% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
}

.branch-panel {
  width: 400px;
  display: flex;
  flex-direction: column;
  margin: 20px;
  padding: 0;
  overflow: hidden;
}

.branch-panel > :deep(.branch-manager) {
  height: 100%;
  overflow-y: auto;
}
</style>
