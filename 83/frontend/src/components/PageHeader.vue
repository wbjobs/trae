<template>
  <div class="page-header">
    <div class="page-title">
      <el-icon v-if="icon" class="title-icon"><component :is="icon" /></el-icon>
      <span>{{ title }}</span>
      <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
    </div>
    <div class="page-actions">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: '',
  },
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;

  .title-icon {
    color: #409eff;
    font-size: 20px;
  }

  .subtitle {
    font-size: 14px;
    font-weight: 400;
    color: #909399;
    margin-left: 8px;
  }
}
</style>
