<template>
  <div class="timeline-container">
    <div class="timeline-header">
      <div class="timeline-title">
        <span class="timeline-icon">⏱</span>
        <span>血缘回放</span>
      </div>
      <div class="timeline-controls">
        <button
          class="timeline-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="timeline-btn" @click="stepBackward" title="后退一步">⏮</button>
        <button class="timeline-btn" @click="stepForward" title="前进一步">⏭</button>
        <button class="timeline-btn" @click="resetToNow" title="回到当前">⏺</button>
        <select class="timeline-speed" v-model="playSpeed" @change="updateSpeed">
          <option :value="500">0.5x</option>
          <option :value="1000">1x</option>
          <option :value="2000">2x</option>
          <option :value="5000">5x</option>
        </select>
      </div>
    </div>

    <div class="timeline-track">
      <div class="timeline-marks">
        <div
          v-for="(mark, index) in timeMarks"
          :key="index"
          class="timeline-mark"
          :style="{ left: mark.position + '%' }"
          :title="mark.label"
        >
          <div class="timeline-mark-line"></div>
          <div class="timeline-mark-label">{{ mark.label }}</div>
        </div>
      </div>

      <input
        type="range"
        class="timeline-slider"
        :min="0"
        :max="1000"
        :value="currentPosition"
        @input="handleSliderInput"
        @change="handleSliderChange"
      />

      <div class="timeline-events">
        <div
          v-for="(event, index) in eventMarks"
          :key="index"
          class="timeline-event"
          :class="'event-type-' + event.type"
          :style="{ left: event.position + '%' }"
          :title="event.title"
          @click="jumpToEvent(event)"
        >
          <div class="timeline-event-dot"></div>
        </div>
      </div>
    </div>

    <div class="timeline-footer">
      <div class="timeline-time">
        <span class="timeline-time-label">开始: {{ formatTime(startTime) }}</span>
      </div>
      <div class="timeline-current" v-if="currentTime">
        <span class="timeline-time-current">{{ formatTime(currentTime) }}</span>
      </div>
      <div class="timeline-time">
        <span class="timeline-time-label">{{ isLive ? '实时' : '结束: ' + formatTime(endTime) }}</span>
      </div>
    </div>

    <div v-if="currentEvent" class="timeline-event-info">
      <span class="event-type-tag" :class="'tag-' + currentEvent.type">
      {{ currentEvent.type === 'task' ? '任务' : '依赖' }}
      </span>
      <span class="event-name">{{ currentEvent.taskName }}</span>
      <span class="event-operation">{{ getOperationText(currentEvent.operation) }}</span>
      <span class="event-time">{{ formatTime(currentEvent.timestamp) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  events: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['timeChange', 'seek'])

const isPlaying = ref(false)
const playSpeed = ref(1000)
const currentPosition = ref(1000)
const playInterval = ref(null)
const currentTime = ref(null)
const currentEvent = ref(null)
const isLive = ref(true)

const timeRange = computed(() => {
  return props.endTime.getTime() - props.startTime.getTime()
})

const timeMarks = computed(() => {
  const marks = []
  const range = timeRange.value
  if (range <= 0) return marks
  
  const markCount = 5
  for (let i = 0; i <= markCount; i++) {
    const position = (i / markCount) * 100
    const timestamp = props.startTime.getTime() + (range * i / markCount)
    const date = new Date(timestamp)
    marks.push({
      position,
      label: formatTimeShort(date)
    })
  }
  return marks
})

const eventMarks = computed(() => {
  const range = timeRange.value
  if (range <= 0) return []
  
  return props.events.map(event => {
    const eventTime = new Date(event.timestamp).getTime()
    const position = ((eventTime - props.startTime.getTime()) / range) * 100
    return {
      ...event,
      position,
      title: `${event.taskName} - ${getOperationText(event.operation)}`
    }
  }).filter(e => e.position >= 0 && e.position <= 100)
})

const formatTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const formatTimeShort = (date) => {
  const d = new Date(date)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const getOperationText = (op) => {
  const map = {
    create: '创建',
    update: '更新',
    delete: '删除',
    move: '移动',
    add: '添加',
    remove: '移除'
  }
  return map[op] || op
}

const updatePositionFromTime = (time) => {
  const range = timeRange.value
  if (range <= 0) {
    currentPosition.value = 1000
    return
  }
  const t = new Date(time).getTime()
  const pos = ((t - props.startTime.getTime()) / range) * 1000
  currentPosition.value = Math.max(0, Math.min(1000, pos))
}

const getTimeFromPosition = (pos) => {
  const range = timeRange.value
  const t = props.startTime.getTime() + (range * pos / 1000)
  return new Date(t)
}

const handleSliderInput = (e) => {
  const pos = parseInt(e.target.value)
  currentPosition.value = pos
  isPlaying.value = false
  stopPlay()
  const time = getTimeFromPosition(pos)
  currentTime.value = time
  isLive.value = pos >= 1000
  updateCurrentEvent(time)
  emit('timeChange', time)
}

const handleSliderChange = (e) => {
  const pos = parseInt(e.target.value)
  const time = getTimeFromPosition(pos)
  emit('seek', time)
}

const updateCurrentEvent = (time) => {
  const t = new Date(time).getTime()
  let closestEvent = null
  let minDiff = Infinity
  
  for (const event of props.events) {
    const eventTime = new Date(event.timestamp).getTime()
    const diff = Math.abs(eventTime - t)
    if (diff < minDiff && diff < 5000) {
      minDiff = diff
      closestEvent = event
    }
  }
  
  currentEvent.value = closestEvent
}

const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    startPlay()
  } else {
    stopPlay()
  }
}

