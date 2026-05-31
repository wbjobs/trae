import { Type, List, Calendar } from 'lucide-react';
import { useFormStore } from '../store/formStore';

const componentTypes = [
  { type: 'input' as const, label: '文本输入', icon: Type },
  { type: 'select' as const, label: '下拉选择', icon: List },
  { type: 'date' as const, label: '日期选择', icon: Calendar },
];

export default function ComponentPanel() {
  const addComponent = useFormStore((state) => state.addComponent);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">组件库</h3>
      <div className="space-y-2">
        {componentTypes.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => addComponent(type)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors text-sm"
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}