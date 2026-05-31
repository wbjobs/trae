<template>
  <div class="watermark-batch-config">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>批量水印配置</span>
          <div class="header-actions">
            <el-button size="small" @click="loadPresets">
              <el-icon><Refresh /></el-icon>
              重置
            </el-button>
            <el-button type="primary" size="small" @click="applyConfig">
              <el-icon><Check /></el-icon>
              应用配置
            </el-button>
          </div>
        </div>
      </template>
      
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="基础配置" name="basic">
          <el-form :model="config" label-width="120px" class="config-form">
            <el-form-item label="水印类型">
              <el-radio-group v-model="config.type">
                <el-radio value="text">文字水印</el-radio>
                <el-radio value="image">图片水印</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item v-if="config.type === 'text'" label="水印文字">
              <el-input 
                v-model="config.text" 
                type="textarea"
                :rows="2"
                placeholder="支持变量: {username}, {timestamp}, {ip}, {docId}, {dept}"
              />
            </el-form-item>
            
            <el-form-item v-if="config.type === 'text'" label="字体大小">
              <el-slider 
                v-model="config.fontSize" 
                :min="10" 
                :max="72" 
                :step="2"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item v-if="config.type === 'text'" label="字体颜色">
              <el-color-picker v-model="config.color" />
            </el-form-item>
            
            <el-form-item label="透明度">
              <el-slider 
                v-model="config.opacity" 
                :min="0.05" 
                :max="1" 
                :step="0.05"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item label="旋转角度">
              <el-slider 
                v-model="config.rotate" 
                :min="-90" 
                :max="90" 
                :step="5"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item label="字体粗细">
              <el-select v-model="config.fontWeight" style="width: 200px">
                <el-option label="正常" value="normal" />
                <el-option label="加粗" value="bold" />
                <el-option label="更粗" value="bolder" />
              </el-select>
            </el-form-item>
            
            <el-form-item label="字体">
              <el-select v-model="config.fontFamily" style="width: 200px">
                <el-option label="微软雅黑" value="Microsoft YaHei" />
                <el-option label="宋体" value="SimSun" />
                <el-option label="黑体" value="SimHei" />
                <el-option label="Arial" value="Arial" />
                <el-option label="Times New Roman" value="Times New Roman" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        
        <el-tab-pane label="排版布局" name="layout">
          <el-form :model="config" label-width="120px" class="config-form">
            <el-form-item label="布局模式">
              <el-radio-group v-model="config.layoutMode">
                <el-radio value="repeat">平铺重复</el-radio>
                <el-radio value="center">居中显示</el-radio>
                <el-radio value="corners">四角显示</el-radio>
                <el-radio value="diagonal">对角线</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item v-if="config.layoutMode === 'repeat'" label="水平间距">
              <el-slider 
                v-model="config.gapX" 
                :min="50" 
                :max="500" 
                :step="10"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item v-if="config.layoutMode === 'repeat'" label="垂直间距">
              <el-slider 
                v-model="config.gapY" 
                :min="50" 
                :max="500" 
                :step="10"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item v-if="config.layoutMode !== 'repeat'" label="水平偏移">
              <el-slider 
                v-model="config.offsetX" 
                :min="0" 
                :max="500" 
                :step="10"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item v-if="config.layoutMode !== 'repeat'" label="垂直偏移">
              <el-slider 
                v-model="config.offsetY" 
                :min="0" 
                :max="500" 
                :step="10"
                :show-input="true"
              />
            </el-form-item>
            
            <el-form-item label="起始位置">
              <el-radio-group v-model="config.startPosition">
                <el-radio value="top-left">左上</el-radio>
                <el-radio value="top-center">上中</el-radio>
                <el-radio value="top-right">右上</el-radio>
                <el-radio value="center-left">左中</el-radio>
                <el-radio value="center">居中</el-radio>
                <el-radio value="center-right">右中</el-radio>
                <el-radio value="bottom-left">左下</el-radio>
                <el-radio value="bottom-center">下中</el-radio>
                <el-radio value="bottom-right">右下</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="层级">
              <el-radio-group v-model="config.zIndex">
                <el-radio :value="1">底层</el-radio>
                <el-radio :value="10">中层</el-radio>
                <el-radio :value="9999">顶层</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="显示范围">
              <el-checkbox v-model="config.showOnHeader">页眉</el-checkbox>
              <el-checkbox v-model="config.showOnBody">正文</el-checkbox>
              <el-checkbox v-model="config.showOnFooter">页脚</el-checkbox>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        
        <el-tab-pane label="批量应用" name="batch">
          <el-form :model="batchConfig" label-width="120px" class="config-form">
            <el-form-item label="选择文档">
              <el-select 
                v-model="batchConfig.documentIds" 
                multiple
                filterable
                placeholder="选择要应用水印的文档"
                style="width: 100%"
              >
                <el-option 
                  v-for="doc in documentList" 
                  :key="doc.id" 
                  :label="doc.title"
                  :value="doc.id"
                />
              </el-select>
            </el-form-item>
            
            <el-form-item label="按密级筛选">
              <el-checkbox-group v-model="batchConfig.secretLevels">
                <el-checkbox value="public">公开</el-checkbox>
                <el-checkbox value="internal">内部</el-checkbox>
                <el-checkbox value="secret">机密</el-checkbox>
                <el-checkbox value="top_secret">绝密</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            
            <el-form-item label="应用场景">
              <el-checkbox-group v-model="batchConfig.scenarios">
                <el-checkbox value="view">浏览时</el-checkbox>
                <el-checkbox value="download">下载时</el-checkbox>
                <el-checkbox value="print">打印时</el-checkbox>
                <el-checkbox value="share">分享时</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            
            <el-form-item label="已添加水印处理">
              <el-radio-group v-model="batchConfig.overwrite">
                <el-radio :value="true">覆盖</el-radio>
                <el-radio :value="false">跳过</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="应用方式">
              <el-radio-group v-model="batchConfig.applyMode">
                <el-radio value="immediate">立即应用</el-radio>
                <el-radio value="scheduled">定时应用</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item v-if="batchConfig.applyMode === 'scheduled'" label="执行时间">
              <el-date-picker 
                v-model="batchConfig.scheduledTime" 
                type="datetime"
                placeholder="选择执行时间"
                style="width: 300px"
              />
            </el-form-item>
            
            <el-form-item>
              <el-button type="primary" @click="applyBatchWatermark">
                <el-icon><Setting /></el-icon>
                批量应用
              </el-button>
              <el-button @click="previewBatch">
                <el-icon><View /></el-icon>
                预览效果
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        
        <el-tab-pane label="预设模板" name="presets">
          <div class="presets-grid">
            <div 
              v-for="preset in presets" 
              :key="preset.id"
              class="preset-item"
              :class="{ active: activePreset === preset.id }"
              @click="selectPreset(preset)"
            >
              <div class="preset-preview" :style="getPresetStyle(preset)">
                <span class="preset-text">{{ preset.text }}</span>
              </div>
              <div class="preset-name">{{ preset.name }}</div>
              <div class="preset-desc">{{ preset.description }}</div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
    
    <el-card class="preview-card" style="margin-top: 16px">
      <template #header>
        <span>实时预览</span>
      </template>
      
      <div class="preview-container">
        <WatermarkPreview :config="previewConfig">
          <div class="preview-content">
            <h3>文档预览示例</h3>
            <p>这是一个文档预览区域，水印将按照您的配置显示在文档内容之上。</p>
            <p>您可以通过调整左侧的配置参数，实时查看水印效果。</p>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
            <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
          </div>
        </WatermarkPreview>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Check, Setting, View } from '@element-plus/icons-vue'
