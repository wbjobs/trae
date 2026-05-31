export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextRegion {
  id: string;
  text: string;
  confidence: number;
  bbox: Rect;
}

export interface OCRResult {
  regions: TextRegion[];
  raw_text: string;
  processing_time: number;
}

export interface Rule {
  id: string;
  name: string;
  pattern: string;
  enabled: boolean;
  case_insensitive: boolean;
  script_id: string;
}

export interface ScriptAction {
  type: "http" | "keyboard" | "shell";
  config: HttpAction | KeyboardAction | ShellAction;
}

export interface HttpAction {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  use_capture_groups?: boolean;
}

export interface KeyboardAction {
  keys: string[];
  modifiers?: ("ctrl" | "alt" | "shift" | "meta")[];
}

export interface ShellAction {
  command: string;
  args?: string[];
}

export interface Script {
  id: string;
  name: string;
  description: string;
  actions: ScriptAction[];
  timeout?: number;
}

export interface RuleMatch {
  rule_id: string;
  rule_name: string;
  matched_text: string;
  capture_groups: string[];
  timestamp: number;
}

export interface AppSettings {
  language: string;
  ocr_engine: "tesseract" | "paddle";
  tesseract_data_path: string;
  annotation_color: string;
  annotation_font_size: number;
  always_on_top: boolean;
  click_through: boolean;
}
