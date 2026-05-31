import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Lock,
  Copy,
} from 'lucide-react';
import { useAppStore } from '../store';
import { analyzePasswords } from '../services/api';
import type { PasswordAnalysis } from '../types';
import './AnalysisPanel.css';

export function AnalysisPanel() {
  const [analysis, setAnalysis] = useState<PasswordAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const setAnalysisState = useAppStore((state) => state.setAnalysis);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      const data = await analyzePasswords();
      setAnalysis(data);
      setAnalysisState(data);
    } catch (err) {
      console.error('Failed to analyze passwords:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalysis();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '较差';
  };

  if (loading) {
    return (
      <div className="analysis-panel">
        <div className="loading-state">
          <RefreshCw size={32} className="spinning" />
          <p>正在分析密码库...</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="analysis-panel">
        <div className="loading-state">
          <p>加载失败</p>
          <button className="retry-btn" onClick={loadAnalysis}>
            <RefreshCw size={18} />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <h2>安全分析报告</h2>
        <button className="refresh-btn" onClick={loadAnalysis}>
          <RefreshCw size={18} />
          刷新
        </button>
      </div>

      <div className="analysis-content">
        <div className="score-card">
          <div
            className="score-circle"
            style={{
              background: `conic-gradient(${getScoreColor(analysis.security_score)} ${analysis.security_score * 3.6}deg, rgba(71, 85, 105, 0.3) 0deg)`,
            }}
          >
            <div className="score-inner">
              <span
                className="score-value"
                style={{ color: getScoreColor(analysis.security_score) }}
              >
                {analysis.security_score}
              </span>
              <span className="score-label">
                {getScoreLabel(analysis.security_score)}
              </span>
            </div>
          </div>
          <div className="score-info">
            <h3>安全评分</h3>
            <p>基于密码强度、重复使用等综合评估</p>
            <div className="stat-row">
              <span>总密码数</span>
              <strong>{analysis.total_passwords}</strong>
            </div>
            <div className="stat-row">
              <span>平均强度</span>
              <strong>{analysis.average_strength.toFixed(1)}%</strong>
            </div>
          </div>
        </div>

        <div className="analysis-sections">
          <div className="analysis-section">
            <div className="section-header">
              <div className="section-icon weak">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3>弱密码</h3>
                <p>需要加强的密码</p>
              </div>
              <span className="badge weak">{analysis.weak_passwords.length}</span>
            </div>
            {analysis.weak_passwords.length > 0 ? (
              <div className="issue-list">
                {analysis.weak_passwords.map((wp, idx) => (
                  <div key={idx} className="issue-item">
                    <div className="issue-info">
                      <span className="issue-title">{wp.title}</span>
                      <span className="issue-label">{wp.label}</span>
                    </div>
                    <div className="strength-indicator">
                      <div
                        className="strength-bar"
                        style={{
                          width: `${wp.score}%`,
                          backgroundColor:
                            wp.score < 25
                              ? '#ef4444'
                              : wp.score < 50
                              ? '#f97316'
                              : '#eab308',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-issues">
                <CheckCircle size={32} />
                <p>没有发现弱密码！</p>
              </div>
            )}
          </div>

          <div className="analysis-section">
            <div className="section-header">
              <div className="section-icon duplicate">
                <Copy size={20} />
              </div>
              <div>
                <h3>重复密码</h3>
                <p>重复使用的密码</p>
              </div>
              <span className="badge duplicate">
                {analysis.duplicate_passwords.length}
              </span>
            </div>
            {analysis.duplicate_passwords.length > 0 ? (
              <div className="issue-list">
                {analysis.duplicate_passwords.map((dp, idx) => (
                  <div key={idx} className="issue-item">
                    <div className="issue-info">
                      <span className="issue-title">
                        {dp.entries.map((e) => e.title).join(', ')}
                      </span>
                      <span className="issue-label">
                        密码被使用 {dp.count} 次
                      </span>
                    </div>
                    <div className="strength-indicator">
                      <div
                        className="strength-bar"
                        style={{
                          width: '100%',
                          backgroundColor: '#f97316',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-issues">
                <CheckCircle size={32} />
                <p>所有密码都是唯一的！</p>
              </div>
            )}
          </div>
        </div>

        <div className="recommendations-section">
          <h3>安全建议</h3>
          <ul className="recommendations-list">
            {analysis.recommendations.map((rec, idx) => (
              <li key={idx}>
                <Shield size={16} />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
