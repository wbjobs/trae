import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, LoginData, RegisterData } from '@/api/auth';
import { AuthResponse } from '@/types';

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const userInfo = ref<AuthResponse['user'] | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );

  const isLoggedIn = computed(() => !!token.value && !!userInfo.value);
  const isTenantAdmin = computed(() => userInfo.value?.role === 'tenant_admin');

  async function login(data: LoginData) {
    const result = await authApi.login(data);
    token.value = result.accessToken;
    userInfo.value = result.user;
    localStorage.setItem('token', result.accessToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  async function register(data: RegisterData) {
    const result = await authApi.register(data);
    token.value = result.accessToken;
    userInfo.value = result.user;
    localStorage.setItem('token', result.accessToken);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  function logout() {
    token.value = null;
    userInfo.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    isTenantAdmin,
    login,
    register,
    logout,
  };
});
