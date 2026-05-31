import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Code2, Search, Plus, Star, Settings } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { to: '/', label: '搜索', icon: <Search size={18} /> },
  { to: '/upload', label: '上传', icon: <Plus size={18} /> },
  { to: '/favorites', label: '收藏', icon: <Star size={18} /> },
  { to: '/maintenance', label: '维护', icon: <Settings size={18} /> },
];

export function Navbar() {
  const location = useLocation();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Code2 className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">Code Semantic Search</span>
            </Link>
          </div>

          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.to ||
                (item.to === '/' && location.pathname.startsWith('/snippet'));

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center space-x-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