const startPlay = () => {
  stopPlay()
  if (currentPosition.value >= 1000) {
    currentPosition.value = 0
  }
  isLive.value = false
  
  playInterval.value = setInterval(() => {
    currentPosition.value += 2
    if (currentPosition.value >= 1000) {
      currentPosition.value = 1000
      stopPlay()
      isPlaying.value = false
      isLive.value = true
    }
    const time = getTimeFromPosition(currentPosition.value)
    currentTime.value = time
    updateCurrentEvent(time)
    emit('timeChange', time)
  }, playSpeed.value / 10)
}

const stopPlay = () => {
  if (playInterval.value) {
    clearInterval(playInterval.value)
    playInterval.value = null
  }
}

const updateSpeed = () => {
  if (isPlaying.value) {
    startPlay()
  }
}

const stepForward = () => {
  const currentTimeVal = currentTime.value || props.endTime
  const nextEvent = findNextEvent(currentTimeVal)
  if (nextEvent) {
    jumpToEvent(nextEvent)
  }
}

const stepBackward = () => {
  const currentTimeVal = currentTime.value || props.endTime
  const prevEvent = findPrevEvent(currentTimeVal)
  if (prevEvent) {
    jumpToEvent(prevEvent)
  }
}

const findNextEvent = (time) => {
  const t = new Date(time).getTime()
  for (const event of props.events) {
    const eventTime = new Date(event.timestamp).getTime()
    if (eventTime > t) {
      return event
    }
  }
  return null
}

const findPrevEvent = (time) => {
  const t = new Date(time).getTime()
  let prev = null
  for (const event of props.events) {
    const eventTime = new Date(event.timestamp).getTime()
    if (eventTime < t) {
      prev = event
    } else {
      break
    }
  }
  return prev
}

const jumpToEvent = (event) => {
  const eventTime = new Date(event.timestamp)
  updatePositionFromTime(eventTime)
  currentTime.value = eventTime
  currentEvent.value = event
  isLive.value = false
  isPlaying.value = false
  stopPlay()
  emit('seek', eventTime)
}

const resetToNow = () => {
  stopPlay()
  isPlaying.value = false
  currentPosition.value = 1000
  currentTime.value = null
  currentEvent.value = null
  isLive.value = true
  emit('seek', null)
}

watch(() => [props.startTime, props.endTime], () => {
  if (isLive.value) {
    currentPosition.value = 1000
    currentTime.value = null
  }
})

onMounted(() => {
  currentPosition.value = 1000
})

onBeforeUnmount(() => {
  stopPlay()
})
</script>

<style scoped>
.timeline-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid #e8e8e8;
  padding: 12px 24px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  z-index: 20;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.timeline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #262626;
  font-size: 14px;
}

.timeline-icon {
  font-size: 16px;
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #d9d9d9;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.timeline-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.timeline-speed {
  height: 32px;
  padding: 0 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}

.timeline-track {
  position: relative;
  height: 40px;
  display: flex;
  align-items: center;
}

.timeline-marks {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}

.timeline-mark {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.timeline-mark-line {
  width: 1px;
  height: 8px;
  background: #d9d9d9;
}

.timeline-mark-label {
  font-size: 11px;
  color: #8c8c8c;
  margin-top: 2px;
  white-space: nowrap;
}

.timeline-slider {
  position: absolute;
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e8e8e8;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #1890ff;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}

.timeline-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.timeline-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #1890ff;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.timeline-events {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  pointer-events: none;
}

.timeline-event {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: pointer;
}

.timeline-event-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #faad14;
  border: 2px solid #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}

.timeline-event:hover .timeline-event-dot {
  transform: scale(1.3);
}

.timeline-event.event-type-dependency .timeline-event-dot {
  background: #52c41a;
}

.timeline-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.timeline-time {
  font-size: 12px;
  color: #8c8c8c;
}

.timeline-current {
  font-size: 12px;
  font-weight: 600;
  color: #1890ff;
}

.timeline-event-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 8px 12px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 4px;
  font-size: 12px;
}

.event-type-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.tag-task {
  background: #fff7e6;
  color: #fa8c16;
}

.tag-dependency {
  background: #f6ffed;
  color: #52c41a;
}

.event-name {
  font-weight: 500;
  color: #262626;
}

.event-operation {
  color: #8c8c8c;
}

.event-time {
  margin-left: auto;
  color: #8c8c8c;
}
</style>
