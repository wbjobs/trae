<template>
  <div class="error-page">
    <div class="error-content">
      <div class="error-code">403</div>
      <div class="error-title">无权限访问</div>
      <div class="error-desc">抱歉，您没有权限访问该页面</div>
      <div class="error-actions">
        <el-button type="primary" @click="goHome">
          <el-icon><HomeFilled /></el-icon>
          返回首页
        </el-button>
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回上一页
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { HomeFilled, ArrowLeft } from '@element-plus/icons-vue'

const router = useRouter()

const goHome = () => {
  router.push('/')
}

const goBack = () => {
  router.go(-1)
}
</script>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.error-content {
  text-align: center;
  color: #fff;
  
  .error-code {
    font-size: 120px;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }
  
  .error-title {
    font-size: 32px;
    font-weight: 600;
    margin-top: 20px;
  }
  
  .error-desc {
    font-size: 16px;
    margin-top: 12px;
    opacity: 0.9;
  }
  
  .error-actions {
    margin-top: 40px;
    display: flex;
    gap: 16px;
    justify-content: center;
  }
}
</style>
