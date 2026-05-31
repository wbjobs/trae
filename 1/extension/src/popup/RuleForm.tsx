import React, { useState, useEffect } from 'react';
import { Rule, HeaderCondition, HeaderModification, RuleGroup } from '../types';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

interface Props {
  rule: Rule | null;
  groups: RuleGroup[];
  activeGroupId: string;
  onSave: (rule: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const RuleForm: React.FC<Props> = ({ rule, groups, activeGroupId, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [urlPattern, setUrlPattern] = useState('');
  const [methods, setMethods] = useState<string[]>(['GET']);
  const [headerConditions, setHeaderConditions] = useState<HeaderCondition[]>([]);
  const [actionType, setActionType] = useState<'forward' | 'mock'>('forward');
  const [forwardUrl, setForwardUrl] = useState('');
  const [mockStatusCode, setMockStatusCode] = useState(200);
  const [mockHeaders, setMockHeaders] = useState<Record<string, string>>({});
  const [mockBody, setMockBody] = useState('');
  const [requestHeaders, setRequestHeaders] = useState<HeaderModification[]>([]);
  const [responseHeaders, setResponseHeaders] = useState<HeaderModification[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState(0);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setGroupId(rule.groupId || activeGroupId);
      setUrlPattern(rule.urlPattern);
      setMethods(rule.methods);
      setHeaderConditions(rule.headerConditions || []);
      setActionType(rule.actionType);
      setForwardUrl(rule.forwardUrl || '');
      setMockStatusCode(rule.mockStatusCode || 200);
      setMockHeaders(rule.mockHeaders || {});
      setMockBody(rule.mockBody || '');
      setRequestHeaders(rule.requestHeaders || []);
      setResponseHeaders(rule.responseHeaders || []);
      setEnabled(rule.enabled);
      setPriority(rule.priority);
    } else {
      setGroupId(activeGroupId);
    }
  }, [rule, activeGroupId]);

  const toggleMethod = (m: string) => {
    if (methods.includes(m)) {
      setMethods(methods.filter(x => x !== m));
    } else {
      setMethods([...methods, m]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !urlPattern || methods.length === 0) {
      alert('Please fill in required fields');
      return;
    }

    if (actionType === 'forward' && !forwardUrl) {
      alert('Forward URL is required');
      return;
    }

    onSave({
      groupId: groupId || activeGroupId,
      name,
      urlPattern,
      methods,
      headerConditions,
      actionType,
      forwardUrl: actionType === 'forward' ? forwardUrl : undefined,
      mockStatusCode: actionType === 'mock' ? mockStatusCode : undefined,
      mockHeaders: actionType === 'mock' ? mockHeaders : undefined,
      mockBody: actionType === 'mock' ? mockBody : undefined,
      requestHeaders,
      responseHeaders,
      enabled,
      priority,
    });
  };

  const addHeaderCondition = () => {
    setHeaderConditions([...headerConditions, { name: '', value: '', operator: 'equals' }]);
  };

  const updateHeaderCondition = (index: number, field: keyof HeaderCondition, value: string) => {
    const updated = [...headerConditions];
    updated[index] = { ...updated[index], [field]: value } as HeaderCondition;
    setHeaderConditions(updated);
  };

  const removeHeaderCondition = (index: number) => {
    setHeaderConditions(headerConditions.filter((_, i) => i !== index));
  };

  const addReqHeader = () => {
    setRequestHeaders([...requestHeaders, { name: '', value: '', operation: 'set' }]);
  };

  const updateReqHeader = (index: number, field: keyof HeaderModification, value: string) => {
    const updated = [...requestHeaders];
    updated[index] = { ...updated[index], [field]: value } as HeaderModification;
    setRequestHeaders(updated);
  };

  const removeReqHeader = (index: number) => {
    setRequestHeaders(requestHeaders.filter((_, i) => i !== index));
  };

  const addRespHeader = () => {
    setResponseHeaders([...responseHeaders, { name: '', value: '', operation: 'set' }]);
  };

  const updateRespHeader = (index: number, field: keyof HeaderModification, value: string) => {
    const updated = [...responseHeaders];
    updated[index] = { ...updated[index], [field]: value } as HeaderModification;
    setResponseHeaders(updated);
  };

  const removeRespHeader = (index: number) => {
    setResponseHeaders(responseHeaders.filter((_, i) => i !== index));
  };

  const mockHeadersEntries = Object.entries(mockHeaders);
  const updateMockHeader = (key: string, value: string) => {
    setMockHeaders({ ...mockHeaders, [key]: value });
  };
  const addMockHeader = () => {
    setMockHeaders({ ...mockHeaders, '': '' });
  };
  const removeMockHeader = (key: string) => {
    const updated = { ...mockHeaders };
    delete updated[key];
    setMockHeaders(updated);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{rule ? 'Edit Rule' : 'Add Rule'}</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Group</label>
              <select
                className="form-select"
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
              >
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} {group.isActive ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., API Redirect"
              />
            </div>

            <div className="form-group">
              <label className="form-label">URL Pattern *</label>
              <input
                className="form-input"
                value={urlPattern}
                onChange={e => setUrlPattern(e.target.value)}
                placeholder="e.g., *://example.com/api/*"
              />
              <p className="text-xs text-muted mt-4">
                Use Chrome declarativeNetRequest URL filter syntax
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Methods *</label>
              <div className="checkbox-group">
                {HTTP_METHODS.map(m => (
                  <label key={m} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={methods.includes(m)}
                      onChange={() => toggleMethod(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <div className="section-title">Action</div>
            <div className="form-group">
              <select
                className="form-select"
                value={actionType}
                onChange={e => setActionType(e.target.value as 'forward' | 'mock')}
              >
                <option value="forward">Forward to URL</option>
                <option value="mock">Return Mock Response</option>
              </select>
            </div>

            {actionType === 'forward' && (
              <div className="form-group">
                <label className="form-label">Forward URL *</label>
                <input
                  className="form-input"
                  value={forwardUrl}
                  onChange={e => setForwardUrl(e.target.value)}
                  placeholder="e.g., https://localhost:3000/api/mock"
                />
              </div>
            )}

            {actionType === 'mock' && (
              <>
                <div className="form-group">
                  <label className="form-label">Status Code</label>
                  <input
                    type="number"
                    className="form-input"
                    value={mockStatusCode}
                    onChange={e => setMockStatusCode(parseInt(e.target.value) || 200)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Response Headers</label>
                  {mockHeadersEntries.map(([k, v], i) => (
                    <div key={i} className="header-item">
                      <input
                        className="form-input"
                        placeholder="Header name"
                        value={k}
                        onChange={e => {
                          const newHeaders = { ...mockHeaders };
                          delete newHeaders[k];
                          newHeaders[e.target.value] = v;
                          setMockHeaders(newHeaders);
                        }}
                      />
                      <input
                        className="form-input"
                        placeholder="Header value"
                        value={v}
                        onChange={e => updateMockHeader(k, e.target.value)}
                      />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeMockHeader(k)}>
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="add-btn" onClick={addMockHeader}>
                    + Add Header
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">Response Body</label>
                  <textarea
                    className="form-textarea"
                    value={mockBody}
                    onChange={e => setMockBody(e.target.value)}
                    placeholder="Response body content"
                  />
                </div>
              </>
            )}

            <div className="section-title">Header Conditions</div>
            {headerConditions.map((hc, i) => (
              <div key={i} className="header-item">
                <input
                  className="form-input"
                  placeholder="Header name"
                  value={hc.name}
                  onChange={e => updateHeaderCondition(i, 'name', e.target.value)}
                />
                <select
                  className="form-select"
                  value={hc.operator}
                  onChange={e => updateHeaderCondition(i, 'operator', e.target.value)}
                >
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="exists">Exists</option>
                </select>
                {hc.operator !== 'exists' && (
                  <input
                    className="form-input"
                    placeholder="Value"
                    value={hc.value}
                    onChange={e => updateHeaderCondition(i, 'value', e.target.value)}
                  />
                )}
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeHeaderCondition(i)}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={addHeaderCondition}>
              + Add Condition
            </button>

            <div className="section-title">Request Header Modifications</div>
            {requestHeaders.map((h, i) => (
              <div key={i} className="header-item">
                <input
                  className="form-input"
                  placeholder="Header name"
                  value={h.name}
                  onChange={e => updateReqHeader(i, 'name', e.target.value)}
                />
                <select
                  className="form-select"
                  value={h.operation}
                  onChange={e => updateReqHeader(i, 'operation', e.target.value)}
                >
                  <option value="set">Set</option>
                  <option value="remove">Remove</option>
                </select>
                {h.operation === 'set' && (
                  <input
                    className="form-input"
                    placeholder="Value"
                    value={h.value}
                    onChange={e => updateReqHeader(i, 'value', e.target.value)}
                  />
                )}
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeReqHeader(i)}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={addReqHeader}>
              + Add Request Header
            </button>

            <div className="section-title">Response Header Modifications</div>
            {responseHeaders.map((h, i) => (
              <div key={i} className="header-item">
                <input
                  className="form-input"
                  placeholder="Header name"
                  value={h.name}
                  onChange={e => updateRespHeader(i, 'name', e.target.value)}
                />
                <select
                  className="form-select"
                  value={h.operation}
                  onChange={e => updateRespHeader(i, 'operation', e.target.value)}
                >
                  <option value="set">Set</option>
                  <option value="remove">Remove</option>
                </select>
                {h.operation === 'set' && (
                  <input
                    className="form-input"
                    placeholder="Value"
                    value={h.value}
                    onChange={e => updateRespHeader(i, 'value', e.target.value)}
                  />
                )}
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRespHeader(i)}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="add-btn" onClick={addRespHeader}>
              + Add Response Header
            </button>

            <div className="section-title">Options</div>
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Priority (higher = first)</label>
              <input
                type="number"
                className="form-input"
                value={priority}
                onChange={e => setPriority(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RuleForm;
