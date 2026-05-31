import { create } from 'zustand';
import type { PasswordListItem, PasswordAnalysis, ServerStatus } from '../types';

interface AppState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  passwords: PasswordListItem[];
  selectedPassword: PasswordListItem | null;
  searchQuery: string;
  analysis: PasswordAnalysis | null;
  serverStatus: ServerStatus;
  loading: boolean;
  error: string | null;

  setAuthenticated: (value: boolean) => void;
  setInitializing: (value: boolean) => void;
  setPasswords: (passwords: PasswordListItem[]) => void;
  setSelectedPassword: (password: PasswordListItem | null) => void;
  setSearchQuery: (query: string) => void;
  setAnalysis: (analysis: PasswordAnalysis | null) => void;
  setServerStatus: (status: ServerStatus) => void;
  setLoading: (value: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  isInitializing: false,
  passwords: [],
  selectedPassword: null,
  searchQuery: '',
  analysis: null,
  serverStatus: { running: false },
  loading: false,
  error: null,

  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setInitializing: (value) => set({ isInitializing: value }),
  setPasswords: (passwords) => set({ passwords }),
  setSelectedPassword: (password) => set({ selectedPassword: password }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setAnalysis: (analysis) => set({ analysis }),
  setServerStatus: (status) => set({ serverStatus: status }),
  setLoading: (value) => set({ loading: value }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      isAuthenticated: false,
      isInitializing: false,
      passwords: [],
      selectedPassword: null,
      searchQuery: '',
      analysis: null,
      serverStatus: { running: false },
      loading: false,
      error: null,
    }),
}));
