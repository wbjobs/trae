import { Rule, LogEntry, HeaderModification } from '../types';
import { getSettings, getRules, setRules, addLocalLog, getLocalLogs } from '../utils/storage';
import { ApiClient } from '../utils/api';

interface MockData {
  ruleId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  requestHeaders: HeaderModification[];
  responseHeaders: HeaderModification[];
}

let cachedRules: Rule[] = [];

function resolveDynamicVariables(template: string, request?: chrome.webRequest.WebRequestBodyDetails): string {
  const now = new Date();
  const variables: Record<string, string | number> = {
    '{{timestamp}}': now.getTime(),
    '{{timestamp_ms}}': now.getTime(),
    '{{timestamp_s}}': Math.floor(now.getTime() / 1000),
    '{{iso}}': now.toISOString(),
    '{{date}}': now.toISOString().split('T')[0],
    '{{time}}': now.toTimeString().split(' ')[0],
    '{{random}}': Math.random().toString(36).substring(2, 10),
    '{{random_int}}': Math.floor(Math.random() * 1000000),
    '{{uuid}}': 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }),
  };

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.split(key).join(String(value));
  }

  if (request && request.url) {
    const url = new URL(request.url);
    const urlVars: Record<string, string> = {
      '{{url}}': request.url,
      '{{hostname}}': url.hostname,
      '{{pathname}}': url.pathname,
      '{{protocol}}': url.protocol.replace(':', ''),
      '{{method}}': request.method,
    };
    for (const [key, value] of Object.entries(urlVars)) {
      result = result.split(key).join(value);
    }

    url.searchParams.forEach((value, key) => {
      result = result.split(`{{query:${key}}}`).join(value);
    });
  }

  return result;
}

function parseMockData(data: string): MockData {
  const decoded = decodeURIComponent(atob(data));
  return JSON.parse(decoded);
}

function buildMockRedirectUrl(rule: Rule): string {
  const mockData: MockData = {
    ruleId: rule.id,
    statusCode: rule.mockStatusCode || 200,
    headers: rule.mockHeaders || {},
    body: rule.mockBody || '',
    requestHeaders: rule.requestHeaders || [],
    responseHeaders: rule.responseHeaders || [],
  };
  const encoded = btoa(encodeURIComponent(JSON.stringify(mockData)));
  return `chrome-extension://${chrome.runtime.id}/mock?data=${encoded}`;
}

function buildDnrRules(rules: Rule[]): chrome.declarativeNetRequest.Rule[] {
  const dnrRules: chrome.declarativeNetRequest.Rule[] = [];
  let basePriority = 10000;

  const sortedRules = [...rules]
    .filter(r => r.enabled)
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      if (a.createdAt && b.createdAt) {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return 0;
    });

  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];
    const dnrPriority = basePriority + (sortedRules.length - i);

    const baseRule: chrome.declarativeNetRequest.Rule = {
      id: parseInt(rule.id.split('_')[1]) || Math.floor(Math.random() * 100000),
      priority: dnrPriority,
      condition: {
        urlFilter: rule.urlPattern,
        requestMethods: rule.methods as chrome.declarativeNetRequest.RequestMethod[],
        resourceTypes: ['main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other'],
      },
      action: rule.actionType === 'forward'
        ? {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { url: rule.forwardUrl },
          }
        : {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { url: buildMockRedirectUrl(rule) },
          },
    };

    dnrRules.push(baseRule);
  }

  return dnrRules;
}

async function updateDynamicRules(rules: Rule[]): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map(r => r.id);
  const newRules = buildDnrRules(rules);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules,
  });

  cachedRules = rules;
  console.log(`[Background] Updated ${newRules.length} dynamic rules`);
}

async function syncFromBackend(): Promise<void> {
  try {
    const settings = await getSettings();
    const api = new ApiClient(settings);
    const rules = await api.getRules();
    await setRules(rules);
    await updateDynamicRules(rules);
    console.log(`[Background] Synced ${rules.length} rules from backend`);
  } catch (error) {
    console.error('[Background] Sync error:', error);
  }
}

async function reportLog(logData: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
  const timestamp = new Date().toISOString();
  const log: LogEntry = {
    ...logData,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
  };

  await addLocalLog(log);

  try {
    const settings = await getSettings();
    const api = new ApiClient(settings);
    await api.createLog({ ...logData, timestamp });
  } catch (error) {
    console.warn('[Background] Failed to report log to backend:', error);
  }
}

