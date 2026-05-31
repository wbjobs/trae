import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import HistoryPanel from './HistoryPanel';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  userId: string;
}

interface WhiteboardProps {
  roomId: string;
  wsUrl: string;
  apiUrl: string;
  isReadOnly: boolean;
}

const MAX_STROKES_FOR_FULL_REDRAW = 500;

export default function Whiteboard({ roomId, wsUrl, apiUrl, isReadOnly }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const strokesMapRef = useRef<Y.Map<string> | null>(null);

  const strokesRef = useRef<Map<string, Stroke>>(new Map());
  const dirtyKeysRef = useRef<Set<string>>(new Set());
  const rafPendingRef = useRef(false);
  const needsFullRedrawRef = useRef(true);

  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [connected, setConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const colors = [
    '#000000', '#ef4444', '#22c55e', '#3b82f6',
    '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'
  ];

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const strokes = strokesRef.current;
    for (const stroke of strokes.values()) {
      drawStroke(ctx, stroke);
    }
    needsFullRedrawRef.current = false;
  }, [drawStroke]);

  const scheduleRender = useCallback(() => {
    if (rafPendingRef.current) return;

    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;

      if (needsFullRedrawRef.current || strokesRef.current.size > MAX_STROKES_FOR_FULL_REDRAW) {
        redrawAll();
        dirtyKeysRef.current.clear();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      for (const key of dirtyKeysRef.current) {
        const stroke = strokesRef.current.get(key);
        if (stroke) {
          drawStroke(ctx, stroke);
        }
      }
      dirtyKeysRef.current.clear();
    });
  }, [redrawAll, drawStroke]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      needsFullRedrawRef.current = true;
      scheduleRender();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);

    return () => observer.disconnect();
  }, [scheduleRender]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const provider = new WebsocketProvider(wsUrl, roomId, ydoc, {
      params: isReadOnly ? { readonly: 'true' } : undefined
    });
    providerRef.current = provider;

    const strokesMap = ydoc.getMap<string>('strokes');
    strokesMapRef.current = strokesMap;

    provider.on('status', (event: { status: string }) => {
      setConnected(event.status === 'connected');
    });

    const initialStrokes = new Map<string, Stroke>();
    strokesMap.forEach((value: string, key: string) => {
      initialStrokes.set(key, JSON.parse(value));
    });
    strokesRef.current = initialStrokes;
    needsFullRedrawRef.current = true;
    scheduleRender();

    const handleMapChange = (event: Y.YMapEvent<string>) => {
      let hasChange = false;

      event.keysChanged.forEach((key) => {
        const value = strokesMap.get(key);
        if (value) {
          const stroke = JSON.parse(value) as Stroke;
          strokesRef.current.set(key, stroke);
          dirtyKeysRef.current.add(key);
          hasChange = true;
        } else {
          if (strokesRef.current.has(key)) {
            strokesRef.current.delete(key);
            needsFullRedrawRef.current = true;
            hasChange = true;
          }
        }
      });

      if (hasChange) {
        scheduleRender();
      }
    };

    strokesMap.observe(handleMapChange);

    return () => {
      strokesMap.unobserve(handleMapChange);
      provider.destroy();
      ydoc.destroy();
      rafPendingRef.current = false;
      dirtyKeysRef.current.clear();
    };
  }, [roomId, wsUrl, isReadOnly, scheduleRender]);

  const getCanvasPoint = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isReadOnly) return;

    const point = getCanvasPoint(e);
    setIsDrawing(true);
    currentStrokeRef.current = [point];
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || isReadOnly) return;

    const point = getCanvasPoint(e);
    currentStrokeRef.current = [...currentStrokeRef.current, point];

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || currentStrokeRef.current.length < 2) return;

    const lastTwo = currentStrokeRef.current.slice(-2);
    drawStroke(ctx, {
      id: 'temp',
      points: lastTwo,
      color,
      width: lineWidth,
      userId: ''
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || isReadOnly) return;

    if (currentStrokeRef.current.length > 1 && strokesMapRef.current) {
      const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const stroke: Stroke = {
        id: strokeId,
        points: currentStrokeRef.current,
        color,
        width: lineWidth,
        userId: ''
      };

      strokesMapRef.current.set(strokeId, JSON.stringify(stroke));
    }

    setIsDrawing(false);
    currentStrokeRef.current = [];
  };

  const handleClear = () => {
    if (isReadOnly || !strokesMapRef.current) return;

    const keysToDelete: string[] = [];
    strokesMapRef.current.forEach((_: any, key: string) => {
      keysToDelete.push(key);
    });

    keysToDelete.forEach(key => {
      strokesMapRef.current?.delete(key);
    });
  };

  const handleUndo = () => {
    if (isReadOnly || !strokesMapRef.current) return;

    let lastKey: string | null = null;
    strokesMapRef.current.forEach((_: any, key: string) => {
      if (key.startsWith('stroke_')) {
        lastKey = key;
      }
    });

    if (lastKey) {
      strokesMapRef.current.delete(lastKey);
    }
  };

  return (
    <div className="whiteboard-container">
      <div className="toolbar">
        <div className="tool-group">
          <span className="tool-label">颜色:</span>
          {colors.map((c) => (
            <button
              key={c}
              className={`color-btn ${color === c ? 'active' : ''}`}
              style={{ backgroundColor: c, border: c === '#ffffff' ? '2px solid #e2e8f0' : '' }}
              onClick={() => setColor(c)}
              disabled={isReadOnly}
            />
          ))}
        </div>

        <div className="tool-group">
          <span className="tool-label">粗细:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            disabled={isReadOnly}
          />
          <span className="tool-value">{lineWidth}px</span>
        </div>

        <div className="tool-group">
          <button className="action-btn" onClick={handleUndo} disabled={isReadOnly}>
            ↶ 撤销
          </button>
          <button className="action-btn danger" onClick={handleClear} disabled={isReadOnly}>
            🗑 清空
          </button>
          <button className="action-btn history-btn" onClick={() => setShowHistory(true)}>
            📜 历史
          </button>
        </div>

        <div className="tool-group">
          <span className={`conn-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '●' : '○'} {connected ? '已连接' : '连接中'}
          </span>
        </div>

        {isReadOnly && <div className="read-only-badge">只读模式</div>}
      </div>

      <div className="canvas-wrapper" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="whiteboard-canvas"
          style={{ cursor: isReadOnly ? 'not-allowed' : 'crosshair' }}
        />
      </div>

      {showHistory && (
        <HistoryPanel
          roomId={roomId}
          apiUrl={apiUrl}
          onClose={() => setShowHistory(false)}
          onRollback={() => {
            needsFullRedrawRef.current = true;
            scheduleRender();
          }}
        />
      )}
    </div>
  );
}
