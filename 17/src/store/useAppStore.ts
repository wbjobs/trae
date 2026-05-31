import { create } from "zustand";
import { Rule, Script, AppSettings, TextRegion, RuleMatch } from "../types";

interface AppState {
  isScreenshotMode: boolean;
  isAnnotationVisible: boolean;
  ocrResult: TextRegion[];
  rules: Rule[];
  scripts: Script[];
  settings: AppSettings;
  recentMatches: RuleMatch[];

  setScreenshotMode: (mode: boolean) => void;
  setAnnotationVisible: (visible: boolean) => void;
  setOcrResult: (regions: TextRegion[]) => void;
  addRule: (rule: Rule) => void;
  updateRule: (rule: Rule) => void;
  deleteRule: (id: string) => void;
  addScript: (script: Script) => void;
  updateScript: (script: Script) => void;
  deleteScript: (id: string) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  addRecentMatch: (match: RuleMatch) => void;
}

const defaultSettings: AppSettings = {
  language: "chi_sim+eng",
  ocr_engine: "tesseract",
  tesseract_data_path: "",
  annotation_color: "#ffff00",
  annotation_font_size: 14,
  always_on_top: true,
  click_through: true,
};

const defaultRules: Rule[] = [
  {
    id: "1",
    name: "错误码检测",
    pattern: "错误码[:：]\\s*0x[0-9a-fA-F]+",
    enabled: true,
    case_insensitive: true,
    script_id: "1",
  },
  {
    id: "2",
    name: "IP地址检测",
    pattern: "\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b",
    enabled: true,
    case_insensitive: false,
    script_id: "",
  },
];

const defaultScripts: Script[] = [
  {
    id: "1",
    name: "发送错误报告",
    description: "当检测到错误码时发送HTTP请求",
    actions: [
      {
        type: "http",
        config: {
          method: "POST",
          url: "http://localhost:8080/api/error-report",
          headers: {
            "Content-Type": "application/json",
          },
          body: '{"error_code": "$0"}',
          use_capture_groups: true,
        },
      },
    ],
    timeout: 5000,
  },
  {
    id: "2",
    name: "复制到剪贴板",
    description: "模拟Ctrl+C复制",
    actions: [
      {
        type: "keyboard",
        config: {
          keys: ["c"],
          modifiers: ["ctrl"],
        },
      },
    ],
  },
];

export const useAppStore = create<AppState>((set) => ({
  isScreenshotMode: false,
  isAnnotationVisible: true,
  ocrResult: [],
  rules: defaultRules,
  scripts: defaultScripts,
  settings: defaultSettings,
  recentMatches: [],

  setScreenshotMode: (mode) => set({ isScreenshotMode: mode }),
  setAnnotationVisible: (visible) => set({ isAnnotationVisible: visible }),
  setOcrResult: (regions) => set({ ocrResult: regions }),

  addRule: (rule) =>
    set((state) => ({ rules: [...state.rules, rule] })),
  updateRule: (rule) =>
    set((state) => ({
      rules: state.rules.map((r) => (r.id === rule.id ? rule : r)),
    })),
  deleteRule: (id) =>
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
    })),

  addScript: (script) =>
    set((state) => ({ scripts: [...state.scripts, script] })),
  updateScript: (script) =>
    set((state) => ({
      scripts: state.scripts.map((s) => (s.id === script.id ? script : s)),
    })),
  deleteScript: (id) =>
    set((state) => ({
      scripts: state.scripts.filter((s) => s.id !== id),
    })),

  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),

  addRecentMatch: (match) =>
    set((state) => ({
      recentMatches: [match, ...state.recentMatches.slice(0, 49)],
    })),
}));
