<template>
  <div class="notifications">
    <div class="page-header">
      <h2>通知中心</h2>
      <el-button @click="markAllRead" :disabled="!hasUnread">
        <el-icon><Check /></el-icon>
        全部已读
      </el-button>
    </div>
    
    <el-card v-loading="loading">
      <el-empty v-if="notifications.length === 0" description="暂无通知" />
      
      <div v-else class="notification-list">
        <div
          v-for="item in notifications"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.isRead }"
          @click="handleClick(item)"
        >
          <div class="item-header">
            <el-tag :type="getTypeClass(item.type)" size="small">
              {{ getTypeLabel(item.type) }}
            </el-tag>
            <span class="item-time">{{ formatTime(item.createdAt) }}</span>
          </div>
          <h4 class="item-title">{{ item.title }}</h4>
          <p class="item-content">{{ item.content }}</p>
        </div>
      </div>
      
      <el-pagination
        v-if="total > 0"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 20px; justify-content: flex-end"
        @size-change="loadNotifications"
        @current-change="loadNotifications"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { notificationApi } from '@/api/notification';
import type { Notification } from '@/types';

const loading = ref(false);
const notifications = ref<Notification[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const hasUnread = computed(() => notifications.value.some(n => !n.isRead));

const getTypeClass = (type: string) => {
  const classes: Record<string, string> = {
    approval: 'primary',
    system: 'info',
    warning: 'warning',
    success: 'success',
  };
  return classes[type] || 'info';
};

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    approval: '审批',
    system: '系统',
    warning: '警告',
    success: '成功',
  };
  return labels[type] || type;
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  
  return date.toLocaleString('zh-CN');
};

const loadNotifications = async () => {
  loading.value = true;
  try {
    const result = await notificationApi.getNotifications({
      page: page.value,
      pageSize: pageSize.value,
    });
    notifications.value = result.items;
    total.value = result.total;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const markAllRead = async () => {
  try {
    await notificationApi.markAllRead();
    ElMessage.success('已全部标记为已读');
    loadNotifications();
  } catch (error) {
    console.error(error);
  }
};

const handleClick = async (item: Notification) => {
  if (!item.isRead) {
    try {
      await notificationApi.markAsRead(item.id);
      item.isRead = true;
    } catch (error) {
      console.error(error);
    }
  }
};

onMounted(() => {
  loadNotifications();
});
</script>

<style scoped>
.notifications {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notification-item {
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.notification-item:hover {
  border-color: #409eff;
}

.notification-item.unread {
  background: #ecf5ff;
  border-color: #93c5fd;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.item-time {
  color: #909399;
  font-size: 12px;
}

.item-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: #333;
}

.item-content {
  margin: 0;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}
</style>