import WatermarkPreview from './WatermarkPreview.vue'
import { getDocumentList } from '@/api/document'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['update:modelValue', 'apply', 'batch-apply'])

const activeTab = ref('basic')
const activePreset = ref(null)
const documentList = ref([])

const config = reactive({
  type: 'text',
  text: '{username} - {timestamp} - 涉密文档',
  fontSize: 16,
  color: '#ff0000',
  opacity: 0.15,
  rotate: -30,
  fontWeight: 'normal',
  fontFamily: 'Microsoft YaHei',
  layoutMode: 'repeat',
  gapX: 100,
  gapY: 100,
  offsetX: 0,
  offsetY: 0,
  startPosition: 'top-left',
  zIndex: 10,
  showOnHeader: true,
  showOnBody: true,
  showOnFooter: true,
})

const batchConfig = reactive({
  documentIds: [],
  secretLevels: [],
  scenarios: ['view', 'download'],
  overwrite: false,
  applyMode: 'immediate',
  scheduledTime: null,
})

const presets = ref([
  {
    id: 'standard',
    name: '标准涉密',
    description: '适用于一般涉密文档',
    text: '{username} - 涉密文档',
    fontSize: 16,
    color: '#ff0000',
    opacity: 0.15,
    rotate: -30,
    layoutMode: 'repeat',
  },
  {
    id: 'strict',
    name: '严格保密',
    description: '适用于机密/绝密文档',
    text: '{username} {timestamp} {ip} 机密',
    fontSize: 20,
    color: '#ff0000',
    opacity: 0.25,
    rotate: -45,
    layoutMode: 'diagonal',
  },
  {
    id: 'light',
    name: '轻微水印',
    description: '不影响阅读的浅水印',
    text: '{username}',
    fontSize: 14,
    color: '#666666',
    opacity: 0.08,
    rotate: -15,
    layoutMode: 'corners',
  },
  {
    id: 'bold',
    name: '醒目提示',
    description: '大字醒目提示',
    text: '内部资料 请勿外传',
    fontSize: 36,
    color: '#ff6600',
    opacity: 0.2,
    rotate: 0,
    layoutMode: 'center',
  },
])

