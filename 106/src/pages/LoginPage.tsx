import { useState } from 'react';
import { Lock, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';
import { initializeVault, unlockVault } from '../services/api';

interface LoginPageProps {
  mode: 'unlock' | 'create';
  onModeChange: (mode: 'unlock' | 'create') => void;
}

export default function LoginPage({ mode, onModeChange }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuthenticated = useAppStore((state) => state.setAuthenticated);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'create') {
        if (password.length < 8) {
          setError('密码至少需要8个字符');
          return;
        }
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          return;
        }
        await initializeVault(password);
      } else {
        await unlockVault(password);
      }
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon">
          <Shield size={48} />
          </div>
          <h1>密码管理器</h1>
          <p className="subtitle">
            {mode === 'create' ? '创建新的加密保险箱' : '解锁您的保险箱'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label className="input-label">
              <Lock size={18} />
              主密码
            </label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'create' ? '请输入主密码' : '请输入您的主密码'}
                className="password-input"
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {mode === 'create' && (
            <div className="input-group">
              <label className="input-label">
                <Lock size={18} />
                确认密码
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入主密码"
                  className="password-input"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="spinning" />
                {mode === 'create' ? '创建中...' : '解锁中...'}
              </>
            ) : mode === 'create' ? (
              '创建保险箱'
            ) : (
              '解锁'
            )}
          </button>
        </form>

        <div className="mode-switch">
          {mode === 'unlock' ? (
            <p>
              首次使用？
              <button
                type="button"
                onClick={() => onModeChange('create')}
              >
                创建新保险箱
              </button>
            </p>
          ) : (
            <p>
              已有保险箱？
              <button
                type="button"
                onClick={() => onModeChange('unlock')}
              >
                解锁已有保险箱
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
