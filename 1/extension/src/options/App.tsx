import React, { useState, useEffect } from 'react';
import { ExtensionSettings, Rule, LogEntry } from '../types';
import { getSettings, setSettings, getRules } from '../utils/storage';
import { ApiClient } from '../utils/api';

const App: React.FC = () => {
  const [settings, setSettingsState] = useState<ExtensionSettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saved, setSaved] = useState(false);
  const [rules, setRulesState] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const s = await getSettings();
    setSettingsState(s);
    const r = await getRules();
    setRulesState(r);
  };

  const handleChange = (field: keyof ExtensionSettings, value: string | boolean | number) => {
    if (!settings) return;
    setSettingsState({ ...settings, [field]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    await setSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnection = async () => {
    if (!settings) return;
    setTesting(true);
    setConnectionStatus('idle');
    try {
      const api = new ApiClient(settings);
      await api.healthCheck();
      setConnectionStatus('success');
    } catch (error) {
      setConnectionStatus('error');
    } finally {
      setTesting(false);
    }
  };

  const syncNow = async () => {
    if (!settings) return;
    try {
      const api = new ApiClient(settings);
      const backendRules = await api.getRules();
      await chrome.storage.local.set({ rules: backendRules });
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules: backendRules });
      setRulesState(backendRules);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Sync error:', error);
    }
  };

  if (!settings) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div className="header">
        <h2>Request Router Settings</h2>
      </div>

      <div className="settings-card">
        <div className="settings-title">Backend Connection</div>

        <div className="form-group">
          <label className="form-label">API URL</label>
          <input
            className="form-input"
            value={settings.apiUrl}
            onChange={e => handleChange('apiUrl', e.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>

        <div className="form-group">
          <label className="form-label">API Key</label>
          <input
            className="form-input"
            value={settings.apiKey}
            onChange={e => handleChange('apiKey', e.target.value)}
            type="password"
          />
        </div>

        <div className="flex gap-8 items-center">
          <button className="btn btn-secondary btn-sm" onClick={testConnection} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {connectionStatus === 'success' && (
            <span className="sync-status connected">Connected</span>
          )}
          {connectionStatus === 'error' && (
            <span className="sync-status disconnected">Connection failed</span>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-title">Sync Settings</div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.autoSync}
              onChange={e => handleChange('autoSync', e.target.checked)}
            />
            Auto-sync rules from backend
          </label>
        </div>

        {settings.autoSync && (
          <div className="form-group">
            <label className="form-label">Sync Interval (ms)</label>
            <input
              type="number"
              className="form-input"
              value={settings.syncInterval}
              onChange={e => handleChange('syncInterval', parseInt(e.target.value) || 30000)}
              min="5000"
              step="1000"
            />
          </div>
        )}

        <div className="flex gap-8">
          <button className="btn btn-primary btn-sm" onClick={syncNow}>
            Sync Now
          </button>
          <span className="text-sm text-muted">
            {rules.length} rules currently loaded
          </span>
        </div>
      </div>

      <div className="settings-card">
        <div className="flex gap-8 items-center">
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
          {saved && (
            <span className="sync-status connected">Settings saved!</span>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-title">About</div>
        <p className="text-sm text-muted">
          Request Router Chrome Extension v1.0.0<br />
          Built with React + TypeScript + Vite
        </p>
        <div className="mt-12 text-sm text-muted">
          <strong>Default API Key:</strong> dev-api-key-12345<br />
          <strong>Default Backend:</strong> http://localhost:3000
        </div>
      </div>
    </div>
  );
};

export default App;
