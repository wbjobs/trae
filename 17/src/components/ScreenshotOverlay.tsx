import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";
import { Camera, X } from "lucide-react";

interface Point {
  x: number;
  y: number;
}

interface Selection {
  start: Point;
  end: Point;
}

export default function ScreenshotOverlay() {
  const { setScreenshotMode, settings } = useAppStore();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [screenshotBase64, setScreenshotBase64] = useState<string>("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const init = async () => {
      const size = await invoke<{ width: number; height: number }>(
        "get_screen_size"
      );
      setScreenSize(size);

      const base64 = await invoke<string>("capture_full_screen_base64");
      setScreenshotBase64(base64);
    };
    init();
  }, []);

  const getPointFromEvent = useCallback(
    (e: React.MouseEvent): Point => ({
      x: e.clientX,
      y: e.clientY,
    }),
    []
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const point = getPointFromEvent(e);
    setSelection({ start: point, end: point });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selection) return;
    const point = getPointFromEvent(e);
    setSelection({ ...selection, end: point });
  };

  const handleMouseUp = async () => {
    if (!isDragging || !selection) return;
    setIsDragging(false);

    const rect = getSelectionRect(selection);
    if (rect.width < 10 || rect.height < 10) {
      setSelection(null);
      return;
    }

    try {
      await invoke("perform_ocr_on_region", {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        language: settings.language,
      });

      if (settings.always_on_top) {
        await invoke("show_annotation_window");
      }
    } catch (error) {
      console.error("OCR failed:", error);
    }

    await cancelSelection();
  };

  const cancelSelection = async () => {
    setScreenshotMode(false);
    await invoke("stop_selection_mode");
  };

  const getSelectionRect = (sel: Selection) => {
    const x = Math.min(sel.start.x, sel.end.x);
    const y = Math.min(sel.start.y, sel.end.y);
    const width = Math.abs(sel.end.x - sel.start.x);
    const height = Math.abs(sel.end.y - sel.start.y);
    return { x, y, width, height };
  };

  const rect = selection ? getSelectionRect(selection) : null;

  return (
    <div
      className="fixed inset-0 selection-overlay"
      style={{ width: screenSize.width, height: screenSize.height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {screenshotBase64 && (
        <img
          src={`data:image/png;base64,${screenshotBase64}`}
          alt="screen"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      )}

      <div className="absolute inset-0 bg-black/40 pointer-events-none">
        {rect && (
          <>
            <div
              className="absolute bg-black/20"
              style={{
                top: 0,
                left: 0,
                width: screenSize.width,
                height: rect.y,
              }}
            />
            <div
              className="absolute bg-black/20"
              style={{
                top: rect.y,
                left: 0,
                width: rect.x,
                height: rect.height,
              }}
            />
            <div
              className="absolute bg-black/20"
              style={{
                top: rect.y,
                left: rect.x + rect.width,
                width: screenSize.width - rect.x - rect.width,
                height: rect.height,
              }}
            />
            <div
              className="absolute bg-black/20"
              style={{
                top: rect.y + rect.height,
                left: 0,
                width: screenSize.width,
                height: screenSize.height - rect.y - rect.height,
              }}
            />

            <div
              className="absolute border-2 border-primary pointer-events-none"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              }}
            >
              <div className="absolute -top-8 left-0 bg-primary text-white px-2 py-1 rounded text-sm">
                {rect.width.toFixed(0)} × {rect.height.toFixed(0)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-gray-900/90 px-6 py-3 rounded-full border border-gray-700 pointer-events-auto">
        <div className="flex items-center gap-2 text-primary">
          <Camera size={20} />
          <span className="text-sm font-medium">拖拽选择区域</span>
        </div>
        <div className="w-px h-4 bg-gray-600" />
        <button
          onClick={cancelSelection}
          className="flex items-center gap-1 text-gray-400 hover:text-white text-sm"
        >
          <X size={16} />
          取消 (Esc)
        </button>
      </div>
    </div>
  );
}
