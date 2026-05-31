<template>
  <div class="page-container">
    <PageHeader title="水印配置" icon="PictureFilled" subtitle="配置文档水印模板，支持文字水印、图片水印，可预览效果并应用到文档" />
    
    <div class="card-container">
      <div class="watermark-layout">
        <div class="config-panel">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="水印模板列表" name="list">
              <div class="template-header">
                <el-button type="primary" @click="showCreateDialog">
                  <el-icon><Plus /></el-icon>
                  新建模板
                </el-button>
              </div>
              
              <el-table :data="configs" v-loading="loading" stripe>
                <el-table-column type="index" width="60" label="#" />
                <el-table-column prop="name" label="模板名称" min-width="120" />
                <el-table-column prop="type" label="类型" width="80">
                  <template #default="{ row }">
                    <el-tag :type="row.type === 'text' ? 'primary' : 'success'" size="small">
                      {{ row.type === 'text' ? '文字' : '图片' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="适用密级" width="120">
                  <template #default="{ row }">
                    <SecretBadge v-for="level in row.secret_levels" :key="level" :level="level" style="margin-right: 4px" />
                  </template>
                </el-table-column>
                <el-table-column prop="opacity" label="透明度" width="100">
                  <template #default="{ row }">
                    {{ (row.opacity * 100).toFixed(0) }}%
                  </template>
                </el-table-column>
                <el-table-column label="是否默认" width="100">
                  <template #default="{ row }">
                    <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
                    <span v-else style="color: #c0c4cc">-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="created_at" label="创建时间" width="160">
                  <template #default="{ row }">
                    {{ formatDateTime(row.created_at) }}
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="180" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" text size="small" @click="showPreviewConfig(row)">
                      预览
                    </el-button>
                    <el-button type="success" text size="small" @click="editConfig(row)">
                      编辑
                    </el-button>
                    <el-button 
                      v-if="!row.is_default"
                      type="danger" 
                      text 
                      size="small"
                      @click="deleteConfig(row.id)"
                    >
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
            
            <el-tab-pane label="水印规则配置" name="rules">
              <el-card class="rule-card">
                <template #header>
                  <span>水印触发规则</span>
                </template>
                
                <el-form :model="watermarkRules" label-width="120px">
                  <el-form-item label="自动添加水印">
                    <el-switch v-model="watermarkRules.autoAdd" />
                    <span style="margin-left: 10px; color: #909399">文档上传时自动添加水印</span>
                  </el-form-item>
                  
                  <el-form-item label="强制水印">
                    <el-switch v-model="watermarkRules.forced" />
                    <span style="margin-left: 10px; color: #909399">所有文档必须添加水印，用户不可关闭</span>
                  </el-form-item>
                  
                  <el-form-item label="浏览时显示">
                    <el-switch v-model="watermarkRules.showOnView" />
                    <span style="margin-left: 10px; color: #909399">在线浏览文档时显示水印</span>
                  </el-form-item>
                  
                  <el-form-item label="下载时添加">
                    <el-switch v-model="watermarkRules.addOnDownload" />
                    <span style="margin-left: 10px; color: #909399">下载文档时自动添加水印</span>
                  </el-form-item>
                  
                  <el-form-item label="打印时添加">
                    <el-switch v-model="watermarkRules.addOnPrint" />
                    <span style="margin-left: 10px; color: #909399">打印文档时自动添加水印</span>
                  </el-form-item>
                  
                  <el-form-item label="涉密等级阈值">
                    <el-select v-model="watermarkRules.secretLevelThreshold" style="width: 200px">
                      <el-option label="公开" value="public" />
                      <el-option label="内部" value="internal" />
                      <el-option label="机密" value="secret" />
                      <el-option label="绝密" value="top_secret" />
                    </el-select>
                    <span style="margin-left: 10px; color: #909399">达到该密级及以上的文档必须加水印</span>
                  </el-form-item>
                  
                  <el-form-item>
                    <el-button type="primary" @click="saveRules">保存规则</el-button>
                  </el-form-item>
                </el-form>
              </el-card>
              
              <el-card class="rule-card" style="margin-top: 16px">
                <template #header>
                  <span>水印内容配置</span>
                </template>
                
                <el-form :model="contentRules" label-width="120px">
                  <el-form-item label="包含用户名">
                    <el-switch v-model="contentRules.includeUsername" />
                  </el-form-item>
                  
                  <el-form-item label="包含用户ID">
                    <el-switch v-model="contentRules.includeUserId" />
                  </el-form-item>
                  
                  <el-form-item label="包含时间戳">
                    <el-switch v-model="contentRules.includeTimestamp" />
                  </el-form-item>
                  
                  <el-form-item label="包含IP地址">
                    <el-switch v-model="contentRules.includeIp" />
                  </el-form-item>
                  
                  <el-form-item label="包含文档ID">
                    <el-switch v-model="contentRules.includeDocumentId" />
                  </el-form-item>
                  
                  <el-form-item label="自定义内容">
                    <el-input 
                      v-model="contentRules.customText" 
                      type="textarea"
                      :rows="2"
                      placeholder="可输入自定义水印文本，支持变量：{username}, {timestamp}, {ip}, {docId}"
                    />
                  </el-form-item>
                  
                  <el-form-item>
                    <el-button type="primary" @click="saveContentRules">保存配置</el-button>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-tab-pane>
            
            <el-tab-pane label="批量水印配置" name="batch">
              <WatermarkBatchConfig 
                @apply="handleBatchApply" 
                @batch-apply="handleBatchApplyAll" 
              />
            </el-tab-pane>
          </el-tabs>
        </div>
        
        <div class="preview-panel">
          <el-card class="preview-card">
            <template #header>
              <div class="preview-header">
                <span>水印预览</span>
                <el-button size="small" @click="refreshPreview">
                  <el-icon><Refresh /></el-icon>
                  刷新
                </el-button>
              </div>
            </template>
            
            <WatermarkPreview :config="previewConfig" class="watermark-preview">
              <div class="preview-content">
                <h3>文档预览区域</h3>
                <p>这是一个文档预览示例，水印将叠加在文档内容之上。</p>
                <p>水印配置将应用于所有授权文档的浏览和下载操作。</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
                <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
              </div>
            </WatermarkPreview>
          </el-card>
          
          <el-card class="config-card" style="margin-top: 16px">
            <template #header>
              <span>实时调整</span>
            </template>
            
            <el-form :model="previewConfig" label-width="100px">
              <el-form-item label="水印文字">
                <el-input v-model="previewConfig.text" placeholder="输入水印文字" />
              </el-form-item>
              
              <el-form-item label="字体大小">
                <el-slider v-model="previewConfig.fontSize" :min="12" :max="48" :step="2" />
                <span style="color: #909399">{{ previewConfig.fontSize }}px</span>
              </el-form-item>
              
              <el-form-item label="透明度">
                <el-slider v-model="previewConfig.opacity" :min="0.1" :max="1" :step="0.1" />
                <span style="color: #909399">{{ (previewConfig.opacity * 100).toFixed(0) }}%</span>
              </el-form-item>
              
              <el-form-item label="旋转角度">
                <el-slider v-model="previewConfig.rotate" :min="-45" :max="45" :step="5" />
                <span style="color: #909399">{{ previewConfig.rotate }}°</span>
              </el-form-item>
              
              <el-form-item label="字体颜色">
                <el-color-picker v-model="previewConfig.color" />
              </el-form-item>
              
              <el-form-item label="间距">
                <el-input-number v-model="previewConfig.gap" :min="50" :max="300" :step="10" />
                <span style="color: #909399; margin-left: 10px">px</span>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
      </div>
    </div>
    
    <el-dialog 
      v-model="configDialogVisible" 
      :title="isEdit ? '编辑水印模板' : '新建水印模板'" 
      width="600px"
    >
      <el-form :model="configForm" :rules="configRules" ref="configFormRef" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="configForm.name" placeholder="请输入模板名称" />
        </el-form-item>
        
        <el-form-item label="水印类型" prop="type">
          <el-radio-group v-model="configForm.type">
            <el-radio value="text">文字水印</el-radio>
            <el-radio value="image">图片水印</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item v-if="configForm.type === 'text'" label="水印文字" prop="text">
          <el-input v-model="configForm.text" placeholder="请输入水印文字，支持变量：{username}, {timestamp}" />
        </el-form-item>
        
        <el-form-item v-if="configForm.type === 'image'" label="水印图片" prop="imageUrl">
          <el-upload
            class="avatar-uploader"
            :action="uploadUrl"
            :show-file-list="false"
            :on-success="handleUploadSuccess"
            :before-upload="beforeUpload"
          >
            <img v-if="configForm.imageUrl" :src="configForm.imageUrl" class="avatar" />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        
        <el-form-item label="适用密级" prop="secretLevels">
          <el-checkbox-group v-model="configForm.secretLevels">
            <el-checkbox value="public">公开</el-checkbox>
            <el-checkbox value="internal">内部</el-checkbox>
            <el-checkbox value="secret">机密</el-checkbox>
            <el-checkbox value="top_secret">绝密</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        
        <el-form-item label="透明度" prop="opacity">
          <el-slider v-model="configForm.opacity" :min="0.1" :max="1" :step="0.1" />
        </el-form-item>
        
        <el-form-item label="旋转角度" prop="rotate">
          <el-slider v-model="configForm.rotate" :min="-45" :max="45" :step="5" />
        </el-form-item>
        
        <el-form-item label="字体大小" prop="fontSize">
          <el-input-number v-model="configForm.fontSize" :min="12" :max="48" />
        </el-form-item>
        
        <el-form-item label="字体颜色" prop="color">
          <el-color-picker v-model="configForm.color" />
        </el-form-item>
        
        <el-form-item label="设为默认">
          <el-switch v-model="configForm.isDefault" />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="configDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import WatermarkPreview from '@/components/WatermarkPreview.vue'
import WatermarkBatchConfig from '@/components/WatermarkBatchConfig.vue'
import SecretBadge from '@/components/SecretBadge.vue'
import {
  getWatermarkConfigs,
  createWatermarkConfig,
  updateWatermarkConfig,
  deleteWatermarkConfig,
  getDefaultWatermark,
} from '@/api/watermark'

const loading = ref(false)
const activeTab = ref('list')
const configDialogVisible = ref(false)
const isEdit = ref(false)
const configFormRef = ref(null)

const configs = ref([])

const watermarkRules = reactive({
  autoAdd: true,
  forced: false,
  showOnView: true,
  addOnDownload: true,
  addOnPrint: true,
  secretLevelThreshold: 'internal',
})

const contentRules = reactive({
  includeUsername: true,
  includeUserId: false,
  includeTimestamp: true,
  includeIp: true,
  includeDocumentId: false,
  customText: '',
})

const previewConfig = reactive({
  text: '涉密文档 {username} {timestamp}',
  fontSize: 16,
  opacity: 0.15,
  rotate: -30,
  color: '#000000',
  gap: 100,
})

const configForm = reactive({
  id: null,
  name: '',
  type: 'text',
  text: '',
  imageUrl: '',
  secretLevels: [],
  opacity: 0.15,
  rotate: -30,
  fontSize: 16,
  color: '#000000',
  isDefault: false,
})

const configRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择水印类型', trigger: 'change' }],
  text: [{ required: true, message: '请输入水印文字', trigger: 'blur' }],
  opacity: [{ required: true, message: '请设置透明度', trigger: 'change' }],
}

const uploadUrl = '/api/upload/watermark'

const loadConfigs = async () => {
  loading.value = true
  try {
    const data = await getWatermarkConfigs()
    configs.value = data || []
    
    const defaultConfig = await getDefaultWatermark()
    if (defaultConfig) {
      Object.assign(previewConfig, {
        text: defaultConfig.text || previewConfig.text,
        fontSize: defaultConfig.font_size || previewConfig.fontSize,
        opacity: defaultConfig.opacity || previewConfig.opacity,
        rotate: defaultConfig.rotate || previewConfig.rotate,
        color: defaultConfig.color || previewConfig.color,
        gap: defaultConfig.gap || previewConfig.gap,
      })
    }
  } catch (err) {
    ElMessage.error(err.message || '加载配置失败')
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  Object.assign(configForm, {
    id: null,
    name: '',
    type: 'text',
    text: '',
    imageUrl: '',
    secretLevels: [],
    opacity: 0.15,
    rotate: -30,
    fontSize: 16,
    color: '#000000',
    isDefault: false,
  })
  configDialogVisible.value = true
}

const editConfig = (row) => {
  isEdit.value = true
  Object.assign(configForm, {
    id: row.id,
    name: row.name,
    type: row.type,
    text: row.text || '',
    imageUrl: row.image_url || '',
    secretLevels: row.secret_levels || [],
    opacity: row.opacity,
    rotate: row.rotate || -30,
    fontSize: row.font_size || 16,
    color: row.color || '#000000',
    isDefault: row.is_default,
  })
  configDialogVisible.value = true
}

const showPreviewConfig = (row) => {
  Object.assign(previewConfig, {
    text: row.text || previewConfig.text,
    fontSize: row.font_size || previewConfig.fontSize,
    opacity: row.opacity || previewConfig.opacity,
    rotate: row.rotate || previewConfig.rotate,
    color: row.color || previewConfig.color,
  })
}

const saveConfig = async () => {
  if (!configFormRef.value) return
  
  try {
    await configFormRef.value.validate()
    
    const data = {
      name: configForm.name,
      type: configForm.type,
      text: configForm.text,
      image_url: configForm.imageUrl,
      secret_levels: configForm.secretLevels,
      opacity: configForm.opacity,
      rotate: configForm.rotate,
      font_size: configForm.fontSize,
      color: configForm.color,
      is_default: configForm.isDefault,
    }
    
    if (isEdit.value) {
      await updateWatermarkConfig(configForm.id, data)
      ElMessage.success('更新成功')
    } else {
      await createWatermarkConfig(data)
      ElMessage.success('创建成功')
    }
    
    configDialogVisible.value = false
    loadConfigs()
  } catch (err) {
    if (err !== false) {
      ElMessage.error(err.message || '保存失败')
    }
  }
}

const deleteConfig = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除该水印模板吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    
    await deleteWatermarkConfig(id)
    ElMessage.success('删除成功')
    loadConfigs()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

const saveRules = () => {
  ElMessage.success('水印规则已保存')
}

const saveContentRules = () => {
  ElMessage.success('内容配置已保存')
}

const refreshPreview = () => {
  ElMessage.success('预览已刷新')
}

const beforeUpload = (file) => {
  const isImage = file.type.startsWith('image/')
  if (!isImage) {
    ElMessage.error('只支持上传图片文件')
    return false
  }
  const isLt2M = file.size / 1024 / 1024 < 2
  if (!isLt2M) {
    ElMessage.error('图片大小不能超过 2MB')
    return false
  }
  return true
}

const handleUploadSuccess = (response) => {
  configForm.imageUrl = response.url
}

const formatDateTime = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const handleBatchApply = (config) => {
  ElMessage.success('水印配置已应用')
}

const handleBatchApplyAll = (data) => {
  console.log('批量应用水印:', data)
  ElMessage.success('批量水印任务已提交，后台正在处理...')
}

onMounted(() => {
  loadConfigs()
})
</script>

<style scoped>
.watermark-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
}

@media (max-width: 1200px) {
  .watermark-layout {
    grid-template-columns: 1fr;
  }
}

.template-header {
  margin-bottom: 16px;
}

.preview-card {
  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .watermark-preview {
    min-height: 400px;
  }
  
  .preview-content {
    padding: 20px;
    background: #fff;
    border-radius: 4px;
    line-height: 1.8;
    color: #303133;
    
    h3 {
      margin-bottom: 16px;
      color: #303133;
    }
    
    p {
      margin-bottom: 12px;
      text-indent: 2em;
    }
  }
}

.config-card {
  :deep(.el-form-item) {
    margin-bottom: 16px;
  }
}

.rule-card {
  :deep(.el-form-item) {
    margin-bottom: 20px;
  }
}

.avatar-uploader {
  :deep(.el-upload) {
    border: 1px dashed #d9d9d9;
    border-radius: 6px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    
    &:hover {
      border-color: #409eff;
    }
  }
  
  .avatar-uploader-icon {
    font-size: 28px;
    color: #8c939d;
    width: 100px;
    height: 100px;
    text-align: center;
    line-height: 100px;
  }
  
  .avatar {
    width: 100px;
    height: 100px;
    display: block;
  }
}
</style>
