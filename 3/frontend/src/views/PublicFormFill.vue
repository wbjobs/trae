<template>
  <div class="public-form">
    <div class="form-container" v-loading="loading">
      <div class="form-header" v-if="form">
        <h1>{{ form.name }}</h1>
        <p v-if="form.description" class="form-description">{{ form.description }}</p>
      </div>
      
      <el-form
        v-if="form && !submitted"
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-position="top"
        class="fill-form"
      >
        <template v-for="field in visibleFields" :key="field.id">
          <el-form-item
            :label="field.label + (field.required ? ' *' : '')"
            :prop="field.name"
          >
            <template v-if="field.type === 'text'">
              <el-input
                v-model="formData[field.name]"
                :placeholder="field.placeholder"
              />
            </template>
            
            <template v-else-if="field.type === 'textarea'">
              <el-input
                v-model="formData[field.name]"
                type="textarea"
                :rows="4"
                :placeholder="field.placeholder"
              />
            </template>
            
            <template v-else-if="field.type === 'number'">
              <el-input-number
                v-model="formData[field.name]"
                style="width: 100%"
              />
            </template>
            
            <template v-else-if="field.type === 'select'">
              <el-select
                v-model="formData[field.name]"
                :placeholder="field.placeholder"
                style="width: 100%"
                clearable
              >
                <el-option
                  v-for="opt in getFieldOptions(field)"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </template>
            
            <template v-else-if="field.type === 'radio'">
              <el-radio-group v-model="formData[field.name]">
                <el-radio
                  v-for="opt in getFieldOptions(field)"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </el-radio>
              </el-radio-group>
            </template>
            
            <template v-else-if="field.type === 'checkbox'">
              <el-checkbox-group v-model="formData[field.name]">
                <el-checkbox
                  v-for="opt in getFieldOptions(field)"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </el-checkbox>
              </el-checkbox-group>
            </template>
            
            <template v-else-if="field.type === 'date'">
              <el-date-picker
                v-model="formData[field.name]"
                type="date"
                :placeholder="field.placeholder"
                style="width: 100%"
              />
            </template>
            
            <template v-else-if="field.type === 'file'">
              <el-upload
                action="#"
                :auto-upload="false"
                :on-change="(file) => handleFileUpload(field.name, file)"
              >
                <el-button type="primary">
                  <el-icon><UploadFilled /></el-icon>
                  上传文件
                </el-button>
              </el-upload>
            </template>
          </el-form-item>
        </template>
        
        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="submitting">
            提交
          </el-button>
        </el-form-item>
      </el-form>
      
      <div v-if="submitted" class="success-message">
        <el-icon class="success-icon"><CircleCheckFilled /></el-icon>
        <h3>提交成功</h3>
        <p>感谢您的提交</p>
        <el-button type="primary" @click="resetForm">再填一份</el-button>
      </div>
      
      <div v-if="error" class="error-message">
        <el-icon class="error-icon"><CircleCloseFilled /></el-icon>
        <h3>{{ error }}</h3>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import axios from 'axios';

const route = useRoute();
const token = computed(() => route.params.token as string);

const API_BASE = '/api';

const loading = ref(false);
const submitting = ref(false);
const submitted = ref(false);
const error = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = ref<any>(null);
const formData = reactive<Record<string, any>>({});
const fieldOptions = reactive<Record<string, { label: string; value: string }[]>>({});

const visibleFields = computed(() => {
  if (!form?.fields) return [];
  return form.fields.filter((field: any) => checkFieldVisibility(field));
});

const formRules = computed<FormRules>(() => {
  const rules: FormRules = {};
  form?.fields?.forEach((field: any) => {
    if (field.required) {
      rules[field.name] = [
        { required: true, message: '请填写' + field.label, trigger: 'blur' },
      ];
    }
  });
  return rules;
});

const checkFieldVisibility = (field: any) => {
  if (!field.linkage?.showWhen) return true;
  const triggerValue = formData[field.linkage.dependsOn];
  return evaluateCondition(triggerValue, field.linkage.showWhen);
};

const evaluateCondition = (value: any, condition?: { value: any; operator: string }) => {
  if (!condition) return true;
  
  switch (condition.operator) {
    case 'eq':
      return String(value) === String(condition.value);
    case 'neq':
      return String(value) !== String(condition.value);
    case 'contains':
      return String(value).includes(String(condition.value));
    default:
      return true;
  }
};

const getFieldOptions = (field: any) => {
  if (fieldOptions[field.name]) {
    return fieldOptions[field.name];
  }
  return field.options || [];
};

const updateLinkageOptions = () => {
  if (!form?.fields) return;
  
  form.fields.forEach((field: any) => {
    if (field.linkage) {
      const triggerValue = formData[field.linkage.dependsOn];
      let options = field.options || [];
      
      if (field.linkage.optionsMap && triggerValue !== undefined && triggerValue !== null) {
        const key = String(triggerValue);
        if (field.linkage.optionsMap[key]) {
          options = field.linkage.optionsMap[key];
        } else if (field.linkage.defaultOptions) {
          options = field.linkage.defaultOptions;
        }
      } else if (field.linkage.defaultOptions) {
        options = field.linkage.defaultOptions;
      }
      
      fieldOptions[field.name] = options;
    }
  });
};

const handleFileUpload = (fieldName: string, file: any) => {
  formData[fieldName] = file.name;
};

const loadForm = async () => {
  if (!token.value) return;
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await axios.get(`${API_BASE}/public/forms/token/${token.value}`);
    form.value = response.data;
    
    if (form.value?.fields) {
      form.value.fields.forEach((field: any) => {
        if (field.linkage?.defaultOptions) {
          fieldOptions[field.name] = field.linkage.defaultOptions;
        }
      });
    }
  } catch (err: any) {
    console.error(err);
    error.value = err.response?.data?.message || '表单不存在或已过期';
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true;
      
      try {
        await axios.post(`${API_BASE}/public/forms/token/${token.value}/submit`, {
          data: formData,
        });
        submitted.value = true;
      } catch (err: any) {
        ElMessage.error(err.response?.data?.message || '提交失败，请稍后重试');
      } finally {
        submitting.value = false;
      }
    }
  });
};

const resetForm = () => {
  submitted.value = false;
  Object.keys(formData).forEach(key => {
    delete formData[key];
  });
  formRef.value?.resetFields();
};

watch(
  () => ({ ...formData }),
  () => {
    updateLinkageOptions();
  },
  { deep: true }
);

onMounted(() => {
  loadForm();
});
</script>

<style scoped>
.public-form {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.form-container {
  width: 100%;
  max-width: 600px;
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.form-header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid #ebeef5;
}

.form-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.form-description {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.fill-form {
  margin-top: 24px;
}

.success-message,
.error-message {
  text-align: center;
  padding: 40px 20px;
}

.success-icon {
  font-size: 64px;
  color: #67c23a;
}

.error-icon {
  font-size: 64px;
  color: #f56c6c;
}

.success-message h3,
.error-message h3 {
  margin: 16px 0 8px;
  font-size: 20px;
  font-weight: 600;
}

.success-message p,
.error-message p {
  margin: 0 0 24px;
  color: #909399;
}
</style>
