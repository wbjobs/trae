import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { loginApi, logoutApi } from '@/api/auth';
import type { User } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));

  const isAuthenticated = computed(() => !!token.value);
  
  const hasPermission = (permission: string) => {
    if (!user.value) return false;
    if (user.value.permissions.includes('*')) return true;
    return user.value.permissions.includes(permission);
  };

  const login = async (username: string, password: string) => {
    const response = await loginApi(username, password);
    token.value = response.token;
    user.value = response.user;
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    return response;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      token.value = null;
      user.value = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  };

  return {
    token,
    user,
    isAuthenticated,
    hasPermission,
    login,
    logout
  };
});
