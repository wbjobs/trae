import { useState } from 'react';
import { Condition, ConditionGroup, ComparisonOperator, LogicalOperator } from '../types';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

interface ConditionBuilderProps {
  components: { id: string; label: string }[];
  value: ConditionGroup;
  onChange: (value: ConditionGroup) => void;
}

const operators: ComparisonOperator[] = ['>', '<', '==', '!=', 'contains'];
const logicalOperators: LogicalOperator[] = ['AND', 'OR'];

function ConditionItem({
  components,
  condition,
  onChange,
  onDelete,
}: {
  components: { id: string; label: string }[];
  condition: Condition;
  onChange: (condition: Condition) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={condition.fieldId}
        onChange={(e) => onChange({ ...condition, fieldId: e.target.value })}
        className="px-2 py-1 border border-gray-200 rounded text-sm"
      >
        {components.map((comp) => (
          <option key={comp.id} value={comp.id}>
            {comp.label}
          </option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as ComparisonOperator })}
        className="px-2 py-1 border border-gray-200 rounded text-sm"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={String(condition.value)}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        className="px-2 py-1 border border-gray-200 rounded text-sm"
        placeholder="值"
      />
      <button onClick={onDelete} className="text-red-500 hover:text-red-600">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function GroupItem({
  components,
  group,
  onChange,
  level = 0,
}: {
  components: { id: string; label: string }[];
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  const handleAddCondition = () => {
    const newCondition: Condition = {
      fieldId: components[0]?.id || '',
      operator: '==',
      value: '',
    };
    onChange({ ...group, children: [...group.children, newCondition] });
  };

  const handleAddGroup = () => {
    const newGroup: ConditionGroup = {
      type: 'AND',
      children: [],
    };
    onChange({ ...group, children: [...group.children, newGroup] });
  };

  const handleUpdateChild = (index: number, child: Condition | ConditionGroup) => {
    const newChildren = [...group.children];
    newChildren[index] = child;
    onChange({ ...group, children: newChildren });
  };

  const handleDeleteChild = (index: number) => {
    const newChildren = group.children.filter((_, i) => i !== index);
    onChange({ ...group, children: newChildren });
  };

  return (
    <div style={{ marginLeft: `${level * 20}px` }}>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setExpanded(!expanded)} className="text-gray-500">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <select
          value={group.type}
          onChange={(e) => onChange({ ...group, type: e.target.value as LogicalOperator })}
          className="px-2 py-1 border border-gray-200 rounded text-sm"
        >
          {logicalOperators.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">条件组</span>
      </div>
      {expanded && (
        <div className="space-y-2">
          {group.children.map((child, index) =>
            'children' in child ? (
              <GroupItem
                key={`group-${index}`}
                components={components}
                group={child}
                onChange={(newGroup) => handleUpdateChild(index, newGroup)}
                level={level + 1}
              />
            ) : (
              <ConditionItem
                key={`cond-${index}`}
                components={components}
                condition={child}
                onChange={(newCondition) => handleUpdateChild(index, newCondition)}
                onDelete={() => handleDeleteChild(index)}
              />
            )
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAddCondition}
              className="px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
            >
              + 添加条件
            </button>
            <button
              onClick={handleAddGroup}
              className="px-2 py-1 text-xs text-green-600 border border-green-200 rounded hover:bg-green-50"
            >
              + 添加分组
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConditionBuilder({ components, value, onChange }: ConditionBuilderProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <GroupItem components={components} group={value} onChange={onChange} />
    </div>
  );
}