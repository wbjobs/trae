import { useState } from 'react';
import { useAppStore } from './store';
import LoginPage from './pages/LoginPage';
import MainLayout from './layouts/MainLayout';
import './App.css';

export default function App() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const isInitializing = useAppStore((state) => state.isInitializing);
  const [mode, setMode] = useState<'unlock' | 'create'>('unlock');

  return (
    <div className="app">
      {isAuthenticated ? (
        <MainLayout />
      ) : (
        <LoginPage mode={mode} onModeChange={setMode} />
      )}
    </div>
  );
}
