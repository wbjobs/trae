import { useState, useEffect } from 'react';
import { Unlock, DoorOpen, Clock, User, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { remoteOpenDoor } from '@/services/api';
import { useAuthStore } from '@/store/useAuthStore';
import clsx from 'clsx';

interface Door {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
}

interface OpenHistory {
  id: string;
  doorName: string;
  operator: string;
  reason: string;
  timestamp: number;
  success: boolean;
}

const mockDoors: Door[] = [
  { id: '1', name: '正门', location: '1楼大厅', status: 'online' },
  { id: '2', name: '后门', location: '1楼后门', status: 'online' },
  { id: '3', name: '服务器机房', location: '3楼机房', status: 'online' },
  { id: '4', name: '财务室', location: '2楼财务区', status: 'offline' },
];

export default function RemoteControl() {
  const user = useAuthStore((state) => state.user);
  const [selectedDoor, setSelectedDoor] = useState<string>('');
  const [reason, setReason] = useState('');
  const [opening, setOpening] = useState(false);
  const [openResult, setOpenResult] = useState<{ success: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<OpenHistory[]>([]);

  const handleOpenDoor = async () => {
    if (!selectedDoor) {
      setOpenResult({ success: false, message: '请选择要打开的门' });
      return;
    }
    if (!reason.trim()) {
      setOpenResult({ success: false, message: '请填写开门原因' });
      return;
    }

    setOpening(true);
    setOpenResult(null);

    try {
      const result = await remoteOpenDoor(selectedDoor, reason);
      const door = mockDoors.find((d) => d.id === selectedDoor);

      if (result.success) {
        setOpenResult({ success: true, message: '开门成功！' });
        setHistory((prev) => [
          {
            id: result.access_log_id || Date.now().toString(),
            doorName: door?.name || '',
            operator: user?.name || user?.username || '',
            reason,
            timestamp: Date.now() / 1000,
            success: true,
          },
          ...prev,
        ]);
        setReason('');
      } else {
        setOpenResult({ success: false, message: '开门失败，请重试' });
      }
    } catch (error: any) {
      setOpenResult({ success: false, message: error.message || '开门失败' });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">远程控制门禁开关，支持临时授权开门</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Unlock className="w-5 h-5 text-primary-600" />
            远程开门
          </h3>

          {openResult && (
            <div
              className={clsx(
                'mb-4 p-4 rounded-lg flex items-start gap-3',
                openResult.success
                  ? 'bg-success-50 border border-success-200'
                  : 'bg-danger-50 border border-danger-200'
              )}
            >
              {openResult.success ? (
                <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={clsx(
                    'font-medium',
                    openResult.success ? 'text-success-800' : 'text-danger-800'
                  )}
                >
                  {openResult.success ? '操作成功' : '操作失败'}
                </p>
                <p className={clsx('text-sm', openResult.success ? 'text-success-600' : 'text-danger-600')}>
                  {openResult.message}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                选择门禁
              </label>
              <div className="grid grid-cols-2 gap-3">
                {mockDoors.map((door) => (
                  <button
                    key={door.id}
                    onClick={() => door.status === 'online' && setSelectedDoor(door.id)}
                    disabled={door.status === 'offline'}
                    className={clsx(
                      'p-4 rounded-lg border text-left transition-all',
                      selectedDoor === door.id
                        ? 'border-primary-500 bg-primary-50'
                        : door.status === 'online'
                        ? 'border-gray-200 hover:border-gray-300'
                        : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">{door.name}</span>
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full',
                          door.status === 'online' ? 'bg-success-500' : 'bg-gray-400'
                        )}
                      />
                    </div>
                    <p className="text-sm text-gray-500">{door.location}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                开门原因 <span className="text-danger-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请填写开门原因，例如：访客临时进入"
                rows={3}
                className="input-field resize-none"
              />
            </div>

            <button
              onClick={handleOpenDoor}
              disabled={opening || !selectedDoor}
              className={clsx(
                'w-full btn-primary py-3 text-lg',
                (opening || !selectedDoor) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {opening ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  开门中...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Unlock className="w-5 h-5" />
                  确认开门
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-600" />
            最近操作记录
          </h3>

          <div className="space-y-4">
            {history.length === 0 ? (
              <p className="text-center text-gray-500 py-12">暂无操作记录</p>
            ) : (
              history.map((item) => (
                <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0">
                  <div
                    className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      item.success ? 'bg-success-100' : 'bg-danger-100'
                    )}
                  >
                    {item.success ? (
                      <CheckCircle className="w-5 h-5 text-success-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-danger-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{item.doorName}</span>
                      <span
                        className={clsx(
                          'status-badge',
                          item.success
                            ? 'bg-success-100 text-success-700'
                            : 'bg-danger-100 text-danger-700'
                        )}
                      >
                        {item.success ? '成功' : '失败'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{item.reason}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.operator} · {format(item.timestamp * 1000, 'MM-dd HH:mm:ss', { locale: zhCN })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">安全提示</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-warning-50">
            <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">操作留痕</p>
              <p className="text-sm text-gray-600 mt-1">所有远程开门操作都会被记录，请谨慎使用</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary-50">
            <Clock className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">时效限制</p>
              <p className="text-sm text-gray-600 mt-1">远程开门仅单次有效，开门后需重新验证</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-success-50">
            <DoorOpen className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">实时反馈</p>
              <p className="text-sm text-gray-600 mt-1">开门结果会立即反馈并同步到日志系统</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
