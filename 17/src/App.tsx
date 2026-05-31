import { useState, useEffect } from "react";
import { listen, invoke } from "@tauri-apps/api/event";
import { useAppStore } from "./store/useAppStore";
import MainWindow from "./components/MainWindow";
import ScreenshotOverlay from "./components/ScreenshotOverlay";
import AnnotationLayer from "./components/AnnotationLayer";
import { OCRResult } from "./types";

export default function App() {
  const {
    isScreenshotMode,
    setOcrResult,
    addRecentMatch,
    settings,
  } = useAppStore();
  const [isAnnotationWindow, setIsAnnotationWindow] = useState(false);

  useEffect(() => {
    const unlistenOcrResult = listen<OCRResult>("ocr-result", (event) => {
      console.log("OCR Result:", event.payload);
      setOcrResult(event.payload.regions);
    });

    const unlistenRuleMatch = listen<{
      rule_id: string;
      rule_name: string;
      matched_text: string;
      capture_groups: string[];
    }>("rule-match", (event) => {
      console.log("Rule Match:", event.payload);
      addRecentMatch({
        ...event.payload,
        timestamp: Date.now(),
      });
    });

    invoke<string>("get_window_label")
      .then((label) => {
        setIsAnnotationWindow(label === "annotation");
        if (label === "annotation") {
          invoke("set_click_through", { enabled: settings.click_through });
        }
      })
      .catch(console.error);

    return () => {
      unlistenOcrResult.then((fn) => fn());
      unlistenRuleMatch.then((fn) => fn());
    };
  }, [setOcrResult, addRecentMatch, settings.click_through]);

  if (isAnnotationWindow) {
    return <AnnotationLayer />;
  }

  if (isScreenshotMode) {
    return <ScreenshotOverlay />;
  }

  return <MainWindow />;
}
