import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, XCircle, Activity, ArrowUpRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getDashboardStats, getRecentAccessLogs } from '@/services/api';
import { AccessLog } from '@/types';
import clsx from 'clsx';

interface Stats {
  totalCards: number;
  activeCards: number;
  todayAccessCount: number;
  todayAllowedCount: number;
  todayDeniedCount: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, logsData] = await Promise.all([
        getDashboardStats(),
        getRecentAccessLogs(10),
      ]);
      setStats(statsData);
      setRecentLogs(logsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: '总卡片数',
      value: stats.totalCards,
      icon: CreditCard,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
    },
    {
      label: '活跃卡片',
      value: stats.activeCards,
      icon: CheckCircle,
      color: 'text-success-600',
      bgColor: 'bg-success-50',
    },
    {
      label: '今日开门成功',
      value: stats.todayAllowedCount,
      icon: ArrowUpRight,
      color: 'text-success-600',
      bgColor: 'bg-success-50',
    },
    {
      label: '今日开门失败',
      value: stats.todayDeniedCount,
      icon: XCircle,
      color: 'text-danger-600',
      bgColor: 'bg-danger-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
                </div>
                <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', stat.bgColor)}>
                  <Icon className={clsx('w-6 h-6', stat.color)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">最近事件</h2>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {recentLogs.length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无事件记录</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-4">
                  <div
                    className={clsx(
                      'w-2 h-2 rounded-full mt-2 flex-shrink-0',
                      log.result === 'allowed' ? 'bg-success-500' : 'bg-danger-500'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 truncate">
                        {log.user_name || '未知用户'}
                      </span>
                      <span
                        className={clsx(
                          'status-badge',
                          log.result === 'allowed'
                            ? 'bg-success-100 text-success-700'
                            : 'bg-danger-100 text-danger-700'
                        )}
                      >
                        {log.result === 'allowed' ? '允许' : '拒绝'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {log.door_name} · {log.card_uid}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {format(log.timestamp * 1000, 'MM-dd HH:mm:ss', { locale: zhCN })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">系统状态</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success-100 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-success-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">服务连接</p>
                  <p className="text-sm text-gray-500">正常运行中</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-success-600">
                <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                在线
              </span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">NFC读卡器</p>
                  <p className="text-sm text-gray-500">PN532</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-success-600">
                <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                已连接
              </span>
            </div>

            <div className="p-4 rounded-lg bg-primary-50 border border-primary-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">今日有效时间段</p>
                  <p className="text-sm text-gray-600 mt-1">
                    周一至周五 09:00 - 18:00
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    当前时间: {format(new Date(), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
