import { useState } from 'react';
import { Rule, ConditionGroup, RuleAction } from '../types';
import { useFormStore } from '../store/formStore';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import ConditionBuilder from './ConditionBuilder';
import ActionConfig from './ActionConfig';

export default function RuleList() {
  const { components, rules, addRule, updateRule, deleteRule } = useFormStore();
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [conditions, setConditions] = useState<ConditionGroup>({ type: 'AND', children: [] });
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [showForm, setShowForm] = useState(false);

  const componentOptions = components.map((c) => ({ id: c.id, label: c.label }));

  const handleSave = () => {
    if (!ruleName.trim() || conditions.children.length === 0 || actions.length === 0) return;

    if (editingRule) {
      updateRule(editingRule.id, ruleName, conditions, actions);
    } else {
      addRule(ruleName, conditions, actions);
    }
    resetForm();
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setConditions(rule.conditions);
    setActions(rule.actions);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    deleteRule(id);
  };

  const resetForm = () => {
    setEditingRule(null);
    setRuleName('');
    setConditions({ type: 'AND', children: [] });
    setActions([]);
    setShowForm(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">规则配置</h3>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={16} />
          添加规则
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">
              {editingRule ? '编辑规则' : '新建规则'}
            </span>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">规则名称</label>
              <input
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入规则名称"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">条件配置</label>
              <ConditionBuilder
                components={componentOptions}
                value={conditions}
                onChange={setConditions}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">动作配置</label>
              <ActionConfig
                components={componentOptions}
                actions={actions}
                onChange={setActions}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!ruleName.trim() || conditions.children.length === 0 || actions.length === 0}
                className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={16} />
                保存
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rules.length === 0 ? (
          <p className="text-sm text-gray-400">暂无规则</p>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{rule.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(rule)}
                    className="text-gray-400 hover:text-blue-500"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {rule.conditions.children.length} 个条件 → {rule.actions.length} 个动作
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}