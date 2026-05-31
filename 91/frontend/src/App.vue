<template>
  <div class="app-container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>任务调度中心</h2>
      </div>
      <div class="sidebar-content">
        <button class="btn btn-primary" style="width: 100%; margin-bottom: 16px;" @click="openCreateModal">
          + 新增任务
        </button>
        <div v-if="tasks.length === 0" class="empty-state">
          暂无任务，点击上方按钮创建
        </div>
        <div v-else class="task-list">
          <div
            v-for="task in tasks"
            :key="task.id"
            class="task-item"
            :class="{ active: selectedTaskId === task.id }"
            @click="selectTask(task.id)"
          >
            <div class="task-item-name">{{ task.name }}</div>
            <div class="task-item-status">
              <span class="status-dot" :class="'status-' + task.status"></span>
              {{ getStatusText(task.status) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="main-content" :class="{ 'with-timeline': showTimeline }">
      <div class="toolbar">
        <button class="btn btn-default" @click="fitView">适应视图</button>
        <button class="btn btn-default" @click="resetView">重置视图</button>
        <button class="btn btn-default" @click="refresh">刷新</button>
        <button class="btn btn-default" @click="toggleTimeline">
          {{ showTimeline ? '隐藏回放' : '显示回放' }}
        </button>
        <span v-if="!isLiveMode" class="live-indicator history-mode">
          🕒 历史模式
        </span>
        <span v-else class="live-indicator">
          ● 实时
        </span>
      </div>
      <DAGCanvas
        ref="dagCanvasRef"
        :nodes="tasks"
        :edges="edges"
        v-model:selectedNodeId="selectedTaskId"
        @node-move="handleNodeMove"
        @node-double-click="openEditModal"
      />
      
      <TimelinePlayer
        v-if="showTimeline"
        :start-time="timelineStartTime"
        :end-time="timelineEndTime"
        :events="timelineEvents"
        @time-change="handleTimeChange"
        @seek="handleSeek"
      />
    </div>

    <TaskForm
      v-if="showFormModal"
      :task="editingTask"
      :allTasks="tasks"
      @close="closeFormModal"
      @save="handleSaveTask"
      @dependency-change="loadGraphData"
    />

    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="modal-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <p>确定要删除任务 "{{ deletingTask?.name }}" 吗？</p>
        <div class="form-actions">
          <button class="btn btn-default" @click="showDeleteConfirm = false">取消</button>
          <button class="btn btn-danger" @click="confirmDelete">确定删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import DAGCanvas from './components/DAGCanvas.vue'
import TaskForm from './components/TaskForm.vue'
import TimelinePlayer from './components/TimelinePlayer.vue'
import { taskApi } from './api/task'

const dagCanvasRef = ref(null)
const tasks = ref([])
const edges = ref([])
const selectedTaskId = ref(null)
const showFormModal = ref(false)
const editingTask = ref(null)
const showDeleteConfirm = ref(false)
const deletingTask = ref(null)

const showTimeline = ref(false)
const isLiveMode = ref(true)
const timelineStartTime = ref(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
const timelineEndTime = ref(new Date())
const timelineEvents = ref([])

let timelineRefreshTimer = null

const getStatusText = (status) => {
  const map = {
    pending: '待执行',
    running: '执行中',
    success: '成功',
    failed: '失败'
  }
  return map[status] || status
}

const loadGraphData = async () => {
  try {
    const res = await taskApi.getGraphData()
    tasks.value = res.data.nodes
    edges.value = res.data.edges
  } catch (e) {
    console.error('加载图数据失败:', e)
  }
}

const loadHistoricalGraph = async (time) => {
  try {
    const timestamp = time.toISOString()
    const res = await taskApi.getHistoricalGraph(timestamp)
    tasks.value = res.data.nodes
    edges.value = res.data.edges
  } catch (e) {
    console.error('加载历史图数据失败:', e)
  }
}

const loadTimelineData = async () => {
  try {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    timelineStartTime.value = startTime
    timelineEndTime.value = endTime
    
    const res = await taskApi.getTimeline(startTime.toISOString(), endTime.toISOString())
    timelineEvents.value = res.data
  } catch (e) {
    console.error('加载时间轴数据失败:', e)
  }
}

const handleTimeChange = (time) => {
  if (!isLiveMode.value) {
    loadHistoricalGraph(time)
  }
}

const handleSeek = (time) => {
  if (time === null) {
    isLiveMode.value = true
    loadGraphData()
  } else {
    isLiveMode.value = false
    loadHistoricalGraph(time)
  }
}

const refresh = () => {
  if (isLiveMode.value) {
    loadGraphData()
  }
  if (showTimeline.value) {
    loadTimelineData()
  }
}

const selectTask = (id) => {
  selectedTaskId.value = id
}

const fitView = () => {
  dagCanvasRef.value?.fitView()
}

const resetView = () => {
  dagCanvasRef.value?.resetView()
}

const toggleTimeline = () => {
  showTimeline.value = !showTimeline.value
  if (showTimeline.value) {
    loadTimelineData()
    startTimelineRefresh()
  } else {
    stopTimelineRefresh()
    if (!isLiveMode.value) {
      isLiveMode.value = true
      loadGraphData()
    }
  }
}

const startTimelineRefresh = () => {
  stopTimelineRefresh()
  timelineRefreshTimer = setInterval(() => {
    if (isLiveMode.value && showTimeline.value) {
      loadTimelineData()
    }
  }, 30000)
}

const stopTimelineRefresh = () => {
  if (timelineRefreshTimer) {
    clearInterval(timelineRefreshTimer)
    timelineRefreshTimer = null
  }
}

const openCreateModal = () => {
  editingTask.value = null
  showFormModal.value = true
}

const openEditModal = (task) => {
  editingTask.value = { ...task }
  showFormModal.value = true
}

const closeFormModal = () => {
  showFormModal.value = false
  editingTask.value = null
}

const handleSaveTask = async (data) => {
  try {
    if (editingTask.value) {
      await taskApi.updateTask(editingTask.value.id, data)
    } else {
      const x = 100 + Math.random() * 200
      const y = 100 + Math.random() * 200
      await taskApi.createTask({ ...data, positionX: x, positionY: y })
    }
    if (isLiveMode.value) {
      await loadGraphData()
    }
    if (showTimeline.value) {
      await loadTimelineData()
    }
    closeFormModal()
  } catch (e) {
    alert(e.response?.data?.error || '保存失败')
  }
}

const handleNodeMove = async ({ id, positionX, positionY }) => {
  try {
    await taskApi.updatePosition(id, positionX, positionY)
    if (showTimeline.value) {
      loadTimelineData()
    }
  } catch (e) {
    console.error('更新位置失败:', e)
  }
}

const confirmDelete = async () => {
  if (!deletingTask.value) return
  try {
    await taskApi.deleteTask(deletingTask.value.id)
    showDeleteConfirm.value = false
    deletingTask.value = null
    selectedTaskId.value = null
    if (isLiveMode.value) {
      await loadGraphData()
    }
    if (showTimeline.value) {
      await loadTimelineData()
    }
  } catch (e) {
    alert(e.response?.data?.error || '删除失败')
  }
}

onMounted(() => {
  loadGraphData()
})

onBeforeUnmount(() => {
  stopTimelineRefresh()
})
</script>

<style>
.main-content {
  position: relative;
  overflow: hidden;
}

.main-content.with-timeline {
  padding-bottom: 140px;
}

.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: #f6ffed;
  color: #52c41a;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.live-indicator.history-mode {
  background: #fff7e6;
  color: #fa8c16;
}
</style>
