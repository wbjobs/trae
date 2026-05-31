<template>
  <div class="form-fill">
    <div class="page-header">
      <el-button @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>{{ form?.name }}</h2>
    </div>
    
    <el-card v-loading="loading">
      <el-form
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
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { formApi } from '@/api/form';
import type { Form, FormField } from '@/types';

const route = useRoute();
const router = useRouter();
const formId = computed(() => route.params.id as string);

const formRef = ref<FormInstance>();
const loading = ref(false);
const submitting = ref(false);
const form = ref<Form | null>(null);
const formData = reactive<Record<string, any>>({});
const fieldOptions = reactive<Record<string, { label: string; value: string }[]>>({});

const formRules = computed<FormRules>(() => {
  const rules: FormRules = {};
  form.value?.fields?.forEach((field: FormField) => {
    if (field.required) {
      rules[field.name] = [
        { required: true, message: '请填写' + field.label, trigger: 'blur' },
      ];
    }
  });
  return rules;
});

const visibleFields = computed(() => {
  if (!form.value?.fields) return [];
  return form.value.fields.filter(field => checkFieldVisibility(field));
});

const getFieldOptions = (field: FormField) => {
  if (fieldOptions[field.name]) {
    return fieldOptions[field.name];
  }
  return field.options || [];
};

const evaluateLinkageCondition = (value: any, condition?: { value: any; operator: string }) => {
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

const updateLinkageOptions = () => {
  if (!form.value?.fields) return;
  
  form.value.fields.forEach(field => {
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

const checkFieldVisibility = (field: FormField) => {
  if (!field.linkage?.showWhen) return true;
  const triggerValue = formData[field.linkage.dependsOn];
  return evaluateLinkageCondition(triggerValue, field.linkage.showWhen);
};

const loadForm = async () => {
  loading.value = true;
  try {
    form.value = await formApi.getForm(formId.value);
    if (form.value?.fields) {
      form.value.fields.forEach(field => {
        if (field.linkage) {
          fieldOptions[field.name] = field.linkage.defaultOptions || field.options || [];
        }
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleFileUpload = (fieldName: string, file: any) => {
  formData[fieldName] = file.name;
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true;
      try {
        await formApi.submitForm(formId.value, { data: formData });
        ElMessage.success('提交成功');
        router.back();
      } catch (error) {
        console.error(error);
      } finally {
        submitting.value = false;
      }
    }
  });
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
.form-fill {
  padding: 0;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.fill-form {
  max-width: 600px;
}
</style>
