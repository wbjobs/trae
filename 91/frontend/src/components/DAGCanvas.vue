<template>
  <div
    ref="containerRef"
    class="canvas-container"
    :class="{ dragging: isDragging || isNodeDragging }"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @wheel="handleWheel"
    @dblclick="handleDoubleClick"
  >
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onBeforeUnmount, computed } from 'vue'

const props = defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  edges: {
    type: Array,
    default: () => []
  },
  selectedNodeId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['update:selectedNodeId', 'node-move', 'node-double-click'])

const containerRef = ref(null)
const canvasRef = ref(null)
const ctx = ref(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isDragging = ref(false)
const isNodeDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragNodeId = ref(null)
const dragNodeStartX = ref(0)
const dragNodeStartY = ref(0)
const hoveredNodeId = ref(null)
const pendingFrame = ref(null)
const nodeMap = ref(new Map())

const NODE_WIDTH = 160
const NODE_HEIGHT = 60
const NODE_RADIUS = 8

const statusColors = {
  pending: '#faad14',
  running: '#1890ff',
  success: '#52c41a',
  failed: '#ff4d4f'
}

const arrowPathCache = ref(new Map())

const buildNodeMap = () => {
  const map = new Map()
  props.nodes.forEach(node => {
    map.set(node.id, node)
  })
  nodeMap.value = map
}

const getNodeById = (id) => {
  return nodeMap.value.get(id)
}

const screenToWorld = (x, y) => {
  return {
    x: (x - offsetX.value) / scale.value,
    y: (y - offsetY.value) / scale.value
  }
}

const getVisibleBounds = () => {
  const canvas = canvasRef.value
  if (!canvas) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  
  const topLeft = screenToWorld(0, 0)
  const bottomRight = screenToWorld(canvas.width, canvas.height)
  
  const padding = 100
  
  return {
    minX: topLeft.x - padding,
    minY: topLeft.y - padding,
    maxX: bottomRight.x + padding,
    maxY: bottomRight.y + padding
  }
}

const isNodeVisible = (node, bounds) => {
  return (
    node.positionX + NODE_WIDTH >= bounds.minX &&
    node.positionX <= bounds.maxX &&
    node.positionY + NODE_HEIGHT >= bounds.minY &&
    node.positionY <= bounds.maxY
  )
}

const isEdgeVisible = (source, target, bounds) => {
  if (!source || !target) return false
  const minX = Math.min(source.positionX, target.positionX)
  const maxX = Math.max(source.positionX + NODE_WIDTH, target.positionX + NODE_WIDTH)
  const minY = Math.min(source.positionY, target.positionY)
  const maxY = Math.max(source.positionY + NODE_HEIGHT, target.positionY + NODE_HEIGHT)
  
  return (
    maxX >= bounds.minX &&
    minX <= bounds.maxX &&
    maxY >= bounds.minY &&
    minY <= bounds.maxY
  )
}

const getNodeAtPosition = (x, y) => {
  for (const node of props.nodes) {
    if (
      x >= node.positionX &&
      x <= node.positionX + NODE_WIDTH &&
      y >= node.positionY &&
      y <= node.positionY + NODE_HEIGHT
    ) {
      return node
    }
  }
  return null
}

const requestDraw = () => {
  if (pendingFrame.value) return
  pendingFrame.value = requestAnimationFrame(() => {
    pendingFrame.value = null
    draw()
  })
}

const cancelDraw = () => {
  if (pendingFrame.value) {
    cancelAnimationFrame(pendingFrame.value)
    pendingFrame.value = null
  }
}

const draw = () => {
  if (!ctx.value || !canvasRef.value) return
  
  const canvas = canvasRef.value
  const context = ctx.value
  const bounds = getVisibleBounds()
  
  context.clearRect(0, 0, canvas.width, canvas.height)
  
  context.save()
  context.translate(offsetX.value, offsetY.value)
  context.scale(scale.value, scale.value)
  
  drawEdges(context, bounds)
  drawNodes(context, bounds)
  
  context.restore()
}

const drawEdges = (context, bounds) => {
  const arrowSize = 8
  const visibleEdges = []
  
  for (const edge of props.edges) {
    const source = getNodeById(edge.source)
    const target = getNodeById(edge.target)
    if (!source || !target) continue
    if (!isEdgeVisible(source, target, bounds)) continue
    visibleEdges.push({ edge, source, target })
  }
  
  if (visibleEdges.length === 0) return
  
  context.strokeStyle = '#1890ff'
  context.lineWidth = 2
  context.beginPath()
  
  for (const { source, target } of visibleEdges) {
    const startX = source.positionX + NODE_WIDTH
    const startY = source.positionY + NODE_HEIGHT / 2
    const endX = target.positionX
    const endY = target.positionY + NODE_HEIGHT / 2
    
    const dx = endX - startX
    const dy = endY - startY
    const controlOffset = Math.min(Math.abs(dx) / 2, 100)
    
    const cp1x = startX + controlOffset
    const cp1y = startY
    const cp2x = endX - controlOffset
    const cp2y = endY
    
    context.moveTo(startX, startY)
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY)
  }
  
  context.stroke()
  
  context.beginPath()
  for (const { source, target } of visibleEdges) {
    const startX = source.positionX + NODE_WIDTH
    const startY = source.positionY + NODE_HEIGHT / 2
    const endX = target.positionX
    const endY = target.positionY + NODE_HEIGHT / 2
    
    const dx = endX - startX
    const dy = endY - startY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.001) continue
    
    const nx = dx / len
    const ny = dy / len
    
    const arrowAngle = Math.PI / 6
    const cosA = Math.cos(arrowAngle)
    const sinA = Math.sin(arrowAngle)
    
    const ax1 = endX - arrowSize * (nx * cosA + ny * sinA)
    const ay1 = endY - arrowSize * (ny * cosA - nx * sinA)
    const ax2 = endX - arrowSize * (nx * cosA - ny * sinA)
    const ay2 = endY - arrowSize * (ny * cosA + nx * sinA)
    
    context.moveTo(endX, endY)
    context.lineTo(ax1, ay1)
    context.moveTo(endX, endY)
    context.lineTo(ax2, ay2)
  }
  
  context.stroke()
}

