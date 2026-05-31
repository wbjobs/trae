<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ isEdit ? '编辑任务' : '新增任务' }}</h3>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <div class="form-group">
        <label>任务名称 *</label>
        <input v-model="form.name" type="text" placeholder="请输入任务名称" maxlength="100" />
      </div>

      <div class="form-group">
        <label>任务描述</label>
        <textarea v-model="form.description" placeholder="请输入任务描述" maxlength="500"></textarea>
      </div>

      <div class="form-group">
        <label>Cron 表达式</label>
        <input v-model="form.cronExpr" type="text" placeholder="例如: 0 0 2 * * ?" maxlength="50" />
      </div>

      <div v-if="isEdit" class="form-group">
        <label>任务状态</label>
        <select v-model="form.status">
          <option value="pending">待执行</option>
          <option value="running">执行中</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
      </div>

      <div v-if="isEdit" class="form-group">
        <label>上游依赖</label>
        <div v-if="dependencies.length === 0" class="no-tasks">暂无依赖</div>
        <div v-else>
          <div v-for="dep in dependencies" :key="dep.id" class="dependency-item">
            <span>{{ dep.name }}</span>
            <button class="btn btn-danger" @click="removeDependency(dep.id)">移除</button>
          </div>
        </div>

        <div class="add-dependency">
          <select v-model="newDependencyId">
            <option :value="null">选择要添加的上游任务</option>
            <option
              v-for="task in availableTasks"
              :key="task.id"
              :value="task.id"
            >{{ task.name }}</option>
          </select>
          <button class="btn btn-primary" @click="addDependency">添加</button>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-default" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="handleSubmit">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { taskApi } from '../api/task'

const props = defineProps({
  task: {
    type: Object,
    default: null
  },
  allTasks: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'save', 'dependency-change'])

const isEdit = computed(() => !!props.task)

const form = ref({
  name: '',
  description: '',
  cronExpr: '',
  status: 'pending'
})

const dependencies = ref([])
const newDependencyId = ref(null)

const availableTasks = computed(() => {
  if (!props.task) return []
  const depIds = dependencies.value.map(d => d.id)
  return props.allTasks.filter(t => t.id !== props.task.id && !depIds.includes(t.id))
})

onMounted(async () => {
  if (props.task) {
    form.value = { ...props.task }
    await loadDependencies()
  }
})

const loadDependencies = async () => {
  try {
    const res = await taskApi.getDependencies(props.task.id)
    dependencies.value = res.data
  } catch (e) {
    console.error('加载依赖失败:', e)
  }
}

const addDependency = async () => {
  if (!newDependencyId.value) return
  try {
    await taskApi.addDependency(props.task.id, newDependencyId.value)
    newDependencyId.value = null
    await loadDependencies()
    emit('dependency-change')
  } catch (e) {
    alert(e.response?.data?.error || '添加依赖失败')
  }
}

const removeDependency = async (depId) => {
  try {
    await taskApi.removeDependency(props.task.id, depId)
    await loadDependencies()
    emit('dependency-change')
  } catch (e) {
    console.error('移除依赖失败:', e)
  }
}

const handleSubmit = () => {
  if (!form.value.name.trim()) {
    alert('请输入任务名称')
    return
  }
  emit('save', { ...form.value })
}
</script>
