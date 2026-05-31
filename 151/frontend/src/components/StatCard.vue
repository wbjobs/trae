<template>
  <div class="stat-card" :style="{ borderLeft: `4px solid ${color}` }">
    <el-icon :size="32" :color="color" class="stat-card-icon">
      <component :is="icon" />
    </el-icon>
    <div class="stat-card-label">{{ label }}</div>
    <div class="stat-card-value" :style="{ color }">{{ value }}</div>
    <div v-if="subText" class="stat-card-sub">{{ subText }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    required: true
  },
  icon: {
    type: String,
    default: 'DataBoard'
  },
  color: {
    type: String,
    default: '#409EFF'
  },
  subText: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.15);
}

.stat-card-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-card-value {
  font-size: 32px;
  font-weight: 600;
}

.stat-card-icon {
  margin-bottom: 8px;
}

.stat-card-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