const previewConfig = computed(() => ({
  text: config.text,
  fontSize: config.fontSize,
  opacity: config.opacity,
  rotate: config.rotate,
  color: config.color,
  gap: config.gapX,
  fontWeight: config.fontWeight,
  fontFamily: config.fontFamily,
  layoutMode: config.layoutMode,
  startPosition: config.startPosition,
}))

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    Object.assign(config, newVal)
  }
}, { deep: true })

watch(config, (newVal) => {
  emit('update:modelValue', { ...newVal })
}, { deep: true })

const loadDocuments = async () => {
  try {
    const data = await getDocumentList({ pageSize: 1000 })
    documentList.value = data.list || []
  } catch (err) {
    console.error('加载文档列表失败:', err)
  }
}

const loadPresets = () => {
  activePreset.value = null
  Object.assign(config, {
    type: 'text',
    text: '{username} - {timestamp} - 涉密文档',
    fontSize: 16,
    color: '#ff0000',
    opacity: 0.15,
    rotate: -30,
    fontWeight: 'normal',
    fontFamily: 'Microsoft YaHei',
    layoutMode: 'repeat',
    gapX: 100,
    gapY: 100,
    offsetX: 0,
    offsetY: 0,
    startPosition: 'top-left',
    zIndex: 10,
    showOnHeader: true,
    showOnBody: true,
    showOnFooter: true,
  })
  ElMessage.success('已重置为默认配置')
}

const selectPreset = (preset) => {
  activePreset.value = preset.id
  Object.assign(config, {
    text: preset.text,
    fontSize: preset.fontSize,
    color: preset.color,
    opacity: preset.opacity,
    rotate: preset.rotate,
    layoutMode: preset.layoutMode,
  })
  ElMessage.success(`已应用模板: ${preset.name}`)
}

const getPresetStyle = (preset) => {
  return {
    fontSize: preset.fontSize + 'px',
    color: preset.color,
    opacity: preset.opacity,
    transform: `rotate(${preset.rotate}deg)`,
  }
}

const applyConfig = () => {
  emit('apply', { ...config })
  ElMessage.success('水印配置已应用')
}

const applyBatchWatermark = () => {
  if (batchConfig.documentIds.length === 0 && batchConfig.secretLevels.length === 0) {
    ElMessage.warning('请选择要应用水印的文档或密级')
    return
  }
  
  emit('batch-apply', {
    config: { ...config },
    batchConfig: { ...batchConfig },
  })
  ElMessage.success('批量水印任务已提交')
}

const previewBatch = () => {
  ElMessage.info('批量预览功能开发中')
}

loadDocuments()
</script>

<style scoped>
.watermark-batch-config {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .header-actions {
      display: flex;
      gap: 8px;
    }
  }
  
  .config-form {
    max-width: 600px;
    padding: 20px 0;
  }
  
  .presets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    padding: 20px 0;
    
    .preset-item {
      border: 2px solid #ebeef5;
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.3s;
      
      &:hover {
        border-color: #409eff;
        transform: translateY(-2px);
      }
      
      &.active {
        border-color: #409eff;
        background: #ecf5ff;
      }
      
      .preset-preview {
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f5f7fa;
        border-radius: 4px;
        margin-bottom: 12px;
        
        .preset-text {
          font-weight: 500;
        }
      }
      
      .preset-name {
        font-weight: 600;
        color: #303133;
        margin-bottom: 4px;
      }
      
      .preset-desc {
        font-size: 12px;
        color: #909399;
      }
    }
  }
  
  .preview-card {
    .preview-container {
      min-height: 400px;
    }
    
    .preview-content {
      padding: 20px;
      background: #fff;
      border-radius: 4px;
      line-height: 1.8;
      
      h3 {
        margin-bottom: 16px;
      }
      
      p {
        margin-bottom: 12px;
        text-indent: 2em;
      }
    }
  }
}
</style>