const drawNodes = (context, bounds) => {
  const visibleNodes = []
  
  for (const node of props.nodes) {
    if (isNodeVisible(node, bounds)) {
      visibleNodes.push(node)
    }
  }
  
  if (visibleNodes.length === 0) return
  
  for (const node of visibleNodes) {
    const x = node.positionX
    const y = node.positionY
    const isSelected = node.id === props.selectedNodeId
    const isHovered = node.id === hoveredNodeId.value
    
    context.beginPath()
    context.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS)
    
    if (isSelected) {
      context.fillStyle = '#e6f7ff'
    } else if (isHovered) {
      context.fillStyle = '#f0f5ff'
    } else {
      context.fillStyle = '#ffffff'
    }
    context.fill()
    
    context.strokeStyle = isSelected ? '#1890ff' : '#d9d9d9'
    context.lineWidth = isSelected ? 2 : 1
    context.stroke()
  }
  
  for (const node of visibleNodes) {
    const x = node.positionX
    const y = node.positionY
    
    const statusColor = statusColors[node.status] || statusColors.pending
    context.beginPath()
    context.arc(x + 16, y + 20, 6, 0, Math.PI * 2)
    context.fillStyle = statusColor
    context.fill()
  }
  
  context.fillStyle = '#262626'
  context.font = 'bold 14px sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  
  for (const node of visibleNodes) {
    const x = node.positionX
    const y = node.positionY
    const name = node.name.length > 12 ? node.name.substring(0, 12) + '...' : node.name
    context.fillText(name, x + 32, y + 20)
  }
  
  context.fillStyle = '#8c8c8c'
  context.font = '12px sans-serif'
  
  for (const node of visibleNodes) {
    const x = node.positionX
    const y = node.positionY
    const desc = node.description
      ? (node.description.length > 18 ? node.description.substring(0, 18) + '...' : node.description)
      : '无描述'
    context.fillText(desc, x + 16, y + 42)
  }
}

let hoverThrottleTimer = null
const throttledHandleHover = (e) => {
  if (hoverThrottleTimer) return
  hoverThrottleTimer = setTimeout(() => {
    hoverThrottleTimer = null
    
    const rect = canvasRef.value.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const worldPos = screenToWorld(x, y)
    const node = getNodeAtPosition(worldPos.x, worldPos.y)
    const newHoveredId = node ? node.id : null
    
    if (newHoveredId !== hoveredNodeId.value) {
      hoveredNodeId.value = newHoveredId
      requestDraw()
    }
  }, 16)
}

