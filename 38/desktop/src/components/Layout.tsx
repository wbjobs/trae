import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Shield,
  ShieldAlert,
  History,
  Unlock,
  Settings,
  LogOut,
  Menu,
  X,
  User,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuthStore } from '@/store/useAuthStore';

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/cards', label: '卡片管理', icon: CreditCard },
  { path: '/permissions', label: '权限管理', icon: Shield },
  { path: '/logs', label: '审计日志', icon: History },
  { path: '/remote', label: '远程控制', icon: Unlock },
  { path: '/security', label: '安全监控', icon: ShieldAlert },
  { path: '/settings', label: '系统设置', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside
        className={clsx(
          'flex flex-col bg-white border-r border-gray-100 transition-all duration-300',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-800">NFC门禁</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={clsx(
                  'sidebar-link w-full',
                  isActive && 'sidebar-link-active',
                  sidebarCollapsed && 'justify-center'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div
            className={clsx(
              'flex items-center gap-3 p-2 rounded-lg bg-gray-50',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-primary-600" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {user?.name || user?.username}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.role === 'super_admin'
                    ? '超级管理员'
                    : user?.role === 'admin'
                    ? '管理员'
                    : '普通用户'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={clsx(
              'sidebar-link w-full mt-2 text-red-600 hover:bg-red-50 hover:text-red-700',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>退出登录</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              {navItems.find((item) => location.pathname.startsWith(item.path))?.label || ''}
            </h1>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
