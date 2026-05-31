<template>
  <el-container class="main-container">
    <el-aside width="200px">
      <el-menu
        :default-active="currentRoute"
        class="el-menu-vertical"
        router
      >
        <el-menu-item index="/">
          <el-icon><List /></el-icon>
          <span>任务管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-main style="padding: 20px; overflow: auto;">
      <router-view />
    </el-main>
    
    <ConflictDialog />
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { List } from '@element-plus/icons-vue'
import ConflictDialog from './components/ConflictDialog.vue'

const route = useRoute()
const currentRoute = computed(() => route.path)
</script>

<style scoped>
.main-container {
  height: 100%;
}
</style>
