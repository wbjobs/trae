<template>
  <div class="graph-visualizer">
    <div ref="chartRef" :style="{ height: height + 'px' }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'
import type { Entity, Relation } from '@/types'

const props = withDefaults(defineProps<{
  entities: Entity[]
  relations: Relation[]
  height?: number
}>(), {
  height: 500
})

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

const entityTypeColors: Record<string, string> = {
  PERSON: '#67C23A',
  ORGANIZATION: '#409EFF',
  LOCATION: '#E6A23C',
  TIME: '#F56C6C',
  EVENT: '#909399',
  PRODUCT: '#9B59B6',
  TECHNOLOGY: '#1ABC9C',
  CONCEPT: '#34495E',
  PROJECT: '#E74C3C',
  DOCUMENT: '#16A085'
}

const getEntityColor = (type: string) => {
  return entityTypeColors[type] || '#909399'
}

const buildChartOption = () => {
  const nodes = props.entities.map(entity => ({
    id: entity.entity_id,
    name: entity.name,
    category: entity.type,
    symbolSize: Math.min(60, Math.max(30, entity.name.length * 10 + 20)),
    itemStyle: {
      color: getEntityColor(entity.type)
    },
    label: {
      show: true,
      fontSize: 12
    },
    value: entity.description || entity.type
  }))

  const links = props.relations.map(relation => ({
    id: relation.relation_id,
    source: relation.source_id,
    target: relation.target_id,
    label: {
      show: true,
      formatter: relation.type,
      fontSize: 10
    },
    lineStyle: {
      color: '#909399',
      curveness: 0.2
    },
    value: relation.description
  }))

  const categories = Array.from(new Set(props.entities.map(e => e.type))).map(type => ({
    name: type,
    itemStyle: {
      color: getEntityColor(type)
    }
  }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          return `<strong>${params.name}</strong><br/>类型: ${params.data.category}<br/>${params.data.value || ''}`
        } else if (params.dataType === 'edge') {
          return `<strong>${params.data.label.formatter}</strong><br/>${params.data.value || ''}`
        }
        return ''
      }
    },
    legend: {
      show: categories.length > 0,
      data: categories.map(c => c.name),
      orient: 'vertical',
      right: 10,
      top: 10
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        focusNodeAdjacency: true,
        categories: categories,
        data: nodes,
        links: links,
        label: {
          position: 'right',
          formatter: '{b}'
        },
        lineStyle: {
          color: 'source',
          curveness: 0.3
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            width: 4
          }
        },
        force: {
          repulsion: 500,
          edgeLength: [100, 200],
          gravity: 0.1
        }
      }
    ]
  }
}

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())

  window.addEventListener('resize', handleResize)
}

const handleResize = () => {
  chartInstance?.resize()
}

watch(
  () => [props.entities, props.relations],
  () => {
    if (chartInstance) {
      chartInstance.setOption(buildChartOption())
    }
  },
  { deep: true }
)

onMounted(() => {
  initChart()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style lang="scss" scoped>
.graph-visualizer {
  width: 100%;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}
</style>
