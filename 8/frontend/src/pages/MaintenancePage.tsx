import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Database,
  RefreshCw,
  Download,
  Upload,
  FileJson,
  FileArchive,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileCode,
  X,
  Eye
} from 'lucide-react';
import { maintenanceApi } from '../services/api';
import { MaintenanceStats, BatchImportPreview, BatchImportPreviewItem } from '../types';

export function MaintenancePage() {
  const [stats, setStats] = useState<MaintenanceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchImportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importingBatch, setImportingBatch] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'success' | 'error'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await maintenanceApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleRebuildIndex = async () => {
    setRebuildingIndex(true);
    try {
      const result = await maintenanceApi.rebuildIndex();
      if (result.success) {
        showMessage('success', result.message);
        loadStats();
      } else {
        showMessage('error', '重建索引失败');
      }
    } catch (error: any) {
      showMessage('error', error.response?.data?.detail || '重建索引失败');
    } finally {
      setRebuildingIndex(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await maintenanceApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code_snippets_export_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage('success', '数据导出成功');
    } catch (error) {
      console.error('Export failed:', error);
      showMessage('error', '数据导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await maintenanceApi.importData(file);
      if (result.success) {
        showMessage('success', result.message);
        loadStats();
      } else {
        showMessage('error', '数据导入失败');
      }
    } catch (error: any) {
      showMessage('error', error.response?.data?.detail || '数据导入失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBatchFile(file);
    setBatchPreview(null);
    setSelectedItems(new Set());
  };

  const handlePreviewBatch = async () => {
    if (!batchFile) return;

    setLoadingPreview(true);
    try {
      const preview = await maintenanceApi.previewBatch(batchFile);
      setBatchPreview(preview);
      if (preview.items) {
        const validIndices = preview.items
          .map((item, idx) => item.success ? idx : -1)
          .filter(idx => idx !== -1);
        setSelectedItems(new Set(validIndices));
      }
    } catch (error: any) {
      showMessage('error', error.response?.data?.detail || '预览失败');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImportBatch = async () => {
    if (!batchFile) return;

    setImportingBatch(true);
    try {
      const indices = Array.from(selectedItems);
      const result = await maintenanceApi.importBatch(batchFile, indices.length > 0 ? indices : undefined);
      showMessage('success', `成功导入 ${result.imported_count} 个代码片段${result.skipped_count > 0 ? `，跳过 ${result.skipped_count} 个` : ''}`);
      loadStats();
      setShowBatchImport(false);
      setBatchFile(null);
      setBatchPreview(null);
      setSelectedItems(new Set());
    } catch (error: any) {
      showMessage('error', error.response?.data?.detail || '批量导入失败');
    } finally {
      setImportingBatch(false);
    }
  };

  const toggleItemSelection = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const selectAllValid = () => {
    if (!batchPreview?.items) return;
    const validIndices = batchPreview.items
      .map((item, idx) => item.success ? idx : -1)
      .filter(idx => idx !== -1);
    setSelectedItems(new Set(validIndices));
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const filteredItems = batchPreview?.items?.filter(item => {
    if (activeTab === 'success') return item.success;
    if (activeTab === 'error') return !item.success;
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">数据库维护</h1>
          <p className="text-gray-600">
            管理向量数据库和代码片段数据
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl flex items-center ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-6 h-6 text-green-500 mr-3" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-500 mr-3" />
            )}
            <span className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
              {message.text}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-2">
              <Database className="w-8 h-8 text-blue-500" />
              <h3 className="text-sm font-medium text-gray-500">代码片段总数</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {loadingStats ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                stats?.total_snippets || 0
              )}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-2">
              <Settings className="w-8 h-8 text-purple-500" />
              <h3 className="text-sm font-medium text-gray-500">集合名称</h3>
            </div>
            <p className="text-lg font-semibold text-gray-900 truncate">
              {stats?.collection_name || '-'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center space-x-3 mb-2">
              <RefreshCw className="w-8 h-8 text-amber-500" />
              <h3 className="text-sm font-medium text-gray-500">状态</h3>
            </div>
            <p className="text-lg font-semibold text-green-600">
              运行正常
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900">重建索引</h2>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                重新计算所有代码片段的向量并重建索引。这可能需要一些时间，具体取决于代码片段数量。
              </p>
            </div>
            <div className="p-6 bg-gray-50">
              <button
                onClick={handleRebuildIndex}
                disabled={rebuildingIndex}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {rebuildingIndex ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
                <span>{rebuildingIndex ? '重建中...' : '重建索引'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Download className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-900">导出数据</h2>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                将所有代码片段导出为 JSON 文件，用于备份或迁移。
              </p>
            </div>
            <div className="p-6 bg-gray-50">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {exporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                <span>{exporting ? '导出中...' : '导出为 JSON'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-gray-900">导入数据 (JSON)</h2>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                从 JSON 文件导入代码片段。注意：导入的数据将添加到现有数据中。
              </p>
            </div>
            <div className="p-6 bg-gray-50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleImportClick}
                disabled={importing}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <FileJson className="w-5 h-5" />
                )}
                <span>{importing ? '导入中...' : '选择 JSON 文件'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <FileArchive className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-gray-900">批量导入</h2>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                支持上传 ZIP、TAR 等压缩包，批量解析代码文件并导入。
              </p>
            </div>
            <div className="p-6 bg-gray-50">
              <button
                onClick={() => setShowBatchImport(true)}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
              >
                <FileCode className="w-5 h-5" />
                <span>批量导入代码文件</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-2xl">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">使用说明</h3>
          <ul className="mt-3 space-y-2 text-sm text-blue-800">
            <li className="flex items-start">
              <Settings className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>重建索引：</strong>当更改了向量化模型或需要刷新所有向量时使用</span>
            </li>
            <li className="flex items-start">
              <Download className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>导出数据：</strong>定期备份您的代码片段数据</span>
            </li>
            <li className="flex items-start">
              <Upload className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>导入数据：</strong>从其他实例迁移或恢复备份数据</span>
            </li>
            <li className="flex items-start">
              <FileArchive className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>批量导入：</strong>支持 .zip, .tar, .tar.gz, .7z 等压缩包格式</span>
            </li>
          </ul>
        </div>
      </div>

      {showBatchImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                <FileArchive className="w-5 h-5 mr-2" />
                批量导入代码文件
              </h3>
              <button
                onClick={() => {
                  setShowBatchImport(false);
                  setBatchFile(null);
                  setBatchPreview(null);
                  setSelectedItems(new Set());
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {!batchFile ? (
                <div className="text-center py-12">
                  <FileArchive className="mx-auto w-16 h-16 text-gray-300 mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">选择压缩包文件</h4>
                  <p className="text-sm text-gray-500 mb-6">
                    支持 .zip, .tar, .tar.gz, .7z 等格式，系统将自动解析其中的代码文件
                  </p>
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    accept=".zip,.tar,.tar.gz,.tgz,.7z,.rar"
                    onChange={handleBatchFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => batchFileInputRef.current?.click()}
                    className="inline-flex items-center space-x-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
                  >
                    <Upload className="w-5 h-5" />
                    <span>选择文件</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <FileArchive className="w-8 h-8 text-purple-500" />
                      <div>
                        <p className="font-medium text-gray-900">{batchFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(batchFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handlePreviewBatch}
                        disabled={loadingPreview}
                        className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {loadingPreview ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                        <span>{loadingPreview ? '预览中...' : '预览内容'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setBatchFile(null);
                          setBatchPreview(null);
                          setSelectedItems(new Set());
                          if (batchFileInputRef.current) {
                            batchFileInputRef.current.value = '';
                          }
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                      >
                        更换文件
                      </button>
                    </div>
                  </div>

                  {batchPreview && (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-green-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-green-700">{batchPreview.valid_count}</p>
                          <p className="text-sm text-green-600">有效文件</p>
                        </div>
                        <div className="p-4 bg-red-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-red-700">{batchPreview.error_count}</p>
                          <p className="text-sm text-red-600">无效文件</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-blue-700">{selectedItems.size}</p>
                          <p className="text-sm text-blue-600">已选择导入</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => setActiveTab('all')}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === 'all'
                                  ? 'bg-gray-900 text-white'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              全部 ({batchPreview.items.length})
                            </button>
                            <button
                              onClick={() => setActiveTab('success')}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === 'success'
                                  ? 'bg-green-600 text-white'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              有效 ({batchPreview.valid_count})
                            </button>
                            <button
                              onClick={() => setActiveTab('error')}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === 'error'
                                  ? 'bg-red-600 text-white'
                                  : 'text-red-600 hover:bg-red-50'
                              }`}
                            >
                              无效 ({batchPreview.error_count})
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={selectAllValid}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              全选有效
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={deselectAll}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              取消全选
                            </button>
                          </div>
                        </div>

                        <div className="max-h-80 overflow-auto space-y-2">
                          {filteredItems.map((item) => {
                            const originalIndex = batchPreview.items.indexOf(item);
                            return (
                              <div
                                key={originalIndex}
                                className={`p-3 rounded-xl border transition-all ${
                                  item.success
                                    ? selectedItems.has(originalIndex)
                                      ? 'border-blue-300 bg-blue-50'
                                      : 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                                }`}
                              >
                                <div className="flex items-start space-x-3">
                                  {item.success && (
                                    <input
                                      type="checkbox"
                                      checked={selectedItems.has(originalIndex)}
                                      onChange={() => toggleItemSelection(originalIndex)}
                                      className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2">
                                      <FileCode className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                      <span className="text-sm font-medium text-gray-900 truncate">
                                        {item.file_name}
                                      </span>
                                      <span className={`text-xs px-2 py-0.5 rounded ${
                                        item.success
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}>
                                        {item.success ? '有效' : '无效'}
                                      </span>
                                    </div>
                                    {item.title && (
                                      <p className="text-sm text-gray-600 mt-1">
                                        {item.title}
                                      </p>
                                    )}
                                    {item.language && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        {item.language} · {item.line_count || 0} 行
                                      </p>
                                    )}
                                    {!item.success && item.error && (
                                      <p className="text-xs text-red-600 mt-1">
                                        {item.error}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowBatchImport(false);
                    setBatchFile(null);
                    setBatchPreview(null);
                    setSelectedItems(new Set());
                  }}
                  className="px-6 py-2.5 text-gray-600 hover:text-gray-800 font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleImportBatch}
                  disabled={!batchPreview || selectedItems.size === 0 || importingBatch}
                  className="inline-flex items-center space-x-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {importingBatch ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                  <span>
                    {importingBatch ? '导入中...' : `导入选中的 ${selectedItems.size} 个文件`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaintenancePage;