const handleMouseDown = (e) => {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const worldPos = screenToWorld(x, y)
  const node = getNodeAtPosition(worldPos.x, worldPos.y)
  
  if (node) {
    isNodeDragging.value = true
    dragNodeId.value = node.id
    dragNodeStartX.value = node.positionX
    dragNodeStartY.value = node.positionY
    dragStartX.value = worldPos.x
    dragStartY.value = worldPos.y
    emit('update:selectedNodeId', node.id)
  } else {
    isDragging.value = true
    dragStartX.value = e.clientX - offsetX.value
    dragStartY.value = e.clientY - offsetY.value
    emit('update:selectedNodeId', null)
  }
}

const handleMouseMove = (e) => {
  if (isNodeDragging.value && dragNodeId.value !== null) {
    const rect = canvasRef.value.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const worldPos = screenToWorld(x, y)
    
    const dx = worldPos.x - dragStartX.value
    const dy = worldPos.y - dragStartY.value
    const newX = dragNodeStartX.value + dx
    const newY = dragNodeStartY.value + dy
    
    const node = getNodeById(dragNodeId.value)
    if (node) {
      node.positionX = Math.max(0, newX)
      node.positionY = Math.max(0, newY)
    }
    requestDraw()
  } else if (isDragging.value) {
    offsetX.value = e.clientX - dragStartX.value
    offsetY.value = e.clientY - dragStartY.value
    requestDraw()
  } else {
    throttledHandleHover(e)
  }
}

const handleMouseUp = () => {
  if (isNodeDragging.value && dragNodeId.value !== null) {
    const node = getNodeById(dragNodeId.value)
    if (node) {
      emit('node-move', {
        id: node.id,
        positionX: node.positionX,
        positionY: node.positionY
      })
    }
  }
  
  isDragging.value = false
  isNodeDragging.value = false
  dragNodeId.value = null
}

const handleWheel = (e) => {
  e.preventDefault()
  
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(0.2, Math.min(3, scale.value * delta))
  
  const mouseX = (x - offsetX.value) / scale.value
  const mouseY = (y - offsetY.value) / scale.value
  
  scale.value = newScale
  offsetX.value = x - mouseX * scale.value
  offsetY.value = y - mouseY * scale.value
  
  requestDraw()
}

const handleDoubleClick = (e) => {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const worldPos = screenToWorld(x, y)
  const node = getNodeAtPosition(worldPos.x, worldPos.y)
  
  if (node) {
    emit('node-double-click', node)
  }
}

const resize = () => {
  if (!containerRef.value || !canvasRef.value) return
  
  const container = containerRef.value
  const canvas = canvasRef.value
  
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  
  requestDraw()
}

const fitView = () => {
  if (props.nodes.length === 0) {
    scale.value = 1
    offsetX.value = 0
    offsetY.value = 0
    requestDraw()
    return
  }
  
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  
  for (const node of props.nodes) {
    minX = Math.min(minX, node.positionX)
    minY = Math.min(minY, node.positionY)
    maxX = Math.max(maxX, node.positionX + NODE_WIDTH)
    maxY = Math.max(maxY, node.positionY + NODE_HEIGHT)
  }
  
  const padding = 60
  const contentWidth = maxX - minX + padding * 2
  const contentHeight = maxY - minY + padding * 2
  const canvasWidth = canvasRef.value.width
  const canvasHeight = canvasRef.value.height
  
  const scaleX = canvasWidth / contentWidth
  const scaleY = canvasHeight / contentHeight
  
  scale.value = Math.min(scaleX, scaleY, 1)
  offsetX.value = (canvasWidth - (maxX + minX) * scale.value) / 2 - minX * scale.value
  offsetY.value = (canvasHeight - (maxY + minY) * scale.value) / 2 - minY * scale.value
  
  requestDraw()
}

const resetView = () => {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  requestDraw()
}

defineExpose({ fitView, resetView })

onMounted(() => {
  const canvas = canvasRef.value
  ctx.value = canvas.getContext('2d')
  buildNodeMap()
  resize()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  cancelDraw()
  window.removeEventListener('resize', resize)
  if (hoverThrottleTimer) {
    clearTimeout(hoverThrottleTimer)
  }
})

watch(
  () => [props.nodes, props.edges],
  () => {
    buildNodeMap()
    nextTick(() => requestDraw())
  },
  { deep: true }
)

watch(
  () => props.selectedNodeId,
  () => {
    requestDraw()
  }
)
</script>
