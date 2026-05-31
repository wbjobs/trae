import { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Trash2,
  Globe,
  User,
  FileText,
  Folder,
  Calendar,
  Check,
} from 'lucide-react';
import { useAppStore } from '../store';
import { getPassword, deletePassword } from '../services/api';
import type { PasswordListItem, PasswordEntry } from '../types';
import EditPasswordModal from './EditPasswordModal';
import './PasswordDetail.css';

interface PasswordDetailProps {
  password: PasswordListItem | null;
  onClose: () => void;
}

export function PasswordDetail({ password, onClose }: PasswordDetailProps) {
  const [detail, setDetail] = useState<PasswordEntry | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const setPasswords = useAppStore((state) => state.setPasswords);
  const setSelectedPassword = useAppStore((state) => state.setSelectedPassword);

  useEffect(() => {
    if (password) {
      loadDetail(password.id);
    } else {
      setDetail(null);
    }
    setShowPassword(false);
  }, [password]);

  const loadDetail = async (id: string) => {
    try {
      setLoading(true);
      const data = await getPassword(id);
      setDetail(data);
    } catch (err) {
      console.error('Failed to load password detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (detail) {
      await navigator.clipboard.writeText(detail.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    if (detail && confirm('确定要删除此密码吗？')) {
      try {
        await deletePassword(detail.id);
        const { listPasswords } = await import('../services/api');
        const updated = await listPasswords();
        setPasswords(updated);
        setSelectedPassword(null);
      } catch (err) {
        console.error('Failed to delete password:', err);
      }
    }
  };

  if (!password) {
    return (
      <div className="password-detail-empty">
        <div className="empty-placeholder">
          <Eye size={48} />
          <h3>选择一个密码查看详情</h3>
          <p>点击左侧列表中的密码条目</p>
        </div>
      </div>
    );
  }

  return (
    <div className="password-detail">
      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : detail ? (
        <>
          <div className="detail-header">
            <div className="detail-avatar">
              {detail.title.charAt(0).toUpperCase()}
            </div>
            <div className="detail-info">
              <h2>{detail.title}</h2>
              {detail.category && (
                <span className="category-tag">{detail.category}</span>
              )}
            </div>
            <div className="detail-actions">
              <button
                className="action-btn edit"
                onClick={() => setShowEditModal(true)}
              >
                <Pencil size={18} />
              </button>
              <button
                className="action-btn delete"
                onClick={handleDelete}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div className="detail-fields">
            <div className="detail-field">
              <label>
                <User size={16} />
                用户名
              </label>
              <div className="field-value">
                <input type="text" value={detail.username} readOnly />
                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(detail.username);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            <div className="detail-field">
              <label>
                <Eye size={16} />
                密码
              </label>
              <div className="field-value">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={detail.password}
                  readOnly
                />
                <button
                  className="toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  className="copy-btn"
                  onClick={handleCopy}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {detail.url && (
              <div className="detail-field">
                <label>
                  <Globe size={16} />
                  网址
                </label>
                <div className="field-value">
                  <a
                    href={detail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="url-link"
                  >
                    {detail.url}
                  </a>
                </div>
              </div>
            )}

            {detail.notes && (
              <div className="detail-field">
                <label>
                  <FileText size={16} />
                  备注
                </label>
                <div className="field-value notes">
                  {detail.notes}
                </div>
              </div>
            )}

            <div className="detail-meta">
              <div className="meta-item">
                <Calendar size={14} />
                <span>创建于: {new Date(detail.created_at).toLocaleDateString()}</span>
              </div>
              <div className="meta-item">
                <Calendar size={14} />
                <span>更新于: {new Date(detail.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="loading-state">加载中...</div>
      )}

      {showEditModal && detail && (
        <EditPasswordModal
          password={detail}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            loadDetail(detail.id);
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
