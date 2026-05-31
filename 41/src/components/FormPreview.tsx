import { useState } from 'react';
import { useFormStore } from '../store/formStore';
import FormRenderer from './FormRenderer';
import { Eye, X, Bug } from 'lucide-react';
import { EvaluationLog } from '../utils/ruleEvaluator';

interface FormPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  debugMode?: boolean;
  onDebugLogs?: (logs: EvaluationLog[]) => void;
}

export default function FormPreview({ isOpen, onClose, debugMode = false, onDebugLogs }: FormPreviewProps) {
  const { components, rules, formName } = useFormStore();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      console.log('Form data submitted:', data);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Eye size={20} className="text-blue-500" />
            <h3 className="font-semibold text-gray-700">表单预览</h3>
            {debugMode && (
              <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                <Bug size={12} />
                调试模式
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <h4 className="text-lg font-medium text-gray-800 mb-4">{formName || '未命名表单'}</h4>
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-8 text-green-500">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-sm">提交成功！</p>
            </div>
          ) : (
            <FormRenderer 
              components={components} 
              rules={rules} 
              onSubmit={handleSubmit}
              debugMode={debugMode}
              onDebugLogs={onDebugLogs}
            />
          )}
        </div>
      </div>
    </div>
  );
}