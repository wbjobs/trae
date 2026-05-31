import { useState, useEffect } from 'react';
import { debugApi, DebugLog } from '../utils/api';
import { EvaluationLog } from '../utils/ruleEvaluator';
import { Bug, RefreshCw, Trash2, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle } from 'lucide-react';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  localLogs: EvaluationLog[];
}

export default function DebugPanel({ isOpen, onClose, localLogs }: DebugPanelProps) {
  const [serverLogs, setServerLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const logs = await debugApi.getLogs();
      setServerLogs(logs);
    } catch (error) {
      console.error('Failed to fetch debug logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      await debugApi.clearLogs();
      setServerLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedLogs(newExpanded);
  };

  if (!isOpen) return null;

  const allLogs = [...localLogs.map((log, idx) => ({ ...log, uniqueId: `local-${idx}`, isLocal: true })), ...serverLogs.map(log => ({ ...log, uniqueId: log.id, isLocal: false }))];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Bug className="text-orange-500" size={20} />
            <h3 className="font-semibold text-gray-800">规则调试面板</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <RefreshCw size={14} />
              刷新
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
            >
              <Trash2 size={14} />
              清空
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <ChevronDown size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          {allLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Bug size={48} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无调试日志</p>
              <p className="text-xs mt-1">开启调试模式后，规则执行日志将显示在这里</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allLogs.map((log) => (
                <div
                  key={log.uniqueId}
                  className={`border rounded-lg overflow-hidden ${
                    log.conditionResult ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-opacity-50"
                    onClick={() => toggleExpand(log.uniqueId)}
                  >
                    <button className="text-gray-500">
                      {expandedLogs.has(log.uniqueId) ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                    {log.conditionResult ? (
                      <CheckCircle className="text-green-500" size={16} />
                    ) : (
                      <XCircle className="text-red-500" size={16} />
                    )}
                    <div className="flex-1">
                      <span className="font-medium text-gray-800">
                        {log.isLocal ? '本地' : '服务器'} - {log.ruleName}
                      </span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                        log.conditionResult ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'
                      }`}>
                        {log.conditionResult ? '已触发' : '未触发'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>{log.executionTime}ms</span>
                    </div>
                    {log.isLocal && (
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                        本地调试
                      </span>
                    )}
                  </div>

                  {expandedLogs.has(log.uniqueId) && (
                    <div className="px-3 pb-3 border-t border-gray-200 pt-3">
                      <div className="mb-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">条件评估</label>
                        <pre className="text-xs text-gray-700 bg-white p-2 rounded border font-mono overflow-x-auto">
                          {Array.isArray(log.conditionsEvaluated) 
                            ? log.conditionsEvaluated.join('\n') 
                            : log.conditionsEvaluated}
                        </pre>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">执行动作</label>
                        <div className="text-xs text-gray-700 bg-white p-2 rounded border">
                          {Array.isArray(log.actionsExecuted) && log.actionsExecuted.length > 0
                            ? log.actionsExecuted.join(', ')
                            : log.actionsExecuted}
                        </div>
                      </div>
                      {'formData' in log && log.formData && (
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">表单数据</label>
                          <pre className="text-xs text-gray-700 bg-white p-2 rounded border font-mono overflow-x-auto">
                            {JSON.stringify(log.formData, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}