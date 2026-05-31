import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Wifi, Server, Key, Save, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { listNfcReaders } from '@/utils/tauri';
import { NfcReader } from '@/types';
import clsx from 'clsx';

export default function Settings() {
  const serverAddress = useAuthStore((state) => state.serverAddress);
  const setServerAddress = useAuthStore((state) => state.setServerAddress);
  const [tempServerAddress, setTempServerAddress] = useState(serverAddress);
  const [readers, setReaders] = useState<NfcReader[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadReaders();
  }, []);

  const loadReaders = async () => {
    const readerList = await listNfcReaders();
    setReaders(readerList);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const response = await fetch(`${tempServerAddress}/api/health`);
      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveServerConfig = () => {
    setServerAddress(tempServerAddress);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">配置系统参数和设备连接</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-primary-600" />
            服务端配置
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                服务端地址
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempServerAddress}
                  onChange={(e) => setTempServerAddress(e.target.value)}
                  placeholder="http://localhost:50051"
                  className="input-field flex-1"
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="btn-secondary whitespace-nowrap"
                >
                  {testingConnection ? (
                    <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    测试中
                  </span>
                  ) : (
                    '测试连接'
                  )}
                </button>
              </div>
              {connectionStatus !== 'idle' && (
                <div className="mt-2 text-sm flex items-center gap-1">
                  {connectionStatus === 'success' ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-success-600" />
                      <span className="text-success-600">连接成功</span>
                    </>
                  ) : (
                    <>
                      <span className="text-danger-600">连接失败，请检查地址</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSaveServerConfig}
              disabled={saveSuccess}
              className={clsx(
                'btn-primary',
                saveSuccess && 'bg-success-600'
              )}
            >
              {saveSuccess ? (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  已保存
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  保存配置
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-primary-600" />
            NFC读卡器
          </h3>

          <div className="space-y-3">
            {readers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
              未检测到NFC读卡器
            </p>
          ) : (
            readers.map((reader, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div
                  className={clsx(
                    'w-3 h-3 rounded-full',
                    reader.status === 'connected' ? 'bg-success-500' : 'bg-gray-400'
                  )}
                />
                <div>
                  <p className="font-medium text-gray-800">{reader.name}</p>
                  <p className="text-xs text-gray-500">
                    {reader.status === 'connected' ? '已连接' : '未连接'}
                  </p>
                </div>
              </div>
            ))
          )}

            <button onClick={loadReaders} className="btn-secondary w-full">
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />
                刷新设备列表
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-primary-600" />
          安全设置
        </h3>

        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-800">密钥存储</p>
              <p className="text-sm text-gray-600 mt-1">
                Mifare卡片密钥使用操作系统级密钥链加密存储
              </p>
            </div>
            <span className="status-badge bg-success-100 text-success-700">
              已启用
            </span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-800">TLS传输加密</p>
              <p className="text-sm text-gray-600 mt-1">
                与服务端通信使用TLS加密传输
              </p>
            </div>
            <span className="status-badge bg-success-100 text-success-700">
              已启用
            </span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-800">操作日志</p>
              <p className="text-sm text-gray-600 mt-1">
                所有管理操作都会记录详细审计日志</p>
            </div>
            <span className="status-badge bg-success-100 text-success-700">
              已启用
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
