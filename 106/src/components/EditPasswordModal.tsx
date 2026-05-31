import { useState, useEffect } from 'react';
import { X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { updatePassword, generatePassword, checkPasswordStrength } from '../services/api';
import { useAppStore } from '../store';
import { listPasswords } from '../services/api';
import type { PasswordEntry, PasswordStrengthResponse } from '../types';
import './Modal.css';

interface EditPasswordModalProps {
  password: PasswordEntry;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditPasswordModal({ password, onClose, onSaved }: EditPasswordModalProps) {
  const [title, setTitle] = useState(password.title);
  const [username, setUsername] = useState(password.username);
  const [pwd, setPwd] = useState(password.password);
  const [url, setUrl] = useState(password.url || '');
  const [notes, setNotes] = useState(password.notes || '');
  const [category, setCategory] = useState(password.category || '');
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState<PasswordStrengthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const setPasswords = useAppStore((state) => state.setPasswords);

  useEffect(() => {
    if (pwd) {
      checkStrength(pwd);
    }
  }, [pwd]);

  const checkStrength = async (passwordStr: string) => {
    try {
      const result = await checkPasswordStrength(passwordStr);
      setStrength(result);
    } catch (err) {
      console.error('Failed to check strength:', err);
    }
  };

  const handleGeneratePassword = async () => {
    try {
      const newPwd = await generatePassword(24, true);
      setPwd(newPwd);
    } catch (err) {
      console.error('Failed to generate password:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !pwd) return;

    try {
      setLoading(true);
      await updatePassword({
        id: password.id,
        title,
        username,
        password: pwd,
        url: url || undefined,
        notes: notes || undefined,
        category: category || undefined,
      });
      const updated = await listPasswords();
      setPasswords(updated);
      onSaved();
    } catch (err) {
      console.error('Failed to update password:', err);
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
          <h2>编辑密码</h2>
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
              required
            />
          </div>

          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>密码 *</label>
            <div className="password-input-group">
              <input
                type={showPassword ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
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
            />
          </div>

          <div className="form-group">
            <label>分类</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>备注</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
