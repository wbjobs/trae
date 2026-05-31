import { useFormStore } from '../store/formStore';
import { X } from 'lucide-react';

export default function PropertyPanel() {
  const { components, selectedComponentId, updateComponent, selectComponent } = useFormStore();

  const selectedComponent = components.find((c) => c.id === selectedComponentId);

  if (!selectedComponent) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">属性配置</h3>
        <p className="text-sm text-gray-400">请选择一个组件</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">属性配置</h3>
        <button
          onClick={() => selectComponent(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">标签</label>
          <input
            type="text"
            value={selectedComponent.label}
            onChange={(e) => updateComponent(selectedComponent.id, { label: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">占位符</label>
          <input
            type="text"
            value={selectedComponent.placeholder || ''}
            onChange={(e) => updateComponent(selectedComponent.id, { placeholder: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="required"
            checked={selectedComponent.required}
            onChange={(e) => updateComponent(selectedComponent.id, { required: e.target.checked })}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <label htmlFor="required" className="ml-2 text-sm text-gray-700">
            必填字段
          </label>
        </div>

        {selectedComponent.type === 'select' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">选项配置</label>
            <div className="space-y-2">
              {selectedComponent.options?.map((opt, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="值"
                    value={opt.value}
                    onChange={(e) => {
                      const newOptions = [...(selectedComponent.options || [])];
                      newOptions[index] = { ...newOptions[index], value: e.target.value };
                      updateComponent(selectedComponent.id, { options: newOptions });
                    }}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="显示文本"
                    value={opt.label}
                    onChange={(e) => {
                      const newOptions = [...(selectedComponent.options || [])];
                      newOptions[index] = { ...newOptions[index], label: e.target.value };
                      updateComponent(selectedComponent.id, { options: newOptions });
                    }}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
                  />
                </div>
              ))}
              <button
                onClick={() => {
                  const newOptions = [...(selectedComponent.options || []), { value: '', label: '' }];
                  updateComponent(selectedComponent.id, { options: newOptions });
                }}
                className="w-full px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
              >
                + 添加选项
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}