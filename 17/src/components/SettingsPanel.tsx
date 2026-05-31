import { useAppStore } from "../store/useAppStore";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function SettingsPanel() {
  const { settings, updateSettings } = useAppStore();

  useEffect(() => {
    applyWindowSettings();
  }, [settings.always_on_top, settings.click_through]);

  const applyWindowSettings = async () => {
    await invoke("set_always_on_top", { enabled: settings.always_on_top });
    await invoke("set_click_through", { enabled: settings.click_through });
  };

  const handleChange = <K extends keyof typeof settings>(
    key: K,
    value: typeof settings[K]
  ) => {
    updateSettings({ [key]: value });
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h2 className="text-xl font-bold mb-2">设置</h2>
        <p className="text-sm text-gray-400 mb-8">
          配置 OCR 引擎和批注层的显示选项
        </p>

        <div className="space-y-8">
          <section className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">OCR 配置</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  OCR 引擎
                </label>
                <select
                  value={settings.ocr_engine}
                  onChange={(e) =>
                    handleChange(
                      "ocr_engine",
                      e.target.value as "tesseract" | "paddle"
                    )
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
                >
                  <option value="tesseract">Tesseract</option>
                  <option value="paddle">PaddleOCR</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  选择要使用的 OCR 识别引擎
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  识别语言
                </label>
                <input
                  type="text"
                  value={settings.language}
                  onChange={(e) => handleChange("language", e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary font-mono"
                  placeholder="chi_sim+eng"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tesseract 语言代码，用 + 号连接多种语言。例如: chi_sim+eng
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tesseract 语言包路径
                </label>
                <input
                  type="text"
                  value={settings.tesseract_data_path}
                  onChange={(e) =>
                    handleChange("tesseract_data_path", e.target.value)
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary"
                  placeholder="留空使用默认路径"
                />
                <p className="text-xs text-gray-500 mt-1">
                  自定义 tessdata 目录路径
                </p>
              </div>
            </div>
          </section>

          <section className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">批注层配置</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  批注颜色
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.annotation_color}
                    onChange={(e) => handleChange("annotation_color", e.target.value)}
                    className="w-12 h-12 rounded-lg cursor-pointer bg-transparent"
                  />
                  <span className="font-mono text-gray-400">
                    {settings.annotation_color}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  字体大小: {settings.annotation_font_size}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="32"
                  value={settings.annotation_font_size}
                  onChange={(e) =>
                    handleChange(
                      "annotation_font_size",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
          </section>

          <section className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">窗口配置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">始终置顶</div>
                  <div className="text-sm text-gray-400">
                    批注窗口始终显示在其他窗口之上
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleChange("always_on_top", !settings.always_on_top)
                  }
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    settings.always_on_top ? "bg-primary" : "bg-gray-600"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.always_on_top ? "left-6" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">点击穿透</div>
                  <div className="text-sm text-gray-400">
                    鼠标事件穿透批注层（无法交互，但可正常操作下方内容）
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleChange("click_through", !settings.click_through)
                  }
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    settings.click_through ? "bg-primary" : "bg-gray-600"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.click_through ? "left-6" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
