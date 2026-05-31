<template>
  <div class="message-editor">
    <div class="editor-header">
      <div class="header-left">
        <h2>报文编辑器</h2>
        <el-select v-model="currentSchema" placeholder="选择报文格式" style="width: 240px" @change="loadSchema">
          <el-option v-for="s in schemas" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </div>
      <div class="header-right">
        <el-button :icon="Plus" @click="newSchema">新建</el-button>
        <el-button :icon="Document" @click="showImportDialog = true">批量导入</el-button>
        <el-button :icon="Save" type="primary" @click="saveSchema" :disabled="!currentSchema" :loading="saving">保存</el-button>
        <el-button :icon="Delete" type="danger" @click="deleteSchema" :disabled="!currentSchema">删除</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="editor-body">
      <el-col :span="5" class="field-palette">
        <div class="palette-title">字段类型</div>
        <draggable v-model="fieldTypes" :group="{ name: 'fields', pull: 'clone', put: false }" item-key="type" @start="drag = true" @end="drag = false">
          <template #item="{ element }">
            <div class="field-item" :class="`field-${element.type}`">
              <el-icon><component :is="element.icon" /></el-icon>
              <span>{{ element.label }}</span>
            </div>
          </template>
        </draggable>
      </el-col>

      <el-col :span="10" class="field-editor">
        <div class="editor-title">
          <span>报文结构</span>
          <el-input v-model="schemaName" placeholder="报文名称" style="width: 200px; margin-left: 16px" />
          <el-select v-model="protocolId" placeholder="关联协议" style="width: 160px; margin-left: 8px">
            <el-option v-for="p in protocols" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </div>
        
        <div class="schema-config">
          <el-form-item label="报文头标识">
            <el-input v-model="headerPattern" placeholder="如: 0xAA, START" style="width: 200px" />
          </el-form-item>
          <el-form-item label="长度字段">
            <el-input v-model="lengthField" placeholder="指定长度字段名" style="width: 200px" />
          </el-form-item>
          <el-form-item label="报尾标识">
            <el-input v-model="footerPattern" placeholder="如: 0x55, END" style="width: 200px" />
          </el-form-item>
        </div>

        <div class="fields-container">
          <draggable v-model="fields" group="fields" item-key="id" handle=".drag-handle" animation="200" ghost-class="ghost">
            <template #item="{ element, index }">
              <div class="field-card">
                <div class="field-header">
                  <el-icon class="drag-handle"><Rank /></el-icon>
                  <span class="field-name">{{ element.name || '未命名字段' }}</span>
                  <el-tag size="small" :type="getFieldTypeTag(element.type)">{{ element.type }}</el-tag>
                  <div class="field-actions">
                    <el-button type="primary" link @click="expandField(index)">
                      {{ expandedFields.includes(index) ? '收起' : '展开' }}
                    </el-button>
                    <el-button type="danger" link @click="removeField(index)">删除</el-button>
                  </div>
                </div>
                <div v-show="expandedFields.includes(index)" class="field-body">
                  <el-form :model="element" label-width="80px" size="small">
                    <el-row :gutter="12">
                      <el-col :span="12">
                        <el-form-item label="字段名" prop="name">
                          <el-input v-model="element.name" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="类型" prop="type">
                          <el-select v-model="element.type" style="width: 100%">
                            <el-option value="string" label="字符串" />
                            <el-option value="number" label="数字" />
                            <el-option value="boolean" label="布尔" />
                            <el-option value="binary" label="二进制" />
                            <el-option value="object" label="对象" />
                            <el-option value="array" label="数组" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="长度">
                          <el-input-number v-model="element.length" :min="0" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="偏移">
                          <el-input-number v-model="element.offset" :min="0" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="编码">
                          <el-select v-model="element.encoding" style="width: 100%">
                            <el-option value="utf8" label="UTF-8" />
                            <el-option value="ascii" label="ASCII" />
                            <el-option value="hex" label="HEX" />
                            <el-option value="base64" label="Base64" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="默认值">
                          <el-input v-model="element.defaultValue" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="必填">
                          <el-switch v-model="element.required" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="24">
                        <el-form-item label="描述">
                          <el-input v-model="element.description" type="textarea" :rows="2" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </el-form>
                </div>
              </div>
            </template>
          </draggable>
          <div v-if="fields.length === 0" class="empty-tip">
            <el-icon :size="48"><Box /></el-icon>
            <p>从左侧拖拽字段类型到这里</p>
          </div>
        </div>
      </el-col>

      <el-col :span="9" class="preview-panel">
        <div class="preview-tabs">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="报文预览" name="preview">
              <div class="preview-content">
                <div class="hex-viewer">
                  <pre>{{ hexPreview }}</pre>
                </div>
                <div class="parsed-preview">
                  <h4>解析结果预览</h4>
                  <el-tree :data="parsedTree" :props="{ label: 'label', children: 'children' }" default-expand-all />
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="测试解析" name="test">
              <div class="test-content">
                <el-form label-width="100px">
                  <el-form-item label="原始数据">
                    <el-input v-model="testRawData" type="textarea" :rows="6" placeholder="输入原始报文数据 (HEX或Base64)" />
                  </el-form-item>
                  <el-form-item label="解析格式">
                    <el-radio-group v-model="testFormat">
                      <el-radio value="hex">HEX</el-radio>
                      <el-radio value="base64">Base64</el-radio>
                      <el-radio value="json">JSON</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="testParse" :loading="testing">解析测试</el-button>
                  </el-form-item>
                </el-form>
                <div v-if="testResult" class="test-result">
                  <h4>解析结果</h4>
                  <pre>{{ JSON.stringify(testResult, null, 2) }}</pre>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="JSON配置" name="json">
              <div class="json-content">
                <pre>{{ JSON.stringify(currentSchemaData, null, 2) }}</pre>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-col>
    </el-row>

    <el-dialog v-model="showImportDialog" title="批量导入协议模板" width="600px">
      <el-tabs v-model="importTab">
        <el-tab-pane label="JSON文件" name="json">
          <el-upload
            class="upload-area"
            drag
            :auto-upload="false"
            :on-change="handleFileUpload"
            accept=".json"
            :show-file-list="false">
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              将JSON文件拖到此处，或<em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                支持标准协议模板JSON格式
              </div>
            </template>
          </el-upload>
          <div v-if="importPreview.length > 0" class="import-preview">
            <h4>预览 ({{ importPreview.length }} 个模板)</h4>
            <div class="preview-list">
              <div v-for="(item, index) in importPreview" :key="index" class="preview-item">
                <el-checkbox v-model="importSelections[index]">{{ item.name }}</el-checkbox>
                <el-tag size="small">{{ item.protocolId || '未指定协议' }}</el-tag>
                <span class="field-count">{{ item.fields?.length || 0 }} 字段</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="模板列表" name="templates">
          <div class="template-list">
            <div v-for="(tpl, index) in builtInTemplates" :key="index" class="template-card">
              <el-checkbox v-model="templateSelections[index]">{{ tpl.name }}</el-checkbox>
              <p>{{ tpl.description }}</p>
              <div class="template-tags">
                <el-tag size="small" type="success">{{ tpl.protocol }}</el-tag>
                <el-tag size="small">{{ tpl.fields }} 字段</el-tag>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmImport" :disabled="importing">
          {{ importing ? '导入中...' : '导入选中' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import draggable from 'vuedraggable';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, Save, Delete, Rank, Box, UploadFilled,
  Document, Hash, SwitchButton, Folder, List, DataLine
} from '@element-plus/icons-vue';
import { getSchemas, getProtocols, createSchema, updateSchema, deleteSchema, testParse } from '@/api/protocol';
import type { MessageSchema, MessageField, ProtocolConfig } from '@/types';
import { generateId } from '@/utils';

const route = useRoute();
const router = useRouter();

const schemas = ref<MessageSchema[]>([]);
const protocols = ref<ProtocolConfig[]>([]);
const currentSchema = ref('');
const schemaName = ref('');
const protocolId = ref('');
const headerPattern = ref('');
const footerPattern = ref('');
const lengthField = ref('');
const fields = ref<MessageField[]>([]);
const expandedFields = ref<number[]>([]);
const drag = ref(false);
const saving = ref(false);
const testing = ref(false);
const activeTab = ref('preview');
const testRawData = ref('');
const testFormat = ref('hex');
const testResult = ref<any>(null);
const showImportDialog = ref(false);
const importTab = ref('json');
const importPreview = ref<any[]>([]);
const importSelections = ref<boolean[]>([]);
const templateSelections = ref<boolean[]>([]);
const importing = ref(false);

const builtInTemplates = [
  {
    name: '温度传感器标准协议',
    description: '适用于工业温度传感器的标准报文格式',
    protocol: 'MQTT',
    fields: 5
  },
  {
    name: 'PLC Modbus RTU协议',
    description: 'Modbus RTU标准通讯格式',
    protocol: 'Modbus',
    fields: 8
  },
  {
    name: '电力仪表DL/T645协议',
    description: '电力行业标准仪表通讯协议',
    protocol: 'TCP',
    fields: 12
  },
  {
    name: '智能电表通用协议',
    description: '智能电表数据采集通用格式',
    protocol: 'MQTT',
    fields: 10
  },
  {
    name: '压力传感器协议',
    description: '工业压力传感器标准格式',
    protocol: 'HTTP',
    fields: 6
  }
];

const fieldTypes = [
  { type: 'string', label: '字符串', icon: Document },
  { type: 'number', label: '数字', icon: Hash },
  { type: 'boolean', label: '布尔', icon: SwitchButton },
  { type: 'binary', label: '二进制', icon: DataLine },
  { type: 'object', label: '对象', icon: Folder },
  { type: 'array', label: '数组', icon: List }
];

const getFieldTypeTag = (type: string) => {
  const map: Record<string, any> = {
    string: 'success',
    number: 'primary',
    boolean: 'warning',
    binary: 'info',
    object: '',
    array: 'danger'
  };
  return map[type] || '';
};

const currentSchemaData = computed(() => ({
  id: currentSchema.value,
  name: schemaName.value,
  protocolId: protocolId.value,
  fields: fields.value,
  headerPattern: headerPattern.value,
  footerPattern: footerPattern.value,
  lengthField: lengthField.value
}));

const hexPreview = computed(() => {
  let hex = '';
  let offset = 0;
  fields.value.forEach((f, i) => {
    const len = f.length || 4;
    hex += `${offset.toString(16).padStart(4, '0')}: `;
    for (let j = 0; j < len; j++) {
      hex += `${Math.floor(Math.random() * 256).toString(16).padStart(2, '0')} `;
    }
    hex += ` | ${f.name || `field${i + 1}`}\n`;
    offset += len;
  });
  return hex || '0000: 00 00 00 00 | 暂无字段';
});

const parsedTree = computed(() => {
  return fields.value.map(f => ({
    label: `${f.name || '未命名'} (${f.type})`,
    children: f.type === 'object' && f.children ? f.children.map(c => ({
      label: `${c.name || '子字段'} (${c.type})`
    })) : undefined
  }));
});

const expandField = (index: number) => {
  const i = expandedFields.value.indexOf(index);
  if (i > -1) {
    expandedFields.value.splice(i, 1);
  } else {
    expandedFields.value.push(index);
  }
};

const removeField = (index: number) => {
  fields.value.splice(index, 1);
};

const loadSchema = async (id: string) => {
  try {
    const schema = await getSchemas().then(res => res.list.find(s => s.id === id));
    if (schema) {
      schemaName.value = schema.name;
      protocolId.value = schema.protocolId;
      headerPattern.value = schema.headerPattern || '';
      footerPattern.value = schema.footerPattern || '';
      lengthField.value = schema.lengthField || '';
      fields.value = schema.fields;
      expandedFields.value = [];
    }
  } catch (error) {
    ElMessage.error('加载报文格式失败');
  }
};

const newSchema = () => {
  currentSchema.value = '';
  schemaName.value = '新报文格式';
  protocolId.value = protocols.value[0]?.id || '';
  headerPattern.value = '';
  footerPattern.value = '';
  lengthField.value = '';
  fields.value = [];
  expandedFields.value = [];
};

const saveSchema = async () => {
  if (!schemaName.value) {
    ElMessage.warning('请输入报文名称');
    return;
  }
  if (!protocolId.value) {
    ElMessage.warning('请选择关联协议');
    return;
  }
  saving.value = true;
  try {
    const data = {
      name: schemaName.value,
      protocolId: protocolId.value,
      fields: fields.value,
      headerPattern: headerPattern.value,
      footerPattern: footerPattern.value,
      lengthField: lengthField.value
    };
    if (currentSchema.value) {
      await updateSchema(currentSchema.value, data);
      ElMessage.success('更新成功');
    } else {
      const res = await createSchema(data);
      currentSchema.value = res.id;
      ElMessage.success('创建成功');
    }
    await loadSchemas();
  } finally {
    saving.value = false;
  }
};

const deleteSchema = async () => {
  if (!currentSchema.value) return;
  try {
    await ElMessageBox.confirm('确定删除此报文格式吗？', '提示', { type: 'warning' });
    await deleteSchema(currentSchema.value);
    ElMessage.success('删除成功');
    currentSchema.value = '';
    newSchema();
    await loadSchemas();
  } catch {}
};

const testParse = async () => {
  if (!currentSchema.value || !testRawData.value) {
    ElMessage.warning('请选择报文格式并输入测试数据');
    return;
  }
  testing.value = true;
  try {
    testResult.value = await testParse(currentSchema.value, testRawData.value);
  } finally {
    testing.value = false;
  }
};

const loadSchemas = async () => {
  const res = await getSchemas();
  schemas.value = res.list;
};

const initFromRoute = async () => {
  const [schemaRes, protoRes] = await Promise.all([getSchemas(), getProtocols()]);
  schemas.value = schemaRes.list;
  protocols.value = protoRes.list;
  
  const routeProtocolId = route.params.protocolId as string;
  
  const protocolSchemas = routeProtocolId 
    ? schemas.value.filter(s => s.protocolId === routeProtocolId)
    : schemas.value;
  
  if (protocolSchemas.length > 0) {
    currentSchema.value = protocolSchemas[0].id;
    await loadSchema(currentSchema.value);
  } else {
    newSchema();
    if (routeProtocolId && protocols.value.find(p => p.id === routeProtocolId)) {
      protocolId.value = routeProtocolId;
    }
  }
};

const handleFileUpload = (file: any) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);
      
      const templates = Array.isArray(data) ? data : data.schemas || [data];
      importPreview.value = templates;
      importSelections.value = templates.map(() => true);
      
      ElMessage.success(`解析成功，共 ${templates.length} 个模板`);
    } catch (error) {
      ElMessage.error('文件解析失败，请检查JSON格式');
    }
  };
  reader.readAsText(file.raw);
};

