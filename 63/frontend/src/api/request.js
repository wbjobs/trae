import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
});

request.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

request.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.success === false) {
      ElMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message || '请求失败'));
    }
    return res;
  },
  (error) => {
    const message = error.response?.data?.message || error.message || '网络错误';
    ElMessage.error(message);
    return Promise.reject(error);
  }
);

export default request;
