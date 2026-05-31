import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";
import { Rule } from "../types";
import { Plus, Trash2, Edit2, Save, X, Play, TestTube } from "lucide-react";

interface EditState {
  isEditing: boolean;
  rule: Rule | null;
}

export default function RulesPanel() {
  const { rules, scripts, addRule, updateRule, deleteRule } = useAppStore();
  const [editState, setEditState] = useState<EditState>({
    isEditing: false,
    rule: null,
  });
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<{
    ruleName: string;
    matches: string[];
  } | null>(null);

  const createNewRule = (): Rule => ({
    id: Date.now().toString(),
    name: "",
    pattern: "",
    enabled: true,
    case_insensitive: false,
    script_id: "",
  });

  const handleEdit = (rule: Rule) => {
    setEditState({ isEditing: true, rule: { ...rule } });
  };

  const handleSave = () => {
    if (!editState.rule) return;

    const existing = rules.find((r) => r.id === editState.rule!.id);
    if (existing) {
      updateRule(editState.rule);
    } else {
      addRule(editState.rule);
    }

    syncRulesToBackend();
    setEditState({ isEditing: false, rule: null });
  };

  const handleCancel = () => {
    setEditState({ isEditing: false, rule: null });
  };

  const handleDelete = async (id: string) => {
    deleteRule(id);
    syncRulesToBackend();
  };

  const toggleEnabled = (rule: Rule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    updateRule(updated);
    syncRulesToBackend();
  };

  const syncRulesToBackend = async () => {
    await invoke("sync_rules", { rules });
  };

  const testRules = async () => {
    if (!testText.trim()) return;
    const result = await invoke<{
      rule_name: string;
      matches: string[];
    }>("test_rules_with_text", { text: testText });
    setTestResult({
      ruleName: result.rule_name,
      matches: result.matches,
    });
  };

  const renderRuleEditor = () => {
    if (!editState.rule) return null;
    const rule = editState.rule;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg mx-4 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">
              {rules.find((r) => r.id === rule.id) ? "编辑规则" : "新建规则"}
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                规则名称
              </label>
              <input
                type="text"
                value={rule.name}
                onChange={(e) =>
                  setEditState({
                    ...editState,
                    rule: { ...rule, name: e.target.value },
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
                placeholder="例如：错误码检测"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                正则表达式
              </label>
              <input
                type="text"
                value={rule.pattern}
                onChange={(e) =>
                  setEditState({
                    ...editState,
                    rule: { ...rule, pattern: e.target.value },
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary font-mono text-sm"
                placeholder="例如：错误码[:：]\\s*0x[0-9a-fA-F]+"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                触发脚本
              </label>
              <select
                value={rule.script_id}
                onChange={(e) =>
                  setEditState({
                    ...editState,
                    rule: { ...rule, script_id: e.target.value },
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
              >
                <option value="">不执行脚本（仅记录）</option>
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.case_insensitive}
                  onChange={(e) =>
                    setEditState({
                      ...editState,
                      rule: { ...rule, case_insensitive: e.target.checked },
                    })
                  }
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-300">忽略大小写</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
            >
              <Save size={16} />
              保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">规则管理</h2>
          <p className="text-sm text-gray-400">
            配置正则表达式规则，当 OCR 识别到匹配内容时自动触发脚本
          </p>
        </div>
        <button
          onClick={() =>
            setEditState({ isEditing: true, rule: createNewRule() })
          }
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
        >
          <Plus size={18} />
          新建规则
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <TestTube size={18} className="text-secondary" />
          <span className="font-medium">测试规则</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="输入测试文本，例如：错误码: 0x78"
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
          />
          <button
            onClick={testRules}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <Play size={16} />
            测试
          </button>
        </div>
        {testResult && (
          <div className="mt-3 p-3 bg-gray-900 rounded-lg">
            {testResult.matches.length > 0 ? (
              <div>
                <div className="text-primary text-sm mb-1">
                  ✅ 匹配规则: {testResult.ruleName}
                </div>
                <div className="text-gray-300 text-sm">
                  匹配内容: {testResult.matches.join(", ")}
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-sm">未匹配任何规则</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto space-y-3">
        {rules.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            暂无规则，点击上方按钮创建第一个规则
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-4 rounded-lg border transition-colors ${
                rule.enabled
                  ? "bg-gray-800 border-gray-700"
                  : "bg-gray-800/50 border-gray-700/50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleEnabled(rule)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        rule.enabled ? "bg-primary" : "bg-gray-600"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          rule.enabled ? "left-5" : "left-0.5"
                        }`}
                      />
                    </button>
                    <span className="font-medium">{rule.name || "未命名规则"}</span>
                  </div>
                  <div className="mt-2 font-mono text-sm text-gray-400">
                    /{rule.pattern}/
                    {rule.case_insensitive && (
                      <span className="text-primary">i</span>
                    )}
                  </div>
                  {rule.script_id && (
                    <div className="mt-2 text-xs text-secondary">
                      → 执行脚本:{" "}
                      {scripts.find((s) => s.id === rule.script_id)?.name ||
                        "未知脚本"}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editState.isEditing && renderRuleEditor()}
    </div>
  );
}
