<template>
  <div class="watermark-preview" :style="previewStyle">
    <div class="preview-content">
      <slot>文档预览区域</slot>
    </div>
    <div 
      v-for="(item, index) in watermarkItems" 
      :key="index"
      class="watermark-text"
      :style="item.style"
    >
      {{ config.content }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  config: {
    type: Object,
    default: () => ({
      content: '水印内容',
      fontSize: 14,
      opacity: 0.3,
      angle: -30,
      color: '#000000',
      position: 'full',
    }),
  },
  width: {
    type: Number,
    default: 600,
  },
  height: {
    type: Number,
    default: 400,
  },
})

const previewStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${props.height}px`,
}))

const watermarkItems = computed(() => {
  const items = []
  const spacingX = 200
  const spacingY = 100
  const startX = -100
  const startY = -50

  for (let y = startY; y < props.height + 100; y += spacingY) {
    for (let x = startX; x < props.width + 200; x += spacingX) {
      items.push({
        style: {
          left: `${x}px`,
          top: `${y}px`,
          fontSize: `${props.config.fontSize}px`,
          opacity: props.config.opacity,
          color: props.config.color,
          transform: `rotate(${props.config.angle}deg)`,
        },
      })
    }
  }

  return items
})
</script>

<style scoped>
.watermark-preview {
  position: relative;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}

.preview-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.watermark-text {
  position: absolute;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
  font-weight: 500;
  z-index: 2;
}
</style>
