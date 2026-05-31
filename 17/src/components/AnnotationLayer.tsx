import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import { TextRegion } from "../types";

export default function AnnotationLayer() {
  const [regions, setRegions] = useState<TextRegion[]>([]);
  const { settings, isAnnotationVisible } = useAppStore();

  useEffect(() => {
    const unlisten = listen<TextRegion[]>("update-annotations", (event) => {
      setRegions(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (isAnnotationVisible) {
      setRegions(useAppStore.getState().ocrResult);
    }
  }, [isAnnotationVisible]);

  if (!isAnnotationVisible || regions.length === 0) {
    return null;
  }

  return (
    <div className="w-full h-full annotation-layer">
      {regions.map((region) => (
        <div
          key={region.id}
          className="absolute pointer-events-none"
          style={{
            left: region.bbox.x,
            top: region.bbox.y,
            width: region.bbox.width,
            height: region.bbox.height,
          }}
        >
          <div
            className="absolute inset-0 border-2 rounded"
            style={{
              borderColor: settings.annotation_color,
              backgroundColor: `${settings.annotation_color}33`,
            }}
          />

          <div
            className="absolute -top-1 -translate-y-full left-0 whitespace-nowrap px-2 py-1 rounded font-medium shadow-lg"
            style={{
              fontSize: `${settings.annotation_font_size}px`,
              color: settings.annotation_color,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            }}
          >
            {region.text}
          </div>

          <div
            className="absolute -bottom-1 translate-y-full right-0 whitespace-nowrap px-1 rounded text-xs"
            style={{
              color: settings.annotation_color,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
            }}
          >
            {(region.confidence * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  );
}
