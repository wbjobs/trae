import { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Ban, CheckCircle, Clock, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import clsx from 'clsx';

interface SuspiciousCard {
  id: string;
  uid: string;
  owner_name: string;
  anomaly_score: number;
  indicators: string[];
  first_detected: number;
  last_seen: number;
  violation_count: number;
  is_blacklisted: boolean;
}

interface BlacklistedCard {
  id: string;
  uid: string;
  card_type: string;
  reason: string;
  source: string;
  detected_at: number;
  expires_at: number;
  is_active: boolean;
  reported_by: string;
}

export default function SuspiciousCards() {
  const [activeTab, setActiveTab] = useState<'suspicious' | 'blacklist'>('suspicious');
  const [suspiciousCards, setSuspiciousCards] = useState<SuspiciousCard[]>([]);
  const [blacklistedCards, setBlacklistedCards] = useState<BlacklistedCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [minScore, setMinScore] = useState(0.5);

  useEffect(() => {
    if (activeTab === 'suspicious') {
      fetchSuspiciousCards();
    } else {
      fetchBlacklistedCards();
    }
  }, [activeTab, minScore]);

  const fetchSuspiciousCards = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/suspicious-cards', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSuspiciousCards(data.cards || []);
      }
    } catch (error) {
      console.error('Failed to fetch suspicious cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBlacklistedCards = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/blacklist', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setBlacklistedCards(data.cards || []);
      }
    } catch (error) {
      console.error('Failed to fetch blacklisted cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBlacklist = async (uid: string) => {
    if (!confirm('确定要将此卡片从黑名单移除？')) return;

    try {
      const response = await fetch(`/api/blacklist/${uid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        alert('已从黑名单移除');
        fetchBlacklistedCards();
      } else {
        alert('移除失败');
      }
    } catch (error) {
      console.error('Failed to remove from blacklist:', error);
      alert('移除失败');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-danger-600';
    if (score >= 0.6) return 'text-warning-600';
    return 'text-success-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 0.8) return 'bg-danger-100';
    if (score >= 0.6) return 'bg-warning-100';
    return 'bg-success-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-danger-600" />
            卡片安全监控
          </h1>
          <p className="text-sm text-gray-500 mt-1">检测和管理可疑卡片，保护门禁安全</p>
        </div>
      </div>

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('suspicious')}
          className={clsx(
            'px-4 py-2 rounded-md text-sm font-medium transition-all',
            activeTab === 'suspicious'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          )}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            可疑卡片
          </span>
        </button>
        <button
          onClick={() => setActiveTab('blacklist')}
          className={clsx(
            'px-4 py-2 rounded-md text-sm font-medium transition-all',
            activeTab === 'blacklist'
              ? 'bg-white text-danger-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          )}
        >
          <span className="flex items-center gap-2">
            <Ban className="w-4 h-4" />
            黑名单
          </span>
        </button>
      </div>

      {activeTab === 'suspicious' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-800">可疑卡片列表</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">最低异常分数:</span>
              <select
                value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
                className="input-field w-24"
              >
                <option value="0.3">0.3</option>
                <option value="0.5">0.5</option>
                <option value="0.7">0.7</option>
                <option value="0.9">0.9</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : suspiciousCards.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-success-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无可疑卡片，系统运行正常</p>
            </div>
          ) : (
            <div className="space-y-4">
              {suspiciousCards.map((card) => (
                <div
                  key={card.id}
                  className={clsx(
                    'p-4 rounded-lg border',
                    card.is_blacklisted
                      ? 'bg-danger-50 border-danger-200'
                      : 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-lg font-medium text-gray-800">
                          {card.uid}
                        </span>
                        <span
                          className={clsx(
                            'px-2 py-1 rounded text-xs font-medium',
                            card.is_blacklisted
                              ? 'bg-danger-100 text-danger-700'
                              : 'bg-warning-100 text-warning-700'
                          )}
                        >
                          {card.is_blacklisted ? '已封禁' : '可疑'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        持有人: {card.owner_name || '未知'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          首次发现: {format(card.first_detected * 1000, 'MM-dd HH:mm', { locale: zhCN })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          最近: {format(card.last_seen * 1000, 'MM-dd HH:mm', { locale: zhCN })}
                        </span>
                        <span>
                          违规次数: {card.violation_count}
                        </span>
                      </div>
                      {card.indicators.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {card.indicators.map((indicator, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-warning-100 text-warning-700 text-xs rounded"
                            >
                              {indicator}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div
                        className={clsx(
                          'px-3 py-2 rounded-lg font-bold text-lg',
                          getScoreBg(card.anomaly_score)
                        )}
                      >
                        <span className={getScoreColor(card.anomaly_score)}>
                          {(card.anomaly_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">异常分数</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'blacklist' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">黑名单管理</h3>

          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : blacklistedCards.length === 0 ? (
            <div className="text-center py-12">
              <Ban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">黑名单为空</p>
            </div>
          ) : (
            <div className="space-y-4">
              {blacklistedCards.map((card) => (
                <div
                  key={card.id}
                  className="p-4 rounded-lg border border-danger-200 bg-danger-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-lg font-medium text-gray-800">
                          {card.uid}
                        </span>
                        <span className="px-2 py-1 bg-danger-100 text-danger-700 text-xs rounded">
                          {card.is_active ? '已封禁' : '已过期'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        封禁原因: {card.reason}
                      </p>
                      <p className="text-sm text-gray-500">
                        来源: {card.source} | 报告人: {card.reported_by}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          封禁时间: {format(card.detected_at * 1000, 'MM-dd HH:mm', { locale: zhCN })}
                        </span>
                        {card.expires_at > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            过期时间: {format(card.expires_at * 1000, 'MM-dd HH:mm', { locale: zhCN })}
                          </span>
                        )}
                      </div>
                    </div>
                    {card.is_active && (
                      <button
                        onClick={() => handleRemoveBlacklist(card.uid)}
                        className="btn-secondary text-sm"
                      >
                        解除封禁
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">检测说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-success-50">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-success-600" />
              <span className="font-medium text-gray-800">正常卡片</span>
            </div>
            <p className="text-sm text-gray-600">异常分数 &lt; 50%</p>
          </div>
          <div className="p-4 rounded-lg bg-warning-50">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-warning-600" />
              <span className="font-medium text-gray-800">可疑卡片</span>
            </div>
            <p className="text-sm text-gray-600">异常分数 50-80%</p>
          </div>
          <div className="p-4 rounded-lg bg-danger-50">
            <div className="flex items-center gap-2 mb-2">
              <Ban className="w-5 h-5 text-danger-600" />
              <span className="font-medium text-gray-800">已封禁</span>
            </div>
            <p className="text-sm text-gray-600">异常分数 ≥ 80% 或 UID不匹配</p>
          </div>
        </div>
      </div>
    </div>
  );
}
