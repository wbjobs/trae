import { useFormStore } from '../store/formStore';
import { FormComponent } from '../types';
import { Trash2 } from 'lucide-react';

function DraggableComponent({ component }: { component: FormComponent }) {
  const selectedComponentId = useFormStore((state) => state.selectedComponentId);
  const selectComponent = useFormStore((state) => state.selectComponent);
  const deleteComponent = useFormStore((state) => state.deleteComponent);

  const isSelected = selectedComponentId === component.id;

  return (
    <div
      onClick={() => selectComponent(component.id)}
      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{component.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteComponent(component.id);
          }}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="space-y-1">
        {component.type === 'input' && (
          <input
            type="text"
            disabled
            placeholder={component.placeholder || '请输入...'}
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
          />
        )}
        {component.type === 'select' && (
          <select
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
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
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
          />
        )}
      </div>
      {component.required && (
        <span className="text-xs text-red-500">* 必填</span>
      )}
    </div>
  );
}

export default function Canvas() {
  const components = useFormStore((state) => state.components);

  return (
    <div className="bg-gray-50 rounded-lg p-6 min-h-[400px]">
      {components.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <div className="text-4xl mb-2">📋</div>
          <p className="text-sm">点击左侧组件添加到画布</p>
        </div>
      ) : (
        <div className="space-y-4">
          {components.map((component) => (
            <DraggableComponent key={component.id} component={component} />
          ))}
        </div>
      )}
    </div>
  );
}