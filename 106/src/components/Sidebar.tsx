import { Key, BarChart3, Settings, LogOut, Shield, Users } from 'lucide-react';
import { useAppStore } from '../store';
import { lockVault } from '../services/api';
import './Sidebar.css';

interface SidebarProps {
  activeView: 'passwords' | 'analysis' | 'settings' | 'emergency';
  onViewChange: (view: 'passwords' | 'analysis' | 'settings' | 'emergency') => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const reset = useAppStore((state) => state.reset);

  const handleLogout = async () => {
    try {
      await lockVault();
      reset();
    } catch (err) {
      console.error('Failed to lock vault:', err);
    }
  };

  const menuItems = [
    { id: 'passwords' as const, icon: Key, label: '密码库' },
    { id: 'analysis' as const, icon: BarChart3, label: '安全分析' },
    { id: 'emergency' as const, icon: Users, label: '紧急联系人' },
    { id: 'settings' as const, icon: Settings, label: '设置' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Shield size={32} />
        </div>
        <span className="sidebar-title">密码管理器</span>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={20} />
          <span>锁定</span>
        </button>
      </div>
    </div>
  );
}