function findMatchingRule(url: string, method: string): Rule | undefined {
  const sortedRules = [...cachedRules]
    .filter(r => r.enabled)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.createdAt && b.createdAt) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return 0;
    });

  for (const rule of sortedRules) {
    if (!rule.methods.includes(method) && !rule.methods.includes(method.toUpperCase())) continue;

    const urlFilter = rule.urlPattern;
    const regex = new RegExp(
      '^' +
      urlFilter
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$'
    );

    if (regex.test(url) || url.includes(urlFilter.replace(/\*/g, ''))) {
      return rule;
    }
  }
  return undefined;
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;

    if (url.startsWith(`chrome-extension://${chrome.runtime.id}/mock?data=`)) {
      try {
        const urlObj = new URL(url);
        const data = urlObj.searchParams.get('data');
        if (!data) {
          return { cancel: false };
        }

        const mockData = parseMockData(data);
        const rule = cachedRules.find(r => r.id === mockData.ruleId);

        const resolvedBody = resolveDynamicVariables(mockData.body, details);
        const resolvedHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(mockData.headers)) {
          resolvedHeaders[key] = resolveDynamicVariables(value, details);
        }

        const binaryString = unescape(encodeURIComponent(resolvedBody));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const responseHeaders: chrome.webRequest.HttpHeader[] = [
          { name: 'Content-Type', value: resolvedHeaders['Content-Type'] || 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH' },
          { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ];

        for (const [key, value] of Object.entries(resolvedHeaders)) {
          const existing = responseHeaders.find(h => h.name.toLowerCase() === key.toLowerCase());
          if (existing) {
            existing.value = value;
          } else {
            responseHeaders.push({ name: key, value });
          }
        }

        for (const mod of mockData.responseHeaders) {
          if (mod.operation === 'set') {
            const existing = responseHeaders.find(h => h.name.toLowerCase() === mod.name.toLowerCase());
            if (existing) {
              existing.value = resolveDynamicVariables(mod.value, details);
            } else {
              responseHeaders.push({ name: mod.name, value: resolveDynamicVariables(mod.value, details) });
            }
          } else if (mod.operation === 'remove') {
            const idx = responseHeaders.findIndex(h => h.name.toLowerCase() === mod.name.toLowerCase());
            if (idx !== -1) responseHeaders.splice(idx, 1);
          }
        }

        if (rule) {
          reportLog({
            ruleId: rule.id,
            ruleName: rule.name,
            requestUrl: details.initiator || details.url,
            requestMethod: details.method,
            actionType: 'mock',
            status: 'success',
            responseStatusCode: mockData.statusCode,
          });
        }

        return {
          redirectUrl: `data:application/json;base64,${btoa(resolvedBody)}`,
        };
      } catch (error) {
        console.error('[Background] Mock response error:', error);
        return { cancel: false };
      }
    }

    return { cancel: false };
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const responseHeaders = details.responseHeaders || [];
    const modified = [...responseHeaders];

    const hasCors = modified.some(h => h.name.toLowerCase() === 'access-control-allow-origin');
    if (!hasCors) {
      modified.push({ name: 'Access-Control-Allow-Origin', value: '*' });
      modified.push({ name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH' });
      modified.push({ name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' });
    }

    return { responseHeaders: modified };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'responseHeaders']
);

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] Extension installed');
  const rules = await getRules();
  cachedRules = rules;
  await syncFromBackend();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Extension started');
  const rules = await getRules();
  cachedRules = rules;
  await syncFromBackend();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_RULES') {
    syncFromBackend().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'UPDATE_RULES') {
    updateDynamicRules(message.rules).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'GET_LOGS') {
    getLocalLogs().then(logs => sendResponse({ logs }));
    return true;
  }
  if (message.type === 'REPORT_LOG') {
    reportLog(message.log).then(() => sendResponse({ success: true }));
    return true;
  }
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
  const { request, rule } = info;
  const rules = await getRules();
  const matchedRule = rules.find(r =>
    parseInt(r.id.split('_')[1]) === rule.rule_id ||
    rule.rule_priority >= 1000
  );

  if (matchedRule && matchedRule.actionType === 'forward') {
    await reportLog({
      ruleId: matchedRule.id,
      ruleName: matchedRule.name,
      requestUrl: request.url,
      requestMethod: request.method,
      actionType: 'forward',
      status: 'success',
    });
  }

  console.log('[Background] Rule matched:', {
    url: request.url,
    method: request.method,
    ruleId: rule.rule_id,
  });
});

let syncInterval: number | undefined;

async function setupAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  const settings = await getSettings();
  if (settings.autoSync && settings.syncInterval > 0) {
    syncInterval = window.setInterval(() => {
      syncFromBackend();
    }, settings.syncInterval);
    console.log(`[Background] Auto-sync enabled (interval: ${settings.syncInterval}ms)`);
  }
}

setupAutoSync();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    setupAutoSync();
  }
  if (areaName === 'local' && changes.rules) {
    cachedRules = changes.rules.newValue || [];
  }
});
