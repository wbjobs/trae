import { RuleAction, ActionType } from '../types';
import { Plus, Trash2 } from 'lucide-react';

interface ActionConfigProps {
  components: { id: string; label: string }[];
  actions: RuleAction[];
  onChange: (actions: RuleAction[]) => void;
}

const actionTypes: ActionType[] = ['hide', 'show', 'disable', 'enable'];

const actionLabels: Record<ActionType, string> = {
  hide: '隐藏',
  show: '显示',
  disable: '禁用',
  enable: '启用',
};

export default function ActionConfig({ components, actions, onChange }: ActionConfigProps) {
  const handleAddAction = () => {
    const newAction: RuleAction = {
      type: 'hide',
      targetFieldId: components[0]?.id || '',
    };
    onChange([...actions, newAction]);
  };

  const handleUpdateAction = (index: number, updates: Partial<RuleAction>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onChange(newActions);
  };

  const handleDeleteAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="space-y-2">
        {actions.map((action, index) => (
          <div key={index} className="flex items-center gap-2 flex-wrap">
            <select
              value={action.type}
              onChange={(e) => handleUpdateAction(index, { type: e.target.value as ActionType })}
              className="px-2 py-1 border border-gray-200 rounded text-sm"
            >
              {actionTypes.map((type) => (
                <option key={type} value={type}>
                  {actionLabels[type]}
                </option>
              ))}
            </select>
            <select
              value={action.targetFieldId}
              onChange={(e) => handleUpdateAction(index, { targetFieldId: e.target.value })}
              className="px-2 py-1 border border-gray-200 rounded text-sm"
            >
              {components.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.label}
                </option>
              ))}
            </select>
            <button onClick={() => handleDeleteAction(index)} className="text-red-500 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          onClick={handleAddAction}
          className="w-full px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
        >
          + 添加动作
        </button>
      </div>
    </div>
  );
}