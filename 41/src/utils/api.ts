import { Form, FormComponent, Rule, ConditionGroup, RuleAction } from '../types';

const API_BASE = '/api';

export const formApi = {
  getAll: async (): Promise<Form[]> => {
    const res = await fetch(`${API_BASE}/forms`);
    return res.json();
  },
  
  getById: async (id: string): Promise<Form> => {
    const res = await fetch(`${API_BASE}/forms/${id}`);
    return res.json();
  },
  
  create: async (name: string, config: FormComponent[]): Promise<Form> => {
    const res = await fetch(`${API_BASE}/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config }),
    });
    return res.json();
  },
  
  update: async (id: string, name: string, config: FormComponent[]): Promise<Form> => {
    const res = await fetch(`${API_BASE}/forms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config }),
    });
    return res.json();
  },
  
  delete: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/forms/${id}`, { method: 'DELETE' });
  },
};

export const ruleApi = {
  getByFormId: async (formId: string): Promise<Rule[]> => {
    const res = await fetch(`${API_BASE}/forms/${formId}/rules`);
    return res.json();
  },
  
  create: async (formId: string, name: string, conditions: ConditionGroup, actions: RuleAction[]): Promise<Rule> => {
    const res = await fetch(`${API_BASE}/forms/${formId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, conditions, actions }),
    });
    return res.json();
  },
  
  update: async (id: string, name: string, conditions: ConditionGroup, actions: RuleAction[]): Promise<Rule> => {
    const res = await fetch(`${API_BASE}/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, conditions, actions }),
    });
    return res.json();
  },
  
  delete: async (id: string): Promise<void> => {
    await fetch(`${API_BASE}/rules/${id}`, { method: 'DELETE' });
  },
};

export const submissionApi = {
  submit: async (formId: string, data: Record<string, unknown>, debugMode: boolean = false): Promise<{ submission: unknown; effects: Record<string, { hidden?: boolean; disabled?: boolean }> }> => {
    const res = await fetch(`${API_BASE}/forms/${formId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, debugMode }),
    });
    return res.json();
  },
  
  getByFormId: async (formId: string): Promise<unknown[]> => {
    const res = await fetch(`${API_BASE}/forms/${formId}/submissions`);
    return res.json();
  },
};

export interface DebugLog {
  id: string;
  formId: string;
  ruleId: string;
  ruleName: string;
  conditionResult: boolean;
  conditionsEvaluated: string;
  actionsExecuted: string;
  executionTime: number;
  timestamp: string;
  formData: Record<string, unknown>;
}

export const debugApi = {
  getLogs: async (formId?: string, ruleId?: string, limit: number = 50): Promise<DebugLog[]> => {
    const params = new URLSearchParams();
    if (formId) params.set('formId', formId);
    if (ruleId) params.set('ruleId', ruleId);
    params.set('limit', String(limit));
    
    const res = await fetch(`${API_BASE}/debug/logs?${params}`);
    return res.json();
  },
  
  getLog: async (id: string): Promise<DebugLog> => {
    const res = await fetch(`${API_BASE}/debug/logs/${id}`);
    return res.json();
  },
  
  clearLogs: async (formId?: string): Promise<void> => {
    const params = new URLSearchParams();
    if (formId) params.set('formId', formId);
    
    await fetch(`${API_BASE}/debug/logs?${params}`, { method: 'DELETE' });
  },
};