const confirmImport = async () => {
  const selected: any[] = [];
  
  if (importTab.value === 'json') {
    importPreview.value.forEach((item, index) => {
      if (importSelections.value[index]) {
        selected.push(item);
      }
    });
  } else {
    const templateData: Record<string, any> = {
      '温度传感器标准协议': {
        name: '温度传感器标准协议',
        fields: [
          { name: 'deviceId', type: 'string', required: true },
          { name: 'temperature', type: 'number', required: true },
          { name: 'humidity', type: 'number', required: false },
          { name: 'timestamp', type: 'number', required: true },
          { name: 'status', type: 'number', required: false }
        ]
      },
      'PLC Modbus RTU协议': {
        name: 'PLC Modbus RTU协议',
        fields: [
          { name: 'slaveAddress', type: 'number', required: true },
          { name: 'functionCode', type: 'number', required: true },
          { name: 'startAddress', type: 'number', required: true },
          { name: 'quantity', type: 'number', required: true },
          { name: 'data', type: 'array', required: false },
          { name: 'crc', type: 'string', required: true }
        ]
      }
    };
    
    builtInTemplates.forEach((tpl, index) => {
      if (templateSelections.value[index]) {
        selected.push(templateData[tpl.name] || { ...tpl, fields: [] });
      }
    });
  }
  
  if (selected.length === 0) {
    ElMessage.warning('请选择要导入的模板');
    return;
  }
  
  importing.value = true;
  try {
    let successCount = 0;
    for (const item of selected) {
      try {
        await createSchema({
          name: item.name,
          protocolId: protocolId.value || protocols.value[0]?.id,
          fields: item.fields || [],
          description: item.description
        });
        successCount++;
      } catch {
        console.warn(`导入模板 ${item.name} 失败`);
      }
    }
    
    ElMessage.success(`成功导入 ${successCount} 个模板`);
    showImportDialog.value = false;
    importPreview.value = [];
    importSelections.value = [];
    templateSelections.value = [];
    await loadSchemas();
  } finally {
    importing.value = false;
  }
};

