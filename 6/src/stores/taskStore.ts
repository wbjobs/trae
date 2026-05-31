import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  SyncTask, SyncLog, SyncProgress, FileVersion, SyncConflict, ConflictResolution 
} from '@shared/types'

interface PendingConflict {
  conflictId: string
  conflict: SyncConflict
}

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref<SyncTask[]>([])
  const selectedTaskId = ref<string | null>(null)
  const taskLogs = ref<Map<string, SyncLog[]>>(new Map())
  const taskProgress = ref<Map<string, SyncProgress>>(new Map())
  const taskVersions = ref<Map<string, Map<string, FileVersion[]>>>(new Map())
  const pendingConflicts = ref<PendingConflict[]>([])

  const selectedTask = computed(() => {
    if (!selectedTaskId.value) return null
    return tasks.value.find(t => t.id === selectedTaskId.value) || null
  })

  function setSelectedTask(id: string | null) {
    selectedTaskId.value = id
  }

  async function loadTasks() {
    const result = await window.electronAPI.task.list()
    tasks.value = result
  }

  async function loadLogs(taskId: string, limit: number = 200) {
    const logs = await window.electronAPI.logs.list(taskId, limit)
    taskLogs.value.set(taskId, logs)
  }

  async function loadVersions(taskId: string, filePath: string) {
    const versions = await window.electronAPI.versions.list(taskId, filePath)
    let versionMap = taskVersions.value.get(taskId)
    if (!versionMap) {
      versionMap = new Map()
      taskVersions.value.set(taskId, versionMap)
    }
    versionMap.set(filePath, versions)
  }

  async function createTask(taskData: Partial<SyncTask>) {
    const task = await window.electronAPI.task.create(taskData)
    tasks.value.unshift(task)
    return task
  }

  async function updateTask(taskId: string, updates: Partial<SyncTask>) {
    const updated = await window.electronAPI.task.update(taskId, updates)
    if (updated) {
      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index !== -1) {
        tasks.value[index] = updated
      }
    }
    return updated
  }

  async function deleteTask(taskId: string) {
    const success = await window.electronAPI.task.delete(taskId)
    if (success) {
      tasks.value = tasks.value.filter(t => t.id !== taskId)
      taskLogs.value.delete(taskId)
      taskProgress.value.delete(taskId)
      taskVersions.value.delete(taskId)
      if (selectedTaskId.value === taskId) {
        selectedTaskId.value = null
      }
    }
    return success
  }

  async function runTask(taskId: string) {
    return window.electronAPI.task.run(taskId)
  }

  async function pauseTask(taskId: string) {
    await window.electronAPI.task.pause(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.paused = true
      task.status = 'paused'
    }
  }

  async function resumeTask(taskId: string) {
    await window.electronAPI.task.resume(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.paused = false
    }
  }

  async function enableTask(taskId: string) {
    await window.electronAPI.task.enable(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.enabled = true
    }
  }

  async function disableTask(taskId: string) {
    await window.electronAPI.task.disable(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.enabled = false
    }
  }

  async function restoreVersion(taskId: string, versionId: string, toSource: boolean) {
    return window.electronAPI.versions.restore(taskId, versionId, toSource)
  }

  async function resolveConflict(conflictId: string, resolution: ConflictResolution) {
    await window.electronAPI.conflict.resolve(conflictId, resolution)
    pendingConflicts.value = pendingConflicts.value.filter(c => c.conflictId !== conflictId)
  }

  function addLog(log: SyncLog) {
    let logs = taskLogs.value.get(log.taskId)
    if (!logs) {
      logs = []
      taskLogs.value.set(log.taskId, logs)
    }
    logs.unshift(log)
    if (logs.length > 500) {
      logs.pop()
    }
  }

  function updateProgress(progress: SyncProgress) {
    taskProgress.value.set(progress.taskId, progress)
    
    const task = tasks.value.find(t => t.id === progress.taskId)
    if (task) {
      task.status = 'running'
    }
  }

  function addConflict(data: SyncConflict & { conflictId: string }) {
    pendingConflicts.value.push({
      conflictId: data.conflictId,
      conflict: {
        taskId: data.taskId,
        sourceFile: data.sourceFile,
        targetFile: data.targetFile,
        resolved: false
      }
    })
  }

  return {
    tasks,
    selectedTaskId,
    selectedTask,
    taskLogs,
    taskProgress,
    taskVersions,
    pendingConflicts,
    setSelectedTask,
    loadTasks,
    loadLogs,
    loadVersions,
    createTask,
    updateTask,
    deleteTask,
    runTask,
    pauseTask,
    resumeTask,
    enableTask,
    disableTask,
    restoreVersion,
    resolveConflict,
    addLog,
    updateProgress,
    addConflict
  }
})
