import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";
import {
  Camera,
  Eye,
  EyeOff,
  Settings,
  List,
  Code,
  Play,
  Square,
  X,
} from "lucide-react";
import RulesPanel from "./RulesPanel";
import ScriptsPanel from "./ScriptsPanel";
import SettingsPanel from "./SettingsPanel";
import { OCRResult } from "../types";

type TabType = "rules" | "scripts" | "settings";

export default function MainWindow() {
  const {
    isScreenshotMode,
    setScreenshotMode,
    isAnnotationVisible,
    setAnnotationVisible,
    ocrResult,
    recentMatches,
    settings,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>("rules");

  const startScreenshot = async () => {
    setScreenshotMode(true);
    await invoke("start_selection_mode");
  };

  const startFullScreenOcr = async () => {
    const result = await invoke<OCRResult>("full_screen_ocr");
    console.log("Full screen OCR:", result);
    if (settings.always_on_top) {
      await invoke("show_annotation_window");
    }
  };

  const toggleAnnotation = async () => {
    setAnnotationVisible(!isAnnotationVisible);
    if (isAnnotationVisible) {
      await invoke("hide_annotation_window");
    } else {
      await invoke("show_annotation_window");
    }
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "rules", label: "规则", icon: <List size={18} /> },
    { key: "scripts", label: "脚本", icon: <Code size={18} /> },
    { key: "settings", label: "设置", icon: <Settings size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Screen OCR Assistant
        </h1>
        <div className="flex gap-2">
          <button
            onClick={startScreenshot}
            disabled={isScreenshotMode}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors disabled:opacity-50"
          >
            <Camera size={18} />
            区域截图
          </button>
          <button
            onClick={startFullScreenOcr}
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            <Play size={18} />
            全屏 OCR
          </button>
          <button
            onClick={toggleAnnotation}
            className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            {isAnnotationVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-gray-850 border-r border-gray-700 flex flex-col">
          <nav className="flex flex-col p-2 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-gray-700 text-gray-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">
              最近匹配
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentMatches.length === 0 ? (
                <p className="text-xs text-gray-500">暂无匹配记录</p>
              ) : (
                recentMatches.slice(0, 10).map((match, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-gray-800 rounded text-xs"
                  >
                    <div className="text-primary font-medium">
                      {match.rule_name}
                    </div>
                    <div className="text-gray-400 truncate">
                      {match.matched_text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          {activeTab === "rules" && <RulesPanel />}
          {activeTab === "scripts" && <ScriptsPanel />}
          {activeTab === "settings" && <SettingsPanel />}
        </main>
      </div>

      {ocrResult.length > 0 && (
        <div className="border-t border-gray-700 bg-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">
              OCR 结果 ({ocrResult.length} 个区域)
            </h3>
            <button
              onClick={() => useAppStore.getState().setOcrResult([])}
              className="text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
            {ocrResult.map((region) => (
              <div
                key={region.id}
                className="p-2 bg-gray-700 rounded text-sm"
              >
                <span className="text-primary mr-2">
                  [{(region.confidence * 100).toFixed(0)}%]
                </span>
                {region.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
