import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/store/auth';
import router from '@/router';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
});

request.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`;
  }
  return config;
});

request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
      router.push('/login');
      ElMessage.error('登录已过期，请重新登录');
    } else if (error.response?.status === 403) {
      ElMessage.error('没有权限访问该资源');
    } else {
      ElMessage.error(error.response?.data?.message || error.message);
    }
    return Promise.reject(error);
  }
);

export default request;
