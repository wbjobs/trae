<template>
  <div class="error-page">
    <div class="error-content">
      <div class="error-code">404</div>
      <div class="error-title">页面不存在</div>
      <div class="error-desc">抱歉，您访问的页面不存在或已被移除</div>
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
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
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
