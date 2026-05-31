import React, { useState, useEffect, useCallback } from 'react';
import { Rule, LogEntry, ExtensionSettings, RuleGroup } from '../types';
import { getSettings, getRules, setRules, clearLocalLogs } from '../utils/storage';
import { ApiClient } from '../utils/api';
import RuleForm from './RuleForm';
import LogsPanel from './LogsPanel';
import GroupSelector from './GroupSelector';
import StatsPanel from './StatsPanel';
import ImportExportButtons from './ImportExportButtons';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rules' | 'logs' | 'stats' | 'groups'>('rules');
  const [settings, setSettingsState] = useState<ExtensionSettings | null>(null);
  const [groups, setGroups] = useState<RuleGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [rules, setRulesState] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setSettingsState(s);

      const api = new ApiClient(s);

      try {
        const groupsData = await api.getGroups();
        setGroups(groupsData);

        const active = groupsData.find(g => g.isActive);
        if (active) {
          setActiveGroupId(active.id);
        } else if (groupsData.length > 0) {
          setActiveGroupId(groupsData[0].id);
        }
      } catch (groupError) {
        console.warn('Failed to load groups:', groupError);
      }

      const r = await getRules();
      setRulesState(r);

      const response = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
      setLogs(response?.logs || []);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'logs') {
      chrome.runtime.sendMessage({ type: 'GET_LOGS' }).then((response) => {
        setLogs(response?.logs || []);
      });
    }
  }, [activeTab]);

  const syncFromBackend = async () => {
    if (!settings) return;
    setSyncing(true);
    try {
      const api = new ApiClient(settings);
      const backendRules = await api.getRules();
      await setRules(backendRules);
      setRulesState(backendRules);
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules: backendRules });

      const groupsData = await api.getGroups();
      setGroups(groupsData);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const toggleRule = async (rule: Rule) => {
    if (!settings) return;
    try {
      const api = new ApiClient(settings);
      const updated = rule.enabled
        ? await api.disableRule(rule.id)
        : await api.enableRule(rule.id);

      const newRules = rules.map(r => (r.id === updated.id ? updated : r));
      setRulesState(newRules);
      await setRules(newRules);
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules: newRules });
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  const deleteRule = async (id: string) => {
    if (!settings) return;
    if (!confirm('Delete this rule?')) return;

    try {
      const api = new ApiClient(settings);
      await api.deleteRule(id);

      const newRules = rules.filter(r => r.id !== id);
      setRulesState(newRules);
      await setRules(newRules);
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules: newRules });
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleSaveRule = async (ruleData: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!settings) return;
    try {
      const api = new ApiClient(settings);
      let saved: Rule;

      const dataWithGroup = {
        ...ruleData,
        groupId: ruleData.groupId || activeGroupId,
      };

      if (editingRule) {
        saved = await api.updateRule(editingRule.id, dataWithGroup);
      } else {
        saved = await api.createRule(dataWithGroup);
      }

      let newRules: Rule[];
      if (editingRule) {
        newRules = rules.map(r => (r.id === saved.id ? saved : r));
      } else {
        newRules = [...rules, saved].sort((a, b) => b.priority - a.priority);
      }

      setRulesState(newRules);
      await setRules(newRules);
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules: newRules });
      setShowForm(false);
      setEditingRule(null);
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const handleClearLogs = async () => {
    if (!settings) return;
    if (!confirm('Clear all logs?')) return;

    try {
      const api = new ApiClient(settings);
      await api.clearLogs();
      await clearLocalLogs();
      setLogs([]);
    } catch (error) {
      console.error('Clear logs error:', error);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  if (loading) {
    return (
      <div className="container">
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Request Router</h1>
        <div className="flex gap-8">
          <button className="btn btn-secondary btn-sm" onClick={syncFromBackend} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={openOptions}>
            Settings
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          Rules ({rules.length})
        </button>
        <button className={`tab ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
          Groups ({groups.length})
        </button>
        <button className={`tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
          Stats
        </button>
        <button className={`tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          Logs ({logs.length})
        </button>
      </div>

      {activeTab === 'rules' && (
        <div>
          {settings && (
            <ImportExportButtons
              settings={settings}
              groups={groups}
              activeGroupId={activeGroupId}
              onImportComplete={setRulesState}
              onSync={syncFromBackend}
            />
          )}

          {groups.length > 0 && (
            <div className="form-group">
              <label className="form-label">Active Group: {groups.find(g => g.id === activeGroupId)?.name}</label>
            </div>
          )}

          <button className="btn btn-primary w-full mb-16" onClick={() => { setEditingRule(null); setShowForm(true); }}>
            + Add Rule
          </button>

          {rules.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p>No rules configured</p>
              <p className="text-xs text-muted mt-8">Click "Add Rule" to create your first rule</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className={`rule-card ${rule.enabled ? '' : 'disabled'}`}>
                <div className="rule-header">
                  <span className="rule-name">{rule.name}</span>
                  <span className="rule-priority">P{rule.priority}</span>
                </div>
                <div className="rule-url">{rule.urlPattern}</div>
                <div className="rule-meta">
                  {rule.methods.map(m => (
                    <span key={m} className="badge badge-method">{m}</span>
                  ))}
                  <span className={`badge badge-action ${rule.actionType}`}>
                    {rule.actionType === 'forward' ? 'Forward' : 'Mock'}
                  </span>
                </div>
                {rule.actionType === 'forward' && rule.forwardUrl && (
                  <div className="text-xs text-muted">→ {rule.forwardUrl}</div>
                )}
                {rule.actionType === 'mock' && (
                  <div className="text-xs text-muted">→ {rule.mockStatusCode} Response</div>
                )}
                <div className="rule-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleRule(rule)}>
                    {rule.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => { setEditingRule(rule); setShowForm(true); }}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteRule(rule.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'groups' && settings && (
        <GroupSelector
          settings={settings}
          groups={groups}
          activeGroupId={activeGroupId}
          onGroupsChange={setGroups}
          onActiveGroupChange={setActiveGroupId}
          onRulesReload={loadData}
        />
      )}

      {activeTab === 'stats' && settings && (
        <StatsPanel settings={settings} />
      )}

      {activeTab === 'logs' && (
        <LogsPanel logs={logs} onClear={handleClearLogs} />
      )}

      {showForm && (
        <RuleForm
          rule={editingRule}
          groups={groups}
          activeGroupId={activeGroupId}
          onSave={handleSaveRule}
          onCancel={() => { setShowForm(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
};

export default App;
