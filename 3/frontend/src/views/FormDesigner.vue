<template>
  <div class="form-designer">
    <div class="designer-header">
      <div class="header-left">
        <el-button @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-input v-model="formName" placeholder="表单名称" class="name-input" />
      </div>
      <div class="header-right">
        <el-button @click="handleSave" :loading="saving">保存</el-button>
        <el-button type="primary" @click="handlePublish" :loading="publishing">发布</el-button>
      </div>
    </div>
    
    <div class="designer-body">
      <div class="sidebar">
        <h3>字段组件</h3>
        <div class="field-list">
          <div
            v-for="field in availableFields"
            :key="field.type"
            class="field-item"
            draggable="true"
            @dragstart="handleDragStart($event, field)"
          >
            <el-icon><component :is="field.icon" /></el-icon>
            <span>{{ field.label }}</span>
          </div>
        </div>
      </div>
      
      <div class="canvas">
        <div
          class="form-canvas"
          @drop="handleDrop"
          @dragover.prevent
        >
          <div
            v-for="(field, index) in formFields"
            :key="field.id"
            class="field-wrapper"
            @click="selectField(index)"
            :class="{ active: selectedIndex === index }"
          >
            <div class="field-header">
              <span class="field-label">{{ field.label }} {{ field.required ? '*' : '' }}</span>
              <div class="field-actions">
                <el-button size="small" text @click.stop="moveField(index, -1)" :disabled="index === 0">
                  <el-icon><ArrowUp /></el-icon>
                </el-button>
                <el-button size="small" text @click.stop="moveField(index, 1)" :disabled="index === formFields.length - 1">
                  <el-icon><ArrowDown /></el-icon>
                </el-button>
                <el-button size="small" text type="danger" @click.stop="removeField(index)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="field-preview">
              <component
                :is="getPreviewComponent(field.type)"
                :placeholder="field.placeholder"
                :options="field.options"
                :disabled="true"
              />
            </div>
          </div>
          
          <div v-if="formFields.length === 0" class="empty-tip">
            <el-icon><Plus /></el-icon>
            <p>从左侧拖拽字段到此处</p>
          </div>
        </div>
      </div>
      
      <div class="properties-panel" v-if="selectedField">
        <h3>字段属性</h3>
        <el-form label-position="top">
          <el-form-item label="显示名称">
            <el-input v-model="selectedField.label" />
          </el-form-item>
          <el-form-item label="字段名称">
            <el-input v-model="selectedField.name" />
          </el-form-item>
          <el-form-item label="占位符">
            <el-input v-model="selectedField.placeholder" />
          </el-form-item>
          <el-form-item label="是否必填">
            <el-switch v-model="selectedField.required" />
          </el-form-item>
          
          <template v-if="hasOptions(selectedField.type)">
            <el-form-item label="选项">
              <div
                v-for="(opt, idx) in selectedField.options"
                :key="idx"
                class="option-item"
              >
                <el-input v-model="opt.label" placeholder="显示值" size="small" />
                <el-input v-model="opt.value" placeholder="实际值" size="small" />
                <el-button size="small" text type="danger" @click="removeOption(idx)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
              <el-button size="small" @click="addOption">
                <el-icon><Plus /></el-icon>
                添加选项
              </el-button>
            </el-form-item>
          </template>
          
          <template v-if="selectedField.validation">
            <el-form-item label="最小长度">
              <el-input-number v-model="selectedField.validation.minLength" :min="0" />
            </el-form-item>
            <el-form-item label="最大长度">
              <el-input-number v-model="selectedField.validation.maxLength" :min="0" />
            </el-form-item>
          </template>
          
          <template v-if="hasOptions(selectedField.type)">
            <el-divider>联动配置</el-divider>
            <el-form-item label="是否启用联动">
              <el-switch v-model="selectedField.linkage !== undefined" @change="toggleLinkage" />
            </el-form-item>
            
            <template v-if="selectedField.linkage">
              <el-form-item label="触发字段">
                <el-select
                  v-model="selectedField.linkage.dependsOn"
                  placeholder="选择触发字段"
                  style="width: 100%"
                >
                  <el-option
                    v-for="field in otherFields"
                    :key="field.id"
                    :label="field.label"
                    :value="field.name"
                  />
                </el-select>
              </el-form-item>
              
              <el-form-item label="联动选项配置">
                <div class="linkage-options">
                  <div
                    v-for="(opts, value) in selectedField.linkage.optionsMap"
                    :key="value"
                    class="linkage-item"
                  >
                    <div class="linkage-value">
                      <el-input
                        v-model="linkageOptionKeys[value] || value"
                        @blur="updateLinkageKey(value, linkageOptionKeys[value] || value)"
                        placeholder="触发值"
                        size="small"
                        style="width: 120px"
                      />
                      <span class="arrow">→</span>
                      <el-tag closable @close="removeLinkageOptions(value)">
                        {{ opts.length }} 个选项
                      </el-tag>
                      <el-button
                        size="small"
                        type="primary"
                        @click="editLinkageOptions(value, opts)"
                      >
                        编辑
                      </el-button>
                    </div>
                  </div>
                  <el-button size="small" @click="addLinkageOptions">
                    <el-icon><Plus /></el-icon>
                    添加触发值
                  </el-button>
                </div>
              </el-form-item>
            </template>
          </template>
        </el-form>
      </div>
    </div>
    
    <el-dialog
      v-model="linkageEditorVisible"
      :title="'编辑触发值为 \"' + (currentEditingKey || '') + '\" 的选项'"
      width="500px"
    >
      <div class="linkage-editor">
        <div
          v-for="(opt, idx) in editingLinkageOptions"
          :key="idx"
          class="option-row"
        >
          <el-input v-model="opt.label" placeholder="显示值" size="small" />
          <el-input v-model="opt.value" placeholder="实际值" size="small" />
          <el-button size="small" text type="danger" @click="removeLinkageOption(idx)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-button size="small" @click="addLinkageOption" style="margin-top: 12px;">
          <el-icon><Plus /></el-icon>
          添加选项
        </el-button>
      </div>
      <template #footer>
        <el-button @click="linkageEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveLinkageOptions">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { formApi } from '@/api/form';
