import { ExtensionSettings, Rule, LogEntry } from '../types';

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiUrl: 'http://localhost:3000',
  apiKey: 'dev-api-key-12345',
  autoSync: true,
  syncInterval: 30000,
};

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

export async function setSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...settings } });
}

export async function getRules(): Promise<Rule[]> {
  const result = await chrome.storage.local.get('rules');
  return result.rules || [];
}

export async function setRules(rules: Rule[]): Promise<void> {
  await chrome.storage.local.set({ rules });
}

export async function getLocalLogs(): Promise<LogEntry[]> {
  const result = await chrome.storage.local.get('logs');
  return result.logs || [];
}

export async function addLocalLog(log: LogEntry): Promise<void> {
  const logs = await getLocalLogs();
  logs.unshift(log);
  const trimmed = logs.slice(0, 100);
  await chrome.storage.local.set({ logs: trimmed });
}

export async function clearLocalLogs(): Promise<void> {
  await chrome.storage.local.remove('logs');
}
