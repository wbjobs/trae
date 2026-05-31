import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";
import { Script, ScriptAction, HttpAction, KeyboardAction, ShellAction } from "../types";
import { Plus, Trash2, Edit2, Save, X, Play, Globe, Keyboard, Terminal } from "lucide-react";

interface EditState {
  isEditing: boolean;
  script: Script | null;
}

export default function ScriptsPanel() {
  const { scripts, addScript, updateScript, deleteScript } = useAppStore();
  const [editState, setEditState] = useState<EditState>({
    isEditing: false,
    script: null,
  });

  const createNewScript = (): Script => ({
    id: Date.now().toString(),
    name: "",
    description: "",
    actions: [],
    timeout: 5000,
  });

  const handleEdit = (script: Script) => {
    setEditState({ isEditing: true, script: JSON.parse(JSON.stringify(script)) });
  };

  const handleSave = () => {
    if (!editState.script) return;

    const existing = scripts.find((s) => s.id === editState.script!.id);
    if (existing) {
      updateScript(editState.script);
    } else {
      addScript(editState.script);
    }

    syncScriptsToBackend();
    setEditState({ isEditing: false, script: null });
  };

  const syncScriptsToBackend = async () => {
    await invoke("sync_scripts", { scripts });
  };

  const addAction = (type: ScriptAction["type"]) => {
    if (!editState.script) return;

    let newAction: ScriptAction;
    switch (type) {
      case "http":
        newAction = {
          type: "http",
          config: {
            method: "POST",
            url: "",
            headers: {},
            body: "",
            use_capture_groups: true,
          } as HttpAction,
        };
        break;
      case "keyboard":
        newAction = {
          type: "keyboard",
          config: {
            keys: [],
            modifiers: [],
          } as KeyboardAction,
        };
        break;
      case "shell":
        newAction = {
          type: "shell",
          config: {
            command: "",
            args: [],
          } as ShellAction,
        };
        break;
    }

    setEditState({
      ...editState,
      script: {
        ...editState.script,
        actions: [...editState.script.actions, newAction],
      },
    });
  };

  const removeAction = (index: number) => {
    if (!editState.script) return;
    const actions = editState.script.actions.filter((_, i) => i !== index);
    setEditState({
      ...editState,
      script: { ...editState.script, actions },
    });
  };

  const testScript = async (script: Script) => {
    await invoke("test_script", { script });
  };

  const actionTypeIcons = {
    http: <Globe size={16} />,
    keyboard: <Keyboard size={16} />,
    shell: <Terminal size={16} />,
  };

  const actionTypeLabels = {
    http: "HTTP 请求",
    keyboard: "键盘操作",
    shell: "Shell 命令",
  };

  const renderScriptEditor = () => {
    if (!editState.script) return null;
    const script = editState.script;

    const updateAction = (index: number, updates: Partial<ScriptAction>) => {
      const actions = script.actions.map((a, i) =>
        i === index ? { ...a, ...updates } : a
      );
      setEditState({ ...editState, script: { ...script, actions } });
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
        <div className="bg-gray-800 rounded-xl p-6 w-full max-w-2xl mx-4 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">
              {scripts.find((s) => s.id === script.id) ? "编辑脚本" : "新建脚本"}
            </h2>
            <button
              onClick={() => setEditState({ isEditing: false, script: null })}
              className="text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                脚本名称
              </label>
              <input
                type="text"
                value={script.name}
                onChange={(e) =>
                  setEditState({
                    ...editState,
                    script: { ...script, name: e.target.value },
                  })
                }
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
                placeholder="脚本名称"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                描述
              </label>
              <textarea
                value={script.description}
                onChange={(e) =>
                  setEditState({
                    ...editState,
                    script: { ...script, description: e.target.value },
                  })
                }
                rows={2}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
                placeholder="脚本描述"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-300">操作列表</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => addAction("http")}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-primary/20 text-primary rounded-lg hover:bg-primary/30"
                  >
                    <Globe size={14} /> HTTP
                  </button>
                  <button
                    onClick={() => addAction("keyboard")}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-secondary/20 text-secondary rounded-lg hover:bg-secondary/30"
                  >
                    <Keyboard size={14} /> 键盘
                  </button>
                  <button
                    onClick={() => addAction("shell")}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500/30"
                  >
                    <Terminal size={14} /> Shell
                  </button>
                </div>
              </div>

              {script.actions.length === 0 ? (
                <div className="text-center text-gray-500 py-8 border border-dashed border-gray-600 rounded-lg">
                  点击上方按钮添加操作
                </div>
              ) : (
                <div className="space-y-3">
                  {script.actions.map((action, index) => (
                    <div
                      key={index}
                      className="p-4 bg-gray-700 rounded-lg border border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {actionTypeIcons[action.type]}
                          {index + 1}. {actionTypeLabels[action.type]}
                        </div>
                        <button
                          onClick={() => removeAction(index)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {action.type === "http" && (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <select
                              value={(action.config as HttpAction).method}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: {
                                    ...action.config,
                                    method: e.target.value as HttpAction["method"],
                                  },
                                })
                              }
                              className="w-24 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none"
                            >
                              <option>GET</option>
                              <option>POST</option>
                              <option>PUT</option>
                              <option>DELETE</option>
                            </select>
                            <input
                              type="text"
                              value={(action.config as HttpAction).url}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: { ...action.config, url: e.target.value },
                                })
                              }
                              className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none"
                              placeholder="http://api.example.com/endpoint"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              请求体 (使用 $0, $1 等引用捕获组)
                            </label>
                            <textarea
                              value={(action.config as HttpAction).body || ""}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: { ...action.config, body: e.target.value },
                                })
                              }
                              rows={2}
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none font-mono text-sm"
                              placeholder='{"error_code": "$0"}'
                            />
                          </div>
                        </div>
                      )}

                      {action.type === "keyboard" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              修饰键
                            </label>
                            <div className="flex gap-2">
                              {["ctrl", "alt", "shift", "meta"].map((mod) => (
                                <label
                                  key={mod}
                                  className="flex items-center gap-1 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(action.config as KeyboardAction).modifiers?.includes(
                                      mod as KeyboardAction["modifiers"][number]
                                    ) || false}
                                    onChange={(e) => {
                                      const current = (action.config as KeyboardAction).modifiers || [];
                                      const updated = e.target.checked
                                        ? [...current, mod]
                                        : current.filter((m) => m !== mod);
                                      updateAction(index, {
                                        config: { ...action.config, modifiers: updated },
                                      });
                                    }}
                                    className="rounded bg-gray-600"
                                  />
                                  {mod.toUpperCase()}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              按键 (逗号分隔，如: c, v, enter)
                            </label>
                            <input
                              type="text"
                              value={(action.config as KeyboardAction).keys.join(",")}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: {
                                    ...action.config,
                                    keys: e.target.value
                                      .split(",")
                                      .map((k) => k.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none"
                              placeholder="c"
                            />
                          </div>
                        </div>
                      )}

                      {action.type === "shell" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              命令
                            </label>
                            <input
                              type="text"
                              value={(action.config as ShellAction).command}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: { ...action.config, command: e.target.value },
                                })
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none font-mono"
                              placeholder="echo"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">
                              参数 (空格分隔)
                            </label>
                            <input
                              type="text"
                              value={(action.config as ShellAction).args?.join(" ") || ""}
                              onChange={(e) =>
                                updateAction(index, {
                                  config: {
                                    ...action.config,
                                    args: e.target.value
                                      .split(" ")
                                      .map((a) => a.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none font-mono"
                              placeholder="hello world"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setEditState({ isEditing: false, script: null })}
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
          <h2 className="text-xl font-bold">脚本管理</h2>
          <p className="text-sm text-gray-400">
            管理可以被规则触发执行的自动化脚本
          </p>
        </div>
        <button
          onClick={() =>
            setEditState({ isEditing: true, script: createNewScript() })
          }
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
        >
          <Plus size={18} />
          新建脚本
        </button>
      </div>

      <div className="flex-1 overflow-auto space-y-3">
        {scripts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            暂无脚本，点击上方按钮创建第一个脚本
          </div>
        ) : (
          scripts.map((script) => (
            <div
              key={script.id}
              className="p-4 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{script.name || "未命名脚本"}</span>
                    <span className="text-xs text-gray-500">
                      {script.actions.length} 个操作
                    </span>
                  </div>
                  {script.description && (
                    <p className="mt-1 text-sm text-gray-400">
                      {script.description}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    {script.actions.map((action, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                          action.type === "http"
                            ? "bg-primary/20 text-primary"
                            : action.type === "keyboard"
                            ? "bg-secondary/20 text-secondary"
                            : "bg-green-500/20 text-green-500"
                        }`}
                      >
                        {actionTypeIcons[action.type]}
                        {actionTypeLabels[action.type]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => testScript(script)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    title="测试脚本"
                  >
                    <Play size={16} />
                  </button>
                  <button
                    onClick={() => handleEdit(script)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => {
                      deleteScript(script.id);
                      syncScriptsToBackend();
                    }}
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

      {editState.isEditing && renderScriptEditor()}
    </div>
  );
}