watch(() => route.params.protocolId, () => {
  initFromRoute();
});

onMounted(initFromRoute);
</script>

<style scoped>
.message-editor {
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
}

.editor-body {
  flex: 1;
  margin: 0;
}

.field-palette,
.field-editor,
.preview-panel {
  background: #fff;
  border-radius: 8px;
  height: 100%;
  overflow: hidden;
}

.palette-title,
.editor-title,
.preview-title {
  padding: 16px;
  border-bottom: 1px solid #ebeef5;
  font-weight: 600;
  color: #303133;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin: 8px 16px;
  background: #f5f7fa;
  border-radius: 6px;
  cursor: grab;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.field-item:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.field-string { border-left: 4px solid #67c23a; }
.field-number { border-left: 4px solid #409eff; }
.field-boolean { border-left: 4px solid #e6a23c; }
.field-binary { border-left: 4px solid #909399; }
.field-object { border-left: 4px solid #c0c4cc; }
.field-array { border-left: 4px solid #f56c6c; }

.editor-title {
  display: flex;
  align-items: center;
}

.schema-config {
  padding: 16px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  gap: 24px;
}

.fields-container {
  padding: 16px;
  overflow-y: auto;
  height: calc(100% - 180px);
}

.field-card {
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}

.field-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f5f7fa;
}

.field-name {
  flex: 1;
  font-weight: 500;
}

.field-actions {
  display: flex;
  gap: 4px;
}

.field-body {
  padding: 16px;
  border-top: 1px solid #ebeef5;
}

.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #909399;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
}

.empty-tip p {
  margin-top: 12px;
}

.preview-tabs {
  height: 100%;
}

.preview-tabs :deep(.el-tabs__content) {
  height: calc(100% - 55px);
  overflow-y: auto;
}

.preview-content,
.test-content,
.json-content {
  padding: 16px;
}

.hex-viewer {
  margin-bottom: 16px;
}

.parsed-preview h4 {
  margin-bottom: 12px;
}

.test-result {
  margin-top: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 6px;
}

.test-result pre {
  margin: 0;
  max-height: 300px;
  overflow: auto;
}

.json-content pre {
  max-height: 500px;
  overflow: auto;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 6px;
}

.ghost {
  opacity: 0.5;
  background: #c8ebfb;
}

.upload-area {
  margin-bottom: 16px;
}

.import-preview {
  margin-top: 16px;
}

.import-preview h4 {
  margin-bottom: 12px;
}

.preview-list {
  max-height: 200px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 8px;
}

.preview-item .field-count {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}

.template-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.template-card {
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 12px;
  background: #fff;
}

.template-card:hover {
  border-color: #409eff;
}

.template-card p {
  margin: 8px 0;
  color: #909399;
  font-size: 12px;
}

.template-tags {
  display: flex;
  gap: 8px;
}
</style>
