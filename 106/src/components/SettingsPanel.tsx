import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  Play,
  Square,
  Copy,
  Check,
  Shield,
  Info,
} from 'lucide-react';
import {
  getServerStatus,
  startServer,
  stopServer,
} from '../services/api';
import type { ServerStatus } from '../types';
import './SettingsPanel.css';

export function SettingsPanel() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    running: false,
  });
  const [port, setPort] = useState(9234);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadServerStatus();
  }, []);

  const loadServerStatus = async () => {
    try {
      const status = await getServerStatus();
      setServerStatus(status);
    } catch (err) {
      console.error('Failed to get server status:', err);
    }
  };

  const handleStartServer = async () => {
    try {
      setLoading(true);
      const status = await startServer({ port });
      setServerStatus(status);
    } catch (err) {
      console.error('Failed to start server:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStopServer = async () => {
    try {
      setLoading(true);
      await stopServer();
      setServerStatus({ running: false });
    } catch (err) {
      console.error('Failed to stop server:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (serverStatus.token) {
      await navigator.clipboard.writeText(serverStatus.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>设置</h2>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon">
              <Server size={20} />
            </div>
            <div>
              <h3>浏览器自动填充</h3>
              <p>启动本地服务以支持浏览器扩展自动填充</p>
            </div>
          </div>

          <div className="server-controls">
            <div className="server-status">
              <div
                className={`status-indicator ${
                  serverStatus.running ? 'active' : 'inactive'
                }`}
              />
              <span>
                {serverStatus.running ? '服务运行中' : '服务已停止'}
              </span>
            </div>

            <div className="port-config">
              <label>端口</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                disabled={serverStatus.running}
                min={1}
                max={65535}
              />
            </div>

            <div className="server-actions">
              {!serverStatus.running ? (
                <button
                  className="btn-primary"
                  onClick={handleStartServer}
                  disabled={loading}
                >
                  <Play size={18} />
                  {loading ? '启动中...' : '启动服务'}
                </button>
              ) : (
                <button
                  className="btn-danger"
                  onClick={handleStopServer}
                  disabled={loading}
                >
                  <Square size={18} />
                  {loading ? '停止中...' : '停止服务'}
                </button>
              )}
            </div>
          </div>

          {serverStatus.running && (
            <div className="server-info">
              <div className="info-row">
                <span>服务地址</span>
                <code>http://127.0.0.1:{serverStatus.port}</code>
              </div>
              <div className="info-row">
                <span>访问令牌</span>
                <div className="token-display">
                  <code className="token">{serverStatus.token}</code>
                  <button
                    className="copy-btn"
                    onClick={handleCopyToken}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="extension-info">
            <div className="info-header">
              <Info size={18} />
              <h4>浏览器扩展配置</h4>
            </div>
            <ol className="setup-steps">
              <li>安装浏览器扩展</li>
              <li>点击扩展图标，输入服务地址和访问令牌</li>
              <li>保存配置后即可使用自动填充功能</li>
            </ol>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon security">
              <Shield size={20} />
            </div>
            <div>
              <h3>安全信息</h3>
              <p>了解您的数据保护方式</p>
            </div>
          </div>

          <div className="security-info">
            <div className="info-item">
              <div className="info-label">加密算法</div>
              <div className="info-value">AES-256-GCM</div>
            </div>
            <div className="info-item">
              <div className="info-label">密钥派生</div>
              <div className="info-value">PBKDF2 (100,000 次迭代)</div>
            </div>
            <div className="info-item">
              <div className="info-label">数据库加密</div>
              <div className="info-value">SQLCipher</div>
            </div>
            <div className="info-item">
              <div className="info-label">哈希算法</div>
              <div className="info-value">SHA-256</div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <div className="section-icon">
              <SettingsIcon size={20} />
            </div>
            <div>
              <h3>关于</h3>
              <p>版本信息</p>
            </div>
          </div>

          <div className="about-info">
            <div className="info-item">
              <div className="info-label">应用名称</div>
              <div className="info-value">密码管理器</div>
            </div>
            <div className="info-item">
              <div className="info-label">版本</div>
              <div className="info-value">1.0.0</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
