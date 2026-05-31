<template>
  <div class="flow-designer">
    <div class="designer-header">
      <div class="header-left">
        <el-button @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-input v-model="flowName" placeholder="流程名称" class="name-input" />
      </div>
      <div class="header-right">
        <el-button @click="handleSave" :loading="saving">保存</el-button>
        <el-button type="primary" @click="handleEnable" :loading="enabling">启用流程</el-button>
      </div>
    </div>
    
    <div class="designer-body">
      <div class="sidebar">
        <h3>节点类型</h3>
        <div class="node-list">
          <div
            v-for="node in availableNodes"
            :key="node.type"
            class="node-item"
            @click="addNode(node.type)"
          >
            <el-icon><component :is="node.icon" /></el-icon>
            <span>{{ node.label }}</span>
          </div>
        </div>
        
        <h3 style="margin-top: 24px;">可选审批人</h3>
        <div class="user-list">
          <div
            v-for="user in users"
            :key="user.id"
            class="user-item"
            draggable="true"
            @dragstart="handleUserDragStart($event, user)"
          >
            <el-avatar :size="24" style="background: #409eff;">
              {{ user.name?.charAt(0) || 'U' }}
            </el-avatar>
            <span>{{ user.name }}</span>
          </div>
        </div>
      </div>
      
      <div class="canvas">
        <div class="flow-canvas">
          <div class="node-wrapper start-node">
            <div class="node-card start">
              <el-icon><Location /></el-icon>
              <span>开始</span>
            </div>
          </div>
          
          <div class="node-line">
            <el-icon><ArrowDown /></el-icon>
          </div>
          
          <div
            v-for="(node, index) in nodes"
            :key="node.id"
            class="node-wrapper"
          >
            <div class="node-card" :class="getNodeClass(node.type)">
              <div class="node-header">
                <el-icon><component :is="getNodeIcon(node.type)" /></el-icon>
                <span>{{ node.name || getNodeLabel(node.type) }}</span>
                <div class="node-actions">
                  <el-button size="small" text @click="moveNode(index, -1)" :disabled="index === 0">
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button size="small" text @click="moveNode(index, 1)" :disabled="index === nodes.length - 1">
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button size="small" text type="danger" @click="removeNode(index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
              
              <div class="node-config" v-if="node.type === 'approval'">
                <div class="approvers">
                  <el-tag
                    v-for="(approver, approverIdx) in node.approvers"
                    :key="approverIdx"
                    closable
                    @close="removeApprover(index, approverIdx)"
                  >
                    {{ getApproverName(approver) }}
                  </el-tag>
                  <div
                    class="approver-drop"
                    @drop="handleApproverDrop($event, index)"
                    @dragover.prevent
                  >
                    <el-icon><Plus /></el-icon>
                    <span>拖放审批人</span>
                  </div>
                </div>
              </div>
              
              <div class="node-config" v-else-if="node.type === 'condition'">
                <el-select v-model="node.condition.field" placeholder="选择条件字段" style="width: 100%;">
                  <el-option
                    v-for="field in formFields"
                    :key="field.name"
                    :label="field.label"
                    :value="field.name"
                  />
                </el-select>
                <el-select v-model="node.condition.operator" placeholder="操作符" style="width: 100%; margin-top: 8px;">
                  <el-option label="等于" value="eq" />
                  <el-option label="不等于" value="neq" />
                  <el-option label="大于" value="gt" />
                  <el-option label="小于" value="lt" />
                  <el-option label="大于等于" value="gte" />
                  <el-option label="小于等于" value="lte" />
                  <el-option label="包含" value="contains" />
                </el-select>
                <el-input
                  v-model="node.condition.value"
                  placeholder="条件值"
                  style="margin-top: 8px;"
                />
              </div>
            </div>
            
            <div class="node-line" v-if="index < nodes.length - 1">
              <el-icon><ArrowDown /></el-icon>
            </div>
          </div>
          
          <div class="node-line" v-if="nodes.length > 0">
            <el-icon><ArrowDown /></el-icon>
          </div>
          
          <div class="node-wrapper end-node">
            <div class="node-card end">
              <el-icon><CircleClose /></el-icon>
              <span>结束</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { approvalApi } from '@/api/approval';
import { formApi } from '@/api/form';
import { tenantApi } from '@/api/tenant';
import type { ApprovalNode, User, FormField } from '@/types';

const route = useRoute();
const router = useRouter();
const flowId = computed(() => route.params.id as string);
const isEdit = computed(() => !!flowId.value);

const flowName = ref('未命名流程');
const nodes = ref<ApprovalNode[]>([]);
const formFields = ref<FormField[]>([]);
const users = ref<User[]>([]);
const saving = ref(false);
const enabling = ref(false);
const draggedUser = ref<User | null>(null);

const availableNodes = [
  { type: 'approval', label: '审批节点', icon: 'User' },
  { type: 'condition', label: '条件节点', icon: 'Operation' },
];

const getNodeClass = (type: string) => {
  const classes: Record<string, string> = {
    approval: 'approval',
    condition: 'condition',
  };
  return classes[type] || '';
};

const getNodeIcon = (type: string) => {
  const icons: Record<string, string> = {
    approval: 'User',
    condition: 'Operation',
  };
  return icons[type] || 'QuestionFilled';
};

const getNodeLabel = (type: string) => {
  const labels: Record<string, string> = {
    approval: '审批节点',
    condition: '条件节点',
  };
  return labels[type] || '节点';
};

const generateId = () => {
  return 'node_' + Math.random().toString(36).substr(2, 9);
};

