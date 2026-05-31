import { useState, useEffect } from 'react';
import { X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { addPassword, generatePassword, checkPasswordStrength } from '../services/api';
import { useAppStore } from '../store';
import { listPasswords } from '../services/api';
import type { PasswordStrengthResponse } from '../types';
import './Modal.css';

interface AddPasswordModalProps {
  onClose: () => void;
}

export function AddPasswordModal({ onClose }: AddPasswordModalProps) {
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState<PasswordStrengthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const setPasswords = useAppStore((state) => state.setPasswords);

  useEffect(() => {
    if (password) {
      checkStrength(password);
    } else {
      setStrength(null);
    }
  }, [password]);

  const checkStrength = async (pwd: string) => {
    try {
      const result = await checkPasswordStrength(pwd);
      setStrength(result);
    } catch (err) {
      console.error('Failed to check strength:', err);
    }
  };

  const handleGeneratePassword = async () => {
    try {
      const pwd = await generatePassword(24, true);
      setPassword(pwd);
    } catch (err) {
      console.error('Failed to generate password:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !password) return;

    try {
      setLoading(true);
      await addPassword({
        title,
        username,
        password,
        url: url || undefined,
        notes: notes || undefined,
        category: category || undefined,
      });
      const updated = await listPasswords();
      setPasswords(updated);
      onClose();
    } catch (err) {
      console.error('Failed to add password:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStrengthColor = (score: number) => {
    if (score < 25) return '#ef4444';
    if (score < 50) return '#f97316';
    if (score < 75) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>添加密码</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>标题 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如: Gmail, 微信等"
              required
            />
          </div>

          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名或邮箱"
            />
          </div>

          <div className="form-group">
            <label>密码 *</label>
            <div className="password-input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={handleGeneratePassword}
              >
                <RefreshCw size={20} />
              </button>
            </div>
            {strength && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div
                    className="strength-fill"
                    style={{
                      width: `${strength.score}%`,
                      backgroundColor: getStrengthColor(strength.score),
                    }}
                  />
                </div>
                <span
                  className="strength-label"
                  style={{ color: getStrengthColor(strength.score) }}
                >
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>网址</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="form-group">
            <label>分类</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="工作、个人、金融等"
            />
          </div>

          <div className="form-group">
            <label>备注</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="其他相关信息..."
              rows={3}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
