import { useState } from 'react';
import { useFormStore } from '../store/formStore';
import { formApi, ruleApi } from '../utils/api';
import { EvaluationLog } from '../utils/ruleEvaluator';
import ComponentPanel from './ComponentPanel';
import Canvas from './Canvas';
import PropertyPanel from './PropertyPanel';
import RuleList from './RuleList';
import FormPreview from './FormPreview';
import DebugPanel from './DebugPanel';
import { Save, Eye, Download, Upload, FileText, Bug } from 'lucide-react';

export default function FormEditor() {
  const { formName, updateFormName, components, rules, clearForm, setComponents, setRules } = useFormStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [localLogs, setLocalLogs] = useState<EvaluationLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'canvas' | 'rules'>('canvas');

  const handleSave = async () => {
    if (!formName.trim()) {
      setMessage('请输入表单名称');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    if (components.length === 0) {
      setMessage('请至少添加一个组件');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setSaving(true);
    try {
      const form = await formApi.create(formName, components);
      for (const rule of rules) {
        await ruleApi.create(form.id, rule.name, rule.conditions, rule.actions);
      }
      setMessage('保存成功！');
      setTimeout(() => {
        setMessage('');
        clearForm();
      }, 2000);
    } catch (error) {
      setMessage('保存失败，请重试');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const data = {
      name: formName,
      components,
      rules,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formName || 'form'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        updateFormName(data.name || '');
        setComponents(data.components || []);
        setRules(data.rules || []);
        setMessage('导入成功！');
        setTimeout(() => setMessage(''), 3000);
      } catch {
        setMessage('导入失败，文件格式错误');
        setTimeout(() => setMessage(''), 3000);
      }
    };
    reader.readAsText(file);
  };

  const handleDebugLogs = (logs: EvaluationLog[]) => {
    setLocalLogs((prev) => [...logs, ...prev]);
  };

  const toggleDebugMode = () => {
    setDebugMode((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-500" size={28} />
            <div>
              <h1 className="text-xl font-bold text-gray-800">低代码表单平台</h1>
              <p className="text-xs text-gray-500">拖拽式表单编辑器 + 规则引擎</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={formName}
              onChange={(e) => updateFormName(e.target.value)}
              placeholder="表单名称"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-64"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
            >
              <Save size={16} />
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={toggleDebugMode}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                debugMode 
                  ? 'bg-orange-500 text-white hover:bg-orange-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Bug size={16} />
              {debugMode ? '关闭调试' : '调试模式'}
            </button>
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Eye size={16} />
              预览
            </button>
            <button
              onClick={() => setDebugOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              <Bug size={16} />
              调试面板
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors cursor-pointer">
              <Upload size={16} />
              导入
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              <Download size={16} />
              导出
            </button>
          </div>
        </div>
        {message && (
          <div className={`text-center py-2 text-sm ${message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-2">
            <ComponentPanel />
          </div>
          
          <div className="col-span-7">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="flex border-b">
                <button
                  onClick={() => setActiveTab('canvas')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'canvas' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  表单设计
                </button>
                <button
                  onClick={() => setActiveTab('rules')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'rules' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  规则配置
                </button>
              </div>
              <div className="p-4">
                {activeTab === 'canvas' ? <Canvas /> : <RuleList />}
              </div>
            </div>
          </div>

          <div className="col-span-3">
            <PropertyPanel />
          </div>
        </div>
      </main>

      <FormPreview 
        isOpen={previewOpen} 
        onClose={() => setPreviewOpen(false)}
        debugMode={debugMode}
        onDebugLogs={handleDebugLogs}
      />
      
      <DebugPanel 
        isOpen={debugOpen} 
        onClose={() => setDebugOpen(false)}
        localLogs={localLogs}
      />
    </div>
  );
}