<template>
  <div class="branch-manager">
    <div class="branch-header">
      <h3>分支管理</h3>
      <button
        v-if="!showCreateForm"
        class="btn btn-primary btn-sm"
        @click="showCreateForm = true"
      >
        + 创建分支
      </button>
    </div>

    <div v-if="showCreateForm" class="create-form">
      <div class="form-group">
        <label>分支名称</label>
        <input
          v-model="newBranchName"
          type="text"
          placeholder="输入分支名称"
          maxlength="50"
        />
      </div>

      <div class="form-group">
        <label>从哪个分支创建</label>
        <select v-model="selectedParentBranchId">
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }} (v{{ branch.currentVersion }})
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>版本（可选，留空表示最新版本）</label>
        <input
          v-model.number="fromVersion"
          type="number"
          placeholder="输入版本号"
          min="0"
        />
      </div>

      <div class="form-group">
        <label>描述（可选）</label>
        <textarea
          v-model="newBranchDescription"
          placeholder="描述此分支的用途"
          rows="2"
        ></textarea>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary btn-sm" @click="cancelCreate">
          取消
        </button>
        <button
          class="btn btn-primary btn-sm"
          @click="createBranch"
          :disabled="!canCreateBranch || isCreating"
        >
          {{ isCreating ? '创建中...' : '创建' }}
        </button>
      </div>
    </div>

    <div class="branch-list">
      <div
        v-for="branch in branches"
        :key="branch.id"
        class="branch-item"
        :class="{
          'is-main': branch.isMain,
          'is-current': currentBranchId === branch.id,
        }"
      >
        <div class="branch-info">
          <div class="branch-name-row">
            <span class="branch-icon">
              {{ branch.isMain ? '🌿' : '🌱' }}
            </span>
            <span class="branch-name">{{ branch.name }}</span>
            <span v-if="branch.isMain" class="badge badge-main">main</span>
            <span v-if="currentBranchId === branch.id" class="badge badge-current">
              当前
            </span>
          </div>
          <div class="branch-meta">
            <span>版本: v{{ branch.currentVersion }}</span>
            <span>操作: {{ branch.operationCount }}</span>
            <span v-if="branch.parentBranchId">
              源自: {{ getParentBranchName(branch.parentBranchId) }}@v{{ branch.parentVersion }}
            </span>
          </div>
          <div v-if="branch.description" class="branch-desc">
            {{ branch.description }}
          </div>
        </div>

        <div class="branch-actions">
          <button
            v-if="currentBranchId !== branch.id"
            class="btn btn-secondary btn-sm"
            @click="switchToBranch(branch)"
          >
            切换
          </button>
          <button
            class="btn btn-info btn-sm"
            @click="showMergeDialog(branch)"
          >
            合并
          </button>
          <button
            v-if="!branch.isMain"
            class="btn btn-danger btn-sm"
            @click="confirmDeleteBranch(branch)"
          >
            删除
          </button>
        </div>
      </div>

      <div v-if="branches.length === 0" class="empty-state">
        暂无分支
      </div>
    </div>

    <div v-if="mergeDialogVisible" class="merge-dialog-overlay">
      <div class="merge-dialog">
        <h3>合并分支</h3>

        <div class="merge-content">
          <div class="form-group">
            <label>源分支（要合并的分支）</label>
            <div class="branch-preview">
              <strong>{{ sourceBranch?.name }}</strong>
              <span class="text-muted">v{{ sourceBranch?.currentVersion }}</span>
            </div>
          </div>

          <div class="form-group">
            <label>目标分支（合并到哪个分支）</label>
            <select v-model="mergeTargetBranchId">
              <option
                v-for="branch in mergeableBranches"
                :key="branch.id"
                :value="branch.id"
              >
                {{ branch.name }} (v{{ branch.currentVersion }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>合并策略</label>
            <select v-model="mergeStrategy">
              <option value="auto">自动（推荐）</option>
              <option value="ours">优先使用目标分支</option>
              <option value="theirs">优先使用源分支</option>
            </select>
          </div>

          <div v-if="mergePreview" class="merge-preview-box">
            <h4>合并预览</h4>
            <div v-if="mergePreview.hasConflicts">
              <div class="conflict-warning">
                ⚠️ 检测到 {{ mergePreview.conflictCount }} 个冲突
              </div>
              <div class="conflict-list">
                <div
                  v-for="(conflict, index) in mergePreview.sampleConflicts"
                  :key="index"
                  class="conflict-item"
                >
                  <span class="conflict-type">{{ conflict.type === 'node' ? '节点' : '边' }}</span>
                  <span class="conflict-target">{{ conflict.targetId }}</span>
                  <span v-if="conflict.autoResolved" class="badge badge-auto">自动解决</span>
                </div>
              </div>
            </div>
            <div v-else class="no-conflicts">
              ✅ 无冲突，预计应用 {{ mergePreview.estimatedNewOperations }} 个操作
            </div>
          </div>
        </div>

        <div class="merge-actions">
          <button class="btn btn-secondary" @click="closeMergeDialog">
            取消
          </button>
          <button
            class="btn btn-primary"
            @click="executeMerge"
            :disabled="!canMerge || isMerging"
          >
            {{ isMerging ? '合并中...' : '合并' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="deleteDialogVisible" class="delete-dialog-overlay">
      <div class="delete-dialog">
        <h3>确认删除分支</h3>
        <p>
          确定要删除分支 <strong>"{{ branchToDelete?.name }}"</strong> 吗？
          此操作无法撤销。
        </p>
        <div class="delete-actions">
          <button class="btn btn-secondary" @click="cancelDelete">
            取消
          </button>
          <button
            class="btn btn-danger"
            @click="deleteBranch"
            :disabled="isDeleting"
          >
            {{ isDeleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { apiService } from '../services/api';
import type { Branch, MergeResult } from '@collaborative-graph/shared';

const props = defineProps<{
  graphId: string;
  currentBranchId: string | null;
}>();

const emit = defineEmits<{
  (e: 'switch', branch: Branch): void;
  (e: 'merged', result: MergeResult): void;
  (e: 'error', message: string): void;
}>();

const branches = ref<Branch[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const showCreateForm = ref(false);
const newBranchName = ref('');
const newBranchDescription = ref('');
const selectedParentBranchId = ref<string | null>(null);
const fromVersion = ref<number | null>(null);
const isCreating = ref(false);

const mergeDialogVisible = ref(false);
const sourceBranch = ref<Branch | null>(null);
const mergeTargetBranchId = ref<string | null>(null);
const mergeStrategy = ref<'ours' | 'theirs' | 'auto'>('auto');
const mergePreview = ref<{
  hasConflicts: boolean;
  conflictCount: number;
  sampleConflicts: Array<{
    type: 'node' | 'edge';
    targetId: string;
    autoResolved: boolean;
  }>;
  estimatedNewOperations: number;
} | null>(null);
const isMerging = ref(false);

const deleteDialogVisible = ref(false);
const branchToDelete = ref<Branch | null>(null);
const isDeleting = ref(false);

const canCreateBranch = computed(() => {
  return newBranchName.value.trim().length > 0 && !isCreating.value;
});

const mergeableBranches = computed(() => {
  if (!sourceBranch.value) return [];
  return branches.value.filter(
    (b) => b.id !== sourceBranch.value!.id && !b.isMain,
  );
});

const canMerge = computed(() => {
  return (
    sourceBranch.value &&
    mergeTargetBranchId.value &&
    mergeTargetBranchId.value !== sourceBranch.value.id &&
    !isMerging.value
  );
});

async function loadBranches() {
  loading.value = true;
  error.value = null;

  try {
    branches.value = await apiService.listBranches(props.graphId);

    if (branches.value.length > 0) {
      const mainBranch = branches.value.find((b) => b.isMain);
      if (mainBranch && !selectedParentBranchId.value) {
        selectedParentBranchId.value = mainBranch.id;
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载分支失败';
    emit('error', error.value);
  } finally {
    loading.value = false;
  }
}

function getParentBranchName(parentId: string): string {
  const parent = branches.value.find((b) => b.id === parentId);
  return parent?.name || '未知分支';
}

function cancelCreate() {
  showCreateForm.value = false;
  newBranchName.value = '';
  newBranchDescription.value = '';
  fromVersion.value = null;
}

async function createBranch() {
  if (!canCreateBranch.value) return;

  isCreating.value = true;
  error.value = null;

  try {
    await apiService.createBranch(props.graphId, {
      name: newBranchName.value.trim(),
      userId: 'user',
      fromBranchId: selectedParentBranchId.value || undefined,
      fromVersion: fromVersion.value || undefined,
      description: newBranchDescription.value || undefined,
    });

    cancelCreate();
    await loadBranches();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建分支失败';
  } finally {
    isCreating.value = false;
  }
}

function switchToBranch(branch: Branch) {
  emit('switch', branch);
}

function showMergeDialog(branch: Branch) {
  sourceBranch.value = branch;
  mergeTargetBranchId.value = props.currentBranchId;
  mergeDialogVisible.value = true;
  mergePreview.value = null;

  if (mergeTargetBranchId.value) {
    loadMergePreview();
  }
}

watch(mergeTargetBranchId, () => {
  if (mergeTargetBranchId.value && sourceBranch.value) {
    loadMergePreview();
  }
});

async function loadMergePreview() {
  if (!sourceBranch.value || !mergeTargetBranchId.value) return;

  try {
    mergePreview.value = await apiService.previewMerge(
      props.graphId,
      sourceBranch.value.id,
      mergeTargetBranchId.value,
    );
  } catch (err) {
    console.error('Failed to load merge preview:', err);
  }
}

function closeMergeDialog() {
  mergeDialogVisible.value = false;
  sourceBranch.value = null;
  mergeTargetBranchId.value = null;
  mergePreview.value = null;
}

async function executeMerge() {
  if (!canMerge.value || !sourceBranch.value) return;

  isMerging.value = true;
  error.value = null;

  try {
    const result = await apiService.mergeBranches(props.graphId, {
      sourceBranchId: sourceBranch.value.id,
      targetBranchId: mergeTargetBranchId.value!,
      userId: 'user',
      strategy: mergeStrategy.value,
    });

    emit('merged', result);
    closeMergeDialog();
    await loadBranches();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '合并失败';
  } finally {
    isMerging.value = false;
  }
}

function confirmDeleteBranch(branch: Branch) {
  branchToDelete.value = branch;
  deleteDialogVisible.value = true;
}

function cancelDelete() {
  deleteDialogVisible.value = false;
  branchToDelete.value = null;
}

async function deleteBranch() {
  if (!branchToDelete.value) return;

  isDeleting.value = true;
  error.value = null;

  try {
    await apiService.deleteBranch(
      props.graphId,
      branchToDelete.value.id,
      'user',
    );
    cancelDelete();
    await loadBranches();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除分支失败';
  } finally {
    isDeleting.value = false;
  }
}

onMounted(() => {
  loadBranches();
});

watch(
  () => props.graphId,
  () => {
    loadBranches();
  },
);
</script>

<style scoped>
.branch-manager {
  background: var(--bg-secondary, #1e1e1e);
  border-radius: 8px;
  padding: 16px;
  color: var(--text-primary, #e0e0e0);
}

.branch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.branch-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.create-form {
  background: var(--bg-tertiary, #252525);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-primary, #1a1a1a);
  border: 1px solid var(--border-color, #374151);
  border-radius: 6px;
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent-color, #3b82f6);
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.branch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.branch-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px;
  background: var(--bg-tertiary, #252525);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.branch-item:hover {
  border-color: var(--border-color, #374151);
}

.branch-item.is-current {
  border-color: var(--accent-color, #3b82f6);
}

.branch-item.is-main {
  background: var(--bg-accent, #1f2937);
}

.branch-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.branch-icon {
  font-size: 18px;
}

.branch-name {
  font-weight: 600;
  font-size: 14px;
}

.branch-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 4px;
}

.branch-desc {
  font-size: 12px;
  color: var(--text-tertiary, #6b7280);
  font-style: italic;
}

.branch-actions {
  display: flex;
  gap: 8px;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.badge-main {
  background: var(--accent-color, #3b82f6);
  color: white;
}

.badge-current {
  background: var(--success-color, #10b981);
  color: white;
}

.badge-auto {
  background: var(--warning-color, #f59e0b);
  color: white;
}

.btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-color, #3b82f6);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover, #2563eb);
}

.btn-secondary {
  background: var(--bg-tertiary, #374151);
  color: var(--text-primary, #e0e0e0);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover, #4b5563);
}

.btn-info {
  background: var(--info-color, #06b6d4);
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: var(--info-hover, #0891b2);
}

.btn-danger {
  background: var(--danger-color, #ef4444);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: var(--danger-hover, #dc2626);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.merge-dialog-overlay,
.delete-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.merge-dialog,
.delete-dialog {
  background: var(--bg-secondary, #1e1e1e);
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.merge-dialog h3,
.delete-dialog h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
}

.branch-preview {
  padding: 10px 12px;
  background: var(--bg-tertiary, #252525);
  border-radius: 6px;
  font-size: 14px;
}

.text-muted {
  color: var(--text-secondary, #9ca3af);
  margin-left: 8px;
}

.merge-preview-box {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-tertiary, #252525);
  border-radius: 8px;
}

.merge-preview-box h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.conflict-warning {
  color: var(--warning-color, #f59e0b);
  font-weight: 500;
  margin-bottom: 8px;
}

.no-conflicts {
  color: var(--success-color, #10b981);
  font-weight: 500;
}

.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conflict-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-primary, #1a1a1a);
  border-radius: 4px;
  font-size: 13px;
}

.conflict-type {
  padding: 2px 8px;
  background: var(--danger-color, #ef4444);
  border-radius: 4px;
  font-size: 11px;
  color: white;
}

.conflict-target {
  font-family: monospace;
}

.merge-actions,
.delete-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.error-message {
  margin-top: 12px;
  padding: 10px;
  background: var(--danger-bg, #450a0a);
  color: var(--danger-color, #f87171);
  border-radius: 6px;
  font-size: 13px;
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary, #9ca3af);
}
</style>
