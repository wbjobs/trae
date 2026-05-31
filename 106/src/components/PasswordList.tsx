import { useState, useEffect } from 'react';
import { Search, Eye, Globe, Folder, Key } from 'lucide-react';
import { useAppStore } from '../store';
import { listPasswords, searchPasswords } from '../services/api';
import type { PasswordListItem } from '../types';
import './PasswordList.css';

interface PasswordListProps {
  onSelect: (password: PasswordListItem) => void;
  selectedId?: string;
}

export function PasswordList({ onSelect, selectedId }: PasswordListProps) {
  const [loading, setLoading] = useState(true);
  const passwords = useAppStore((state) => state.passwords);
  const setPasswords = useAppStore((state) => state.setPasswords);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);

  useEffect(() => {
    loadPasswords();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        handleSearch();
      } else {
        loadPasswords();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadPasswords = async () => {
    try {
      setLoading(true);
      const data = await listPasswords();
      setPasswords(data);
    } catch (err) {
      console.error('Failed to load passwords:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      const data = await searchPasswords(searchQuery);
      setPasswords(data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-list">
      <div className="search-bar">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="搜索密码..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="password-list-content">
        {loading ? (
          <div className="loading-state">加载中...</div>
        ) : passwords.length === 0 ? (
          <div className="empty-state">
            <Key size={48} />
            <p>暂无密码</p>
            <span>点击"添加密码"开始</span>
          </div>
        ) : (
          <div className="password-items">
            {passwords.map((pwd) => (
              <button
                key={pwd.id}
                className={`password-item ${selectedId === pwd.id ? 'selected' : ''}`}
                onClick={() => onSelect(pwd)}
              >
                <div className="password-item-header">
                  <div className="password-avatar">
                    {pwd.title.charAt(0).toUpperCase()}
                  </div>
                  <div className="password-item-info">
                    <h3 className="password-title">{pwd.title}</h3>
                    <p className="password-username">{pwd.username}</p>
                  </div>
                </div>
                {pwd.url && (
                  <div className="password-url">
                    <Globe size={14} />
                    <span>{pwd.url}</span>
                  </div>
                )}
                {pwd.category && (
                  <div className="password-category">
                    <Folder size={14} />
                    <span>{pwd.category}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
