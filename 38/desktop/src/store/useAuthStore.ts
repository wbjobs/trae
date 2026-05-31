import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';
import * as api from '@/services/api';

interface AuthState {
  token: string | null;
  user: User | null;
  serverAddress: string;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setServerAddress: (address: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      serverAddress: 'http://localhost:50051',
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        const response = await api.login(username, password);
        set({
          token: response.token,
          user: response.user,
          isAuthenticated: true,
        });
        api.setAuthToken(response.token);
      },

      logout: async () => {
        try {
          await api.logout();
        } catch (e) {
        }
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        });
        api.setAuthToken(null);
      },

      setServerAddress: (address: string) => {
        set({ serverAddress: address });
        api.setBaseUrl(address);
      },
    }),
    {
      name: 'nfc-access-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        serverAddress: state.serverAddress,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.setAuthToken(state.token);
        }
        if (state?.serverAddress) {
          api.setBaseUrl(state.serverAddress);
        }
      },
    }
  )
);
