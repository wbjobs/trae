<template>
  <span :class="['status-tag', type]">
    {{ text }}
  </span>
</template>

<script setup>
defineProps({
  type: {
    type: String,
    default: 'info',
  },
  text: {
    type: String,
    required: true,
  },
})
</script>
