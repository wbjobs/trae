import { useEffect, useState } from 'react';
import { Search, Filter, Download, Clock, User, DoorOpen, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getAccessLogs } from '@/services/api';
import { AccessLog } from '@/types';
import clsx from 'clsx';

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadLogs();
  }, [page, search, resultFilter, startDate, endDate]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const startTime = startDate ? new Date(startDate).getTime() / 1000 : undefined;
      const endTime = endDate ? new Date(endDate).getTime() / 1000 + 86400 : undefined;

      const response = await getAccessLogs({
        page,
        pageSize,
        cardUid: search || undefined,
        result: resultFilter || undefined,
        startTime,
        endTime,
      });
      setLogs(response.logs);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load access logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const getResultBadge = (result: AccessLog['result']) => {
    return (
      <span
        className={clsx(
          'status-badge',
          result === 'allowed'
            ? 'bg-success-100 text-success-700'
            : 'bg-danger-100 text-danger-700'
        )}
      >
        {result === 'allowed' ? '允许' : '拒绝'}
      </span>
    );
  };

  const getEventTypeBadge = (eventType: AccessLog['event_type']) => {
    const styles: Record<string, string> = {
      card: 'bg-primary-100 text-primary-700',
      remote: 'bg-warning-100 text-warning-700',
      api: 'bg-purple-100 text-purple-700',
    };
    const labels: Record<string, string> = {
      card: '刷卡',
      remote: '远程',
      api: 'API',
    };
    return (
      <span className={clsx('status-badge', styles[eventType] || 'bg-gray-100 text-gray-700')}>
        {labels[eventType] || eventType}
      </span>
    );
  };

  const exportLogs = () => {
    const csvContent = [
      ['时间', '用户', 'UID', '门点', '类型', '结果', '详情'],
      ...logs.map((log) => [
        format(log.timestamp * 1000, 'yyyy-MM-dd HH:mm:ss'),
        log.user_name || '',
        log.card_uid,
        log.door_name || '',
        log.event_type,
        log.result,
        log.details || '',
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `access_logs_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">查看和导出所有门禁访问记录</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            onClick={exportLogs}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索卡片UID..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="input-field min-w-[120px]"
          >
            <option value="">全部结果</option>
            <option value="allowed">允许</option>
            <option value="denied">拒绝</option>
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-field"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">时间</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">用户</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">卡片UID</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">门点</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">类型</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">结果</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(pageSize)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${Math.random() * 40 + 60}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    暂无访问记录
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {format(log.timestamp * 1000, 'MM-dd HH:mm:ss', { locale: zhCN })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary-600" />
                        </div>
                        <span className="font-medium text-gray-800">
                          {log.user_name || '未知用户'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="font-mono text-sm text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                        {log.card_uid}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DoorOpen className="w-4 h-4 text-gray-400" />
                        {log.door_name || '未知门点'}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getEventTypeBadge(log.event_type)}</td>
                    <td className="px-6 py-4">{getResultBadge(log.result)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {log.details || '-'}
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
