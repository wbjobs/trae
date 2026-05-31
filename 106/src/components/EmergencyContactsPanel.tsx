import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Shield,
  Clock,
  Copy,
  Check,
  AlertTriangle,
  UserPlus,
  Key,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { useAppStore } from '../store';
import {
  setupEmergencyContacts,
  getEmergencyConfig,
  disableEmergencyContacts,
  requestRecovery,
  getRecoveryRequests,
  approveRecoveryRequest,
  getRecoveryStatus,
  clearRecoveryRequests,
} from '../services/api';
import type {
  EmergencyConfig,
  EmergencyContactInput,
  RecoveryRequest as RecoveryRequestType,
  RecoveryStatus,
} from '../types';
import './EmergencyContactsPanel.css';

interface EmergencyContactsPanelProps {
  onBack: () => void;
}

export function EmergencyContactsPanel({ onBack }: EmergencyContactsPanelProps) {
  const [config, setConfig] = useState<EmergencyConfig | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContactInput[]>([
    { name: '', email: '', phone: '' },
    { name: '', email: '', phone: '' },
    { name: '', email: '', phone: '' },
  ]);
  const [threshold, setThreshold] = useState(2);
  const [waitingPeriod, setWaitingPeriod] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedShare, setCopiedShare] = useState<string | null>(null);
  const [showShares, setShowShares] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'config' | 'recovery'>('config');
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequestType[]>([]);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'recovery') {
      loadRecoveryData();
    }
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      const data = await getEmergencyConfig();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load emergency config:', err);
    }
  };

  const loadRecoveryData = async () => {
    try {
      const [requests, status] = await Promise.all([
        getRecoveryRequests(),
        getRecoveryStatus(),
      ]);
      setRecoveryRequests(requests);
      setRecoveryStatus(status);
    } catch (err) {
      console.error('Failed to load recovery data:', err);
    }
  };

  const handleAddContact = () => {
    if (contacts.length < 5) {
      setContacts([...contacts, { name: '', email: '', phone: '' }]);
    }
  };

  const handleRemoveContact = (index: number) => {
    if (contacts.length > 3) {
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  const handleContactChange = (index: number, field: keyof EmergencyContactInput, value: string) => {
    const newContacts = [...contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setContacts(newContacts);
  };

  const handleSetup = async () => {
    const validContacts = contacts.filter((c) => c.name.trim() && c.email.trim());
    if (validContacts.length < 3) {
      setError('至少需要 3 个有效的紧急联系人');
      return;
    }

    if (threshold < 2 || threshold > validContacts.length) {
      setError(`阈值必须在 2 到 ${validContacts.length} 之间`);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await setupEmergencyContacts({
        contacts: validContacts,
        threshold,
        waiting_period_days: waitingPeriod,
      });
      setConfig(result);
      setShowSetup(false);
      setContacts([
        { name: '', email: '', phone: '' },
        { name: '', email: '', phone: '' },
        { name: '', email: '', phone: '' },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShare = async (share: string, contactId: string) => {
    await navigator.clipboard.writeText(share);
    setCopiedShare(contactId);
    setTimeout(() => setCopiedShare(null), 2000);
  };

  const toggleShareVisibility = (contactId: string) => {
    setShowShares((prev) => ({ ...prev, [contactId]: !prev[contactId] }));
  };

  const handleDisable = async () => {
    if (confirm('确定要禁用紧急联系人功能吗？所有联系人将被删除。')) {
      try {
        await disableEmergencyContacts();
        setConfig(null);
      } catch (err) {
        console.error('Failed to disable emergency contacts:', err);
      }
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      await approveRecoveryRequest(requestId);
      loadRecoveryData();
    } catch (err) {
      console.error('Failed to approve request:', err);
    }
  };

  const handleClearRequests = async () => {
    if (confirm('确定要清除所有恢复请求吗？')) {
      try {
        await clearRecoveryRequests();
        loadRecoveryData();
      } catch (err) {
        console.error('Failed to clear requests:', err);
      }
    }
  };

  return (
    <div className="emergency-panel">
      <div className="emergency-header">
        <button className="back-btn" onClick={onBack}>
          ← 返回
        </button>
        <h2>紧急联系人</h2>
      </div>

      <div className="emergency-tabs">
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Shield size={18} />
          配置
        </button>
        <button
          className={`tab ${activeTab === 'recovery' ? 'active' : ''}`}
          onClick={() => setActiveTab('recovery')}
        >
          <Key size={18} />
          恢复
        </button>
      </div>

      {activeTab === 'config' && (
        <div className="emergency-content">
          {!config && !showSetup && (
            <div className="empty-config">
              <div className="config-icon">
                <Users size={48} />
              </div>
              <h3>设置紧急联系人</h3>
              <p>
                指定 3-5 个可信任的紧急联系人，使用 Shamir 秘密共享技术保护您的数据。
                在您失联超过等待期后，他们可以共同恢复您的密码库。
              </p>
              <button className="setup-btn" onClick={() => setShowSetup(true)}>
                <UserPlus size={20} />
                设置紧急联系人
              </button>
            </div>
          )}

          {!config && showSetup && (
            <div className="setup-form">
              <h3>设置紧急联系人</h3>

              <div className="form-section">
                <h4>紧急联系人 ({contacts.length}/5)</h4>
                {contacts.map((contact, index) => (
                  <div key={index} className="contact-input-group">
                    <div className="contact-number">{index + 1}</div>
                    <input
                      type="text"
                      placeholder="姓名"
                      value={contact.name}
                      onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                    />
                    <input
                      type="email"
                      placeholder="邮箱"
                      value={contact.email}
                      onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                    />
                    <input
                      type="tel"
                      placeholder="电话 (可选)"
                      value={contact.phone || ''}
                      onChange={(e) => handleContactChange(index, 'phone', e.target.value)}
                    />
                    {contacts.length > 3 && (
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveContact(index)}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
                {contacts.length < 5 && (
                  <button className="add-contact-btn" onClick={handleAddContact}>
                    <Plus size={18} />
                    添加联系人
                  </button>
                )}
              </div>

              <div className="form-section">
                <h4>恢复设置</h4>
                <div className="threshold-input">
                  <label>
                    恢复所需的联系人数 (阈值)
                  </label>
                  <div className="threshold-controls">
                    <button
                      onClick={() => setThreshold(Math.max(2, threshold - 1))}
                      disabled={threshold <= 2}
                    >
                      -
                    </button>
                    <span className="threshold-value">{threshold}</span>
                    <button
                      onClick={() =>
                        setThreshold(Math.min(contacts.length, threshold + 1))
                      }
                      disabled={threshold >= contacts.length}
                    >
                      +
                    </button>
                  </div>
                  <p className="hint">
                    需要至少 {threshold} 个联系人提供份额才能恢复
                  </p>
                </div>

                <div className="waiting-input">
                  <label>等待期 (天)</label>
                  <input
                    type="number"
                    value={waitingPeriod}
                    onChange={(e) =>
                      setWaitingPeriod(Math.max(1, parseInt(e.target.value) || 30))
                    }
                    min={1}
                    max={365}
                  />
                  <p className="hint">
                    首次申请恢复后需要等待 {waitingPeriod} 天才能执行
                  </p>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setShowSetup(false)}
                >
                  取消
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSetup}
                  disabled={loading}
                >
                  {loading ? '设置中...' : '确认设置'}
                </button>
              </div>
            </div>
          )}

          {config && (
            <div className="config-display">
              <div className="config-header">
                <div className="config-status">
                  <Shield size={20} />
                  <span>已启用</span>
                </div>
                <button className="disable-btn" onClick={handleDisable}>
                  <Trash2 size={18} />
                  禁用
                </button>
              </div>

              <div className="config-info">
                <div className="info-item">
                  <span>恢复阈值</span>
                  <strong>
                    {config.threshold} / {config.contacts.length} 人
                  </strong>
                </div>
                <div className="info-item">
                  <span>等待期</span>
                  <strong>{config.waiting_period_days} 天</strong>
                </div>
                <div className="info-item">
                  <span>设置时间</span>
                  <strong>
                    {new Date(config.created_at).toLocaleDateString()}
                  </strong>
                </div>
              </div>

              <div className="contacts-list">
                <h4>紧急联系人</h4>
                {config.contacts.map((contact) => (
                  <div key={contact.id} className="contact-card">
                    <div className="contact-avatar">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">{contact.name}</div>
                      <div className="contact-email">{contact.email}</div>
                      {contact.phone && (
                        <div className="contact-phone">{contact.phone}</div>
                      )}
                    </div>
                    <div className="contact-share">
                      <div className="share-header">
                        <span>恢复份额</span>
                        <div className="share-actions">
                          <button
                            onClick={() => toggleShareVisibility(contact.id)}
                          >
                            {showShares[contact.id] ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => handleCopyShare(contact.share, contact.id)}
                          >
                            {copiedShare === contact.id ? (
                              <Check size={16} />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="share-value">
                        {showShares[contact.id]
                          ? contact.share
                          : '••••••••••••••••'}
                      </div>
                      <p className="share-hint">
                        请将此份额安全地分享给 {contact.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="security-notice">
                <AlertTriangle size={20} />
                <div>
                  <strong>安全提示</strong>
                  <p>
                    请确保每个紧急联系人都安全保管好自己的份额。
                    任何人单独都无法恢复您的密码库，需要至少 {config.threshold} 人共同提供份额。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'recovery' && (
        <div className="recovery-content">
          {!config ? (
            <div className="empty-config">
              <div className="config-icon">
                <Key size={48} />
              </div>
              <h3>未配置紧急联系人</h3>
              <p>请先在"配置"标签页设置紧急联系人</p>
            </div>
          ) : (
            <>
              {recoveryStatus && (
                <div className="recovery-status-card">
                  <h4>恢复状态</h4>
                  <div className="status-grid">
                    <div className="status-item">
                      <span>已收集份额</span>
                      <strong>
                        {recoveryStatus.collected_shares} /{' '}
                        {recoveryStatus.required_shares}
                      </strong>
                    </div>
                    <div className="status-item">
                      <span>等待期剩余</span>
                      <strong>
                        {recoveryStatus.waiting_period_remaining_days} 天
                      </strong>
                    </div>
                    <div className="status-item">
                      <span>可恢复</span>
                      <strong className={recoveryStatus.can_recover ? 'success' : 'pending'}>
                        {recoveryStatus.can_recover ? '是' : '否'}
                      </strong>
                    </div>
                  </div>
                  {recoveryStatus.contacts_responded.length > 0 && (
                    <div className="responded-contacts">
                      <span>已响应:</span>
                      <div className="contacts-tags">
                        {recoveryStatus.contacts_responded.map((name, i) => (
                          <span key={i} className="contact-tag">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="recovery-actions">
                <button className="btn-primary" onClick={loadRecoveryData}>
                  刷新状态
                </button>
                {recoveryRequests.length > 0 && (
                  <button className="btn-danger" onClick={handleClearRequests}>
                    清除请求
                  </button>
                )}
              </div>

              <div className="recovery-requests">
                <h4>恢复请求</h4>
                {recoveryRequests.length === 0 ? (
                  <p className="empty-text">暂无恢复请求</p>
                ) : (
                  recoveryRequests.map((request) => (
                    <div key={request.id} className="recovery-request-card">
                      <div className="request-info">
                        <div className="request-name">{request.contact_name}</div>
                        <div className="request-date">
                          {new Date(request.requested_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="request-status">
                        {request.approved ? (
                          <span className="status-badge approved">已批准</span>
                        ) : (
                          <button
                            className="approve-btn"
                            onClick={() => handleApproveRequest(request.id)}
                          >
                            批准
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
