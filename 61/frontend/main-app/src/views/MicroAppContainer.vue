<template>
  <div class="micro-app-container">
    <div :id="containerId" class="micro-app-wrapper"></div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { loadMicroApp } from 'qiankun'

const route = useRoute()
const microAppName = computed(() => route.meta.microApp)
const containerId = computed(() => `micro-app-${microAppName.value}`)

let microApp = null

const microAppConfigs = {
  dashboard: {
    name: 'dashboard',
    entry: '//localhost:8001',
    container: `#${containerId.value}`,
    activeRule: '/dashboard',
    props: {
      routerBase: '/dashboard'
    }
  },
  logtrace: {
    name: 'logtrace',
    entry: '//localhost:8002',
    container: `#${containerId.value}`,
    activeRule: '/logtrace',
    props: {
      routerBase: '/logtrace'
    }
  },
  auth: {
    name: 'auth',
    entry: '//localhost:8003',
    container: `#${containerId.value}`,
    activeRule: '/auth',
    props: {
      routerBase: '/auth'
    }
  }
}

onMounted(() => {
  const config = microAppConfigs[microAppName.value]
  if (config) {
    microApp = loadMicroApp(config, {
      sandbox: {
        experimentalStyleIsolation: true
      }
    })
  }
})

onUnmounted(() => {
  if (microApp) {
    microApp.unmount()
  }
})
</script>

<style lang="scss" scoped>
.micro-app-container {
  width: 100%;
  height: 100%;

  .micro-app-wrapper {
    width: 100%;
    height: 100%;
    min-height: 600px;
  }
}
</style>
