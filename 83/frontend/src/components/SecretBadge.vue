<template>
  <span :class="['secret-badge', level]">
    {{ levelText }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: {
    type: String,
    default: 'internal',
  },
})

const levelMap = {
  top_secret: '绝密',
  secret: '机密',
  internal: '内部',
  public: '公开',
}

const levelText = computed(() => levelMap[props.level] || props.level)
</script>
