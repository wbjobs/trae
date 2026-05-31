import { useState, useEffect } from 'react';
import { FormComponent, Rule } from '../types';
import { evaluateRules, EvaluationLog } from '../utils/ruleEvaluator';

interface FormRendererProps {
  components: FormComponent[];
  rules: Rule[];
  onSubmit: (data: Record<string, unknown>) => void;
  debugMode?: boolean;
  onDebugLogs?: (logs: EvaluationLog[]) => void;
}

export default function FormRenderer({ components, rules, onSubmit, debugMode = false, onDebugLogs }: FormRendererProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [componentEffects, setComponentEffects] = useState<Record<string, { hidden?: boolean; disabled?: boolean }>>({});

  useEffect(() => {
    const { effects, logs } = evaluateRules(rules, formData, debugMode);
    setComponentEffects(effects);
    
    if (debugMode && onDebugLogs && logs.length > 0) {
      onDebugLogs(logs);
    }
  }, [formData, rules, debugMode, onDebugLogs]);

  const handleChange = (id: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (debugMode) {
      const { logs } = evaluateRules(rules, formData, true);
      if (onDebugLogs && logs.length > 0) {
        onDebugLogs(logs);
      }
    }
    
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {components.map((component) => {
        const effects = componentEffects[component.id] || {};
        if (effects.hidden) return null;

        return (
          <div key={component.id} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {component.type === 'input' && (
              <input
                type="text"
                value={String(formData[component.id] || '')}
                onChange={(e) => handleChange(component.id, e.target.value)}
                disabled={effects.disabled}
                placeholder={component.placeholder}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
            )}
            {component.type === 'select' && (
              <select
                value={String(formData[component.id] || '')}
                onChange={(e) => handleChange(component.id, e.target.value)}
                disabled={effects.disabled}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                {component.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {component.type === 'date' && (
              <input
                type="date"
                value={String(formData[component.id] || '')}
                onChange={(e) => handleChange(component.id, e.target.value)}
                disabled={effects.disabled}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
            )}
          </div>
        );
      })}
      <button
        type="submit"
        disabled={componentEffects['submit']?.disabled}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        提交
      </button>
    </form>
  );
}