import type { FormField } from '@/types';

const route = useRoute();
const router = useRouter();

const formId = computed(() => route.params.id as string);
const isEdit = computed(() => !!formId.value);

const formName = ref('未命名表单');
const formFields = ref<FormField[]>([]);
const selectedIndex = ref<number | null>(null);
const saving = ref(false);
const publishing = ref(false);

const availableFields = [
  { type: 'text', label: '文本框', icon: 'Edit' },
  { type: 'textarea', label: '多行文本', icon: 'Document' },
  { type: 'number', label: '数字', icon: 'Calculator' },
  { type: 'select', label: '下拉选择', icon: 'ArrowDown' },
  { type: 'radio', label: '单选框', icon: 'Radio' },
  { type: 'checkbox', label: '多选框', icon: 'Check' },
  { type: 'date', label: '日期选择', icon: 'Calendar' },
  { type: 'file', label: '文件上传', icon: 'UploadFilled' },
];

const selectedField = computed(() => {
  if (selectedIndex.value !== null && formFields.value[selectedIndex.value]) {
    return formFields.value[selectedIndex.value];
  }
  return null;
});

const otherFields = computed(() => {
  if (selectedIndex.value === null) return [];
  return formFields.value.filter((_, i) => i !== selectedIndex.value);
});

const linkageOptionKeys = reactive<Record<string, string>>({});
const linkageEditorVisible = ref(false);
const currentEditingKey = ref<string>('');
const editingLinkageValue = ref<string | null>(null);
const editingLinkageOptions = ref<{ label: string; value: string }[]>([]);

const getPreviewComponent = (type: string) => {
  const components: Record<string, string> = {
    text: 'el-input',
    textarea: 'el-input',
    number: 'el-input-number',
    select: 'el-select',
    radio: 'el-radio-group',
    checkbox: 'el-checkbox-group',
    date: 'el-date-picker',
    file: 'el-upload',
  };
  return components[type] || 'el-input';
};

const hasOptions = (type: string) => {
  return ['select', 'radio', 'checkbox'].includes(type);
};

const generateId = () => {
  return 'field_' + Math.random().toString(36).substr(2, 9);
};

const handleDragStart = (event: DragEvent, field: typeof availableFields[0]) => {
  event.dataTransfer?.setData('fieldType', field.type);
  event.dataTransfer?.setData('fieldLabel', field.label);
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  const type = event.dataTransfer?.getData('fieldType') as FormField['type'];
  const label = event.dataTransfer?.getData('fieldLabel') || '新字段';
  
  if (type) {
    const newField: FormField = {
      id: generateId(),
      type,
      label,
      name: 'field_' + Date.now(),
      required: false,
      validation: {},
    };
    
    if (hasOptions(type)) {
      newField.options = [
        { label: '选项1', value: 'option1' },
        { label: '选项2', value: 'option2' },
      ];
    }
    
    formFields.value.push(newField);
    selectedIndex.value = formFields.value.length - 1;
  }
};

const selectField = (index: number) => {
  selectedIndex.value = index;
};

const moveField = (index: number, direction: number) => {
  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < formFields.value.length) {
    const temp = formFields.value[index];
    formFields.value[index] = formFields.value[newIndex];
    formFields.value[newIndex] = temp;
    selectedIndex.value = newIndex;
  }
};

const removeField = (index: number) => {
  formFields.value.splice(index, 1);
  if (selectedIndex.value === index) {
    selectedIndex.value = null;
  } else if (selectedIndex.value !== null && selectedIndex.value > index) {
    selectedIndex.value--;
  }
};

const addOption = () => {
  if (selectedField.value && selectedField.value.options) {
    const idx = selectedField.value.options.length + 1;
    selectedField.value.options.push({
      label: `选项${idx}`,
      value: `option${idx}`,
    });
  }
};