const addNode = (type: string) => {
  const newNode: any = {
    id: generateId(),
    type: type as any,
    name: type === 'approval' ? '审批节点' : '条件节点',
    order: nodes.value.length,
    approvers: [],
    condition: {
      field: '',
      operator: 'eq',
      value: '',
    },
  };
  nodes.value.push(newNode);
};

const moveNode = (index: number, direction: number) => {
  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < nodes.value.length) {
    const temp = nodes.value[index];
    nodes.value[index] = nodes.value[newIndex];
    nodes.value[newIndex] = temp;
    nodes.value.forEach((node, i) => {
      node.order = i;
    });
  }
};

const removeNode = (index: number) => {
  nodes.value.splice(index, 1);
  nodes.value.forEach((node, i) => {
    node.order = i;
  });
};

const handleUserDragStart = (event: DragEvent, user: User) => {
  draggedUser.value = user;
  event.dataTransfer?.setData('userId', user.id);
};

const handleApproverDrop = (event: DragEvent, nodeIndex: number) => {
  event.preventDefault();
  if (draggedUser.value) {
    const node = nodes.value[nodeIndex];
    if (node && node.approvers) {
      const exists = node.approvers.some(
        (a: any) => a.type === 'user' && a.value === draggedUser.value!.id
      );
      if (!exists) {
        node.approvers.push({
          type: 'user',
          value: draggedUser.value.id,
        });
      }
    }
  }
  draggedUser.value = null;
};

const getApproverName = (approver: any) => {
  if (approver.type === 'user') {
    const user = users.value.find(u => u.id === approver.value);
    return user?.name || user?.email || approver.value;
  }
  if (approver.type === 'role') {
    return approver.value === 'tenant_admin' ? '管理员' : '普通用户';
  }
  return approver.value;
};

const removeApprover = (nodeIndex: number, approverIndex: number) => {
  const node = nodes.value[nodeIndex];
  if (node && node.approvers) {
    node.approvers.splice(approverIndex, 1);
  }
};

const loadFlow = async () => {
  if (!isEdit.value) return;
  
  try {
    const flow = await approvalApi.getFlow(flowId.value);
    flowName.value = flow.name;
    const loadedNodes = flow.nodes || [];
    
    loadedNodes.forEach(node => {
      if (node.type === 'condition' && !node.condition) {
        (node as any).condition = {
          field: '',
          operator: 'eq',
          value: '',
        };
      }
      if (node.type === 'approval' && !node.approvers) {
        (node as any).approvers = [];
      }
    });
    
    nodes.value = loadedNodes;
    
    if (flow.formId) {
      const form = await formApi.getForm(flow.formId);
      formFields.value = form.fields || [];
    }
  } catch (error) {
    console.error(error);
  }
};

const loadUsers = async () => {
  try {
    users.value = await tenantApi.getUsers();
  } catch (error) {
    console.error(error);
  }
};

const handleSave = async () => {
  if (!flowName.value.trim()) {
    ElMessage.warning('请输入流程名称');
    return;
  }
  
  saving.value = true;
  try {
    await approvalApi.updateFlow(flowId.value, {
      name: flowName.value,
      nodes: nodes.value,
    });
    ElMessage.success('保存成功');
  } catch (error) {
    console.error(error);
  } finally {
    saving.value = false;
  }
};

const handleEnable = async () => {
  if (nodes.value.length === 0) {
    ElMessage.warning('至少需要一个节点才能启用');
    return;
  }
  
  const hasApprovalWithoutApprovers = nodes.value.some(
    node => node.type === 'approval' && (!node.approvers || node.approvers.length === 0)
  );
  
  if (hasApprovalWithoutApprovers) {
    ElMessage.warning('审批节点需要配置审批人');
    return;
  }
  
  enabling.value = true;
  try {
    await handleSave();
    await approvalApi.enableFlow(flowId.value);
    ElMessage.success('流程已启用');
    router.back();
  } catch (error) {
    console.error(error);
  } finally {
    enabling.value = false;
  }
};

onMounted(() => {
  loadFlow();
  loadUsers();
});
</script>

<style scoped>
.flow-designer {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
}

.designer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.name-input {
  width: 300px;
}

.designer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  background: white;
  border-right: 1px solid #e4e7ed;
  padding: 16px;
  overflow-y: auto;
}

.sidebar h3 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #333;
  font-weight: 600;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.node-item:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: grab;
  transition: all 0.2s;
}

.user-item:hover {
  border-color: #409eff;
}

.canvas {
  flex: 1;
  padding: 24px;
  background: #f0f2f5;
  overflow-y: auto;
}

.flow-canvas {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.node-wrapper {
  width: 100%;
  max-width: 400px;
}

.node-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 2px solid #e4e7ed;
}

.node-card.start,
.node-card.end {
  width: 120px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
}

.node-card.start {
  border-color: #10b981;
  background: #ecfdf5;
  color: #10b981;
}

.node-card.end {
  border-color: #ef4444;
  background: #fef2f2;
  color: #ef4444;
}

.node-card.approval {
  border-color: #409eff;
}

.node-card.condition {
  border-color: #f59e0b;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.node-header span {
  flex: 1;
  font-weight: 600;
  color: #333;
}

.node-actions {
  display: flex;
  gap: 4px;
}

.node-line {
  display: flex;
  justify-content: center;
  color: #c0c4cc;
  padding: 8px 0;
}

.approvers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.approver-drop {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px dashed #c0c4cc;
  border-radius: 4px;
  color: #909399;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.approver-drop:hover {
  border-color: #409eff;
  color: #409eff;
}
</style>
