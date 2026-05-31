<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <el-icon class="logo-icon"><Lock /></el-icon>
        <h1 class="title">涉密文档溯源系统</h1>
        <p class="subtitle">Secure Document Traceability System</p>
      </div>
      
      <el-form 
        ref="loginFormRef" 
        :model="loginForm" 
        :rules="loginRules" 
        class="login-form"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input 
            v-model="loginForm.username" 
            placeholder="请输入用户名" 
            size="large"
            :prefix-icon="User"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input 
            v-model="loginForm.password" 
            type="password" 
            placeholder="请输入密码" 
            size="large"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            size="large" 
            class="login-btn" 
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-footer">
        <p>默认账户: admin / admin123</p>
      </div>
    </div>
    
    <div class="system-info">
      <div class="feature-card">
        <el-icon size="32"><Document /></el-icon>
        <h3>文档加密存储</h3>
        <p>AES-256-GCM高强度加密，保障文档安全</p>
      </div>
      <div class="feature-card">
        <el-icon size="32"><Key /></el-icon>
        <h3>溯源指纹生成</h3>
        <p>基于内容哈希的唯一指纹，可检测篡改</p>
      </div>
      <div class="feature-card">
        <el-icon size="32"><Histogram /></el-icon>
        <h3>操作轨迹追踪</h3>
        <p>全生命周期操作记录，支持审计溯源</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Document, Key, Histogram } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loginForm = reactive({
  username: 'admin',
  password: 'admin123',
})

const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const loginFormRef = ref(null)
const loading = ref(false)

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  try {
    await loginFormRef.value.validate()
    loading.value = true
    
    await userStore.login(loginForm)
    
    ElMessage.success('登录成功')
    
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (err) {
    console.error('登录失败:', err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  gap: 40px;
}

.login-box {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 30px;

  .logo-icon {
    font-size: 48px;
    color: #409eff;
    margin-bottom: 16px;
  }

  .title {
    font-size: 24px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 8px;
  }

  .subtitle {
    font-size: 14px;
    color: #909399;
  }
}

.login-form {
  .login-btn {
    width: 100%;
    height: 44px;
    font-size: 16px;
  }
}

.login-footer {
  text-align: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;

  p {
    color: #909399;
    font-size: 12px;
  }
}

.system-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 300px;
}

.feature-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 20px;
  color: #fff;

  h3 {
    font-size: 16px;
    margin: 12px 0 8px;
  }

  p {
    font-size: 13px;
    opacity: 0.8;
    line-height: 1.5;
  }
}

@media (max-width: 900px) {
  .login-container {
    flex-direction: column;
  }

  .system-info {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: 400px;
  }

  .feature-card {
    flex: 1;
    min-width: 150px;
  }
}
</style>