const removeOption = (index: number) => {
  if (selectedField.value && selectedField.value.options) {
    selectedField.value.options.splice(index, 1);
  }
};

const toggleLinkage = (enabled: boolean) => {
  if (!selectedField.value) return;
  
  if (enabled) {
    selectedField.value.linkage = {
      dependsOn: '',
      optionsMap: {},
      defaultOptions: [...(selectedField.value.options || [])],
    };
  } else {
    delete selectedField.value.linkage;
  }
};

const addLinkageOptions = () => {
  if (!selectedField.value?.linkage) return;
  
  const key = `value_${Date.now()}`;
  if (!selectedField.value.linkage.optionsMap) {
    selectedField.value.linkage.optionsMap = {};
  }
  selectedField.value.linkage.optionsMap[key] = [...(selectedField.value.options || [])];
  linkageOptionKeys[key] = key;
};

const removeLinkageOptions = (key: string) => {
  if (!selectedField.value?.linkage?.optionsMap) return;
  delete selectedField.value.linkage.optionsMap[key];
  delete linkageOptionKeys[key];
};

const updateLinkageKey = (oldKey: string, newKey: string) => {
  if (!selectedField.value?.linkage?.optionsMap || oldKey === newKey) return;
  
  selectedField.value.linkage.optionsMap[newKey] = selectedField.value.linkage.optionsMap[oldKey];
  delete selectedField.value.linkage.optionsMap[oldKey];
  delete linkageOptionKeys[oldKey];
};

const editLinkageOptions = (key: string, opts: { label: string; value: string }[]) => {
  currentEditingKey.value = key;
  editingLinkageValue.value = key;
  editingLinkageOptions.value = JSON.parse(JSON.stringify(opts));
  linkageEditorVisible.value = true;
};

const saveLinkageOptions = () => {
  if (!selectedField.value?.linkage?.optionsMap || !editingLinkageValue.value) return;
  
  selectedField.value.linkage.optionsMap[editingLinkageValue.value] = 
    JSON.parse(JSON.stringify(editingLinkageOptions.value);
  editingLinkageValue.value = null;
  currentEditingKey.value = '';
  linkageEditorVisible.value = false;
};

const addLinkageOption = () => {
  const idx = editingLinkageOptions.value.length + 1;
  editingLinkageOptions.value.push({
    label: `选项${idx}`,
    value: `option${idx}`,
  });
};

const removeLinkageOption = (index: number) => {
  editingLinkageOptions.value.splice(index, 1);
};

const handleSave = async () => {
  if (!formName.value.trim()) {
    ElMessage.warning('请输入表单名称');
    return;
  }
  
  saving.value = true;
  try {
    const data = {
      name: formName.value,
      fields: formFields.value,
      layout: { columns: 1, spacing: 16 },
    };
    
    if (isEdit.value) {
      await formApi.updateForm(formId.value, data);
      ElMessage.success('保存成功');
    } else {
      const result = await formApi.createForm(data);
      ElMessage.success('保存成功');
      router.replace(`/forms/${result.id}/edit`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    saving.value = false;
  }
};

const handlePublish = async () => {
  await handleSave();
  
  if (formFields.value.length === 0) {
    ElMessage.warning('至少需要一个字段才能发布');
    return;
  }
  
  publishing.value = true;
  try {
    if (isEdit.value) {
      await formApi.publishForm(formId.value);
      ElMessage.success('发布成功');
    }
  } catch (error) {
    console.error(error);
  } finally {
    publishing.value = false;
  }
};

const loadForm = async () => {
  if (isEdit.value) {
    try {
      const form = await formApi.getForm(formId.value);
      formName.value = form.name;
      formFields.value = form.fields || [];
    } catch (error) {
      console.error(error);
    }
  }
};

onMounted(() => {
  loadForm();
});
</script>

<style scoped>
.form-designer {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
}

.designer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.name-input {
  width: 300px;
}

.designer-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  background: white;
  border-right: 1px solid #e4e7ed;
  padding: 16px;
  overflow-y: auto;
}

.sidebar h3 {
  margin: 0 0 16px;
  font-size: 14px;
  color: #333;
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  cursor: grab;
  transition: all 0.2s;
}

.field-item:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.canvas {
  flex: 1;
  padding: 24px;
  background: #f0f2f5;
  overflow-y: auto;
}

.form-canvas {
  min-height: 100%;
  background: white;
  border-radius: 8px;
  padding: 24px;
  border: 2px dashed #dcdfe6;
}

.field-wrapper {
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.field-wrapper:hover {
  border-color: #409eff;
}

.field-wrapper.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.field-label {
  font-weight: 500;
  color: #333;
}

.field-actions {
  display: flex;
  gap: 4px;
}

.field-preview {
  opacity: 0.7;
}

.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #909399;
}

.empty-tip .el-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.properties-panel {
  width: 300px;
  background: white;
  border-left: 1px solid #e4e7ed;
  padding: 16px;
  overflow-y: auto;
}

.properties-panel h3 {
  margin: 0 0 16px;
  font-size: 14px;
  color: #333;
}

.option-item {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
