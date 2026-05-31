import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Edit,
  Key,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getCards, unregisterCard } from '@/services/api';
import { Card, PermissionGroup } from '@/types';
import clsx from 'clsx';

export default function CardList() {
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState('');
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  useEffect(() => {
    loadCards();
  }, [page, search, statusFilter, groupFilter]);

  const loadCards = async () => {
    setLoading(true);
    try {
      const response = await getCards({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        permissionGroupId: groupFilter || undefined,
      });
      setCards(response.cards);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要注销此卡片吗？')) return;
    try {
      await unregisterCard(id);
      loadCards();
    } catch (error) {
      console.error('Failed to unregister card:', error);
    }
    setActionMenu(null);
  };

  const totalPages = Math.ceil(total / pageSize);

  const getStatusBadge = (status: Card['status']) => {
    const styles = {
      active: 'bg-success-100 text-success-700',
      inactive: 'bg-gray-100 text-gray-700',
      expired: 'bg-danger-100 text-danger-700',
    };
    const labels = {
      active: '活跃',
      inactive: '未激活',
      expired: '已过期',
    };
    return (
      <span className={clsx('status-badge', styles[status])}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">管理所有门禁卡片，支持注册、注销和权限配置</p>
        </div>
        <Link to="/cards/register" className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-4 h-4" />
          注册新卡片
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索UID、用户名..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field min-w-[120px]"
          >
            <option value="">全部状态</option>
            <option value="active">活跃</option>
            <option value="inactive">未激活</option>
            <option value="expired">已过期</option>
          </select>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="input-field min-w-[150px]"
          >
            <option value="">全部权限组</option>
            {permissionGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">UID</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">使用人</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">卡片类型</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">权限组</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">密钥</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">注册时间</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">状态</th>
                <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(pageSize)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${Math.random() * 40 + 60}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    暂无卡片数据
                  </td>
                </tr>
              ) : (
                cards.map((card) => (
                  <tr key={card.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <code className="font-mono text-sm text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                        {card.uid}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-800">{card.user_name}</div>
                      {card.description && (
                        <div className="text-sm text-gray-500">{card.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{card.card_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{card.permission_group_name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <span className={clsx('w-6 h-6 rounded flex items-center justify-center text-xs', card.has_key_a ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-400')}>
                          A
                        </span>
                        <span className={clsx('w-6 h-6 rounded flex items-center justify-center text-xs', card.has_key_b ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-400')}>
                          B
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {format(card.created_at * 1000, 'MM-dd HH:mm', { locale: zhCN })}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(card.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setActionMenu(actionMenu === card.id ? null : card.id)}
                          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>
                        {actionMenu === card.id && (
                          <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
                            <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <Edit className="w-4 h-4" />
                              编辑
                            </button>
                            <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <Key className="w-4 h-4" />
                              管理密钥
                            </button>
                            <button
                              onClick={() => handleDelete(card.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              注销
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              共 {total} 条，第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
