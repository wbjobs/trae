import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const Whiteboard = forwardRef(function Whiteboard({ sendMessage, onRemoteDraw, onConnected }, ref) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const lastPosRef = useRef(null);
  const drawingHistoryRef = useRef([]);
  const isReplayingRef = useRef(false);

  const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'];
  const brushSizes = [2, 5, 10, 15, 20, 30];

  useImperativeHandle(ref, () => ({
    getFullState: () => {
      return {
        type: 'full-state',
        history: drawingHistoryRef.current,
        timestamp: Date.now(),
      };
    },
    applyFullState: (state) => {
      if (state.type === 'full-state' && state.history) {
        replayHistory(state.history);
      }
    },
    clearHistory: () => {
      drawingHistoryRef.current = [];
    },
    requestSync: () => {
      requestSync();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const handleResize = () => {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCtx.drawImage(canvas, 0, 0);

      canvas.width = window.innerWidth - 40;
      canvas.height = window.innerHeight - 200;

      ctx.drawImage(tempCanvas, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (onRemoteDraw) {
      onRemoteDraw((data) => {
        handleRemoteMessage(data);
      });
    }
  }, [onRemoteDraw]);

  const handleRemoteMessage = useCallback((data) => {
    switch (data.type) {
      case 'draw':
        drawRemote(data);
        break;
      case 'clear':
        clearCanvasRemote();
        break;
      case 'sync-request':
        sendSyncResponse();
        break;
      case 'sync-response':
        if (data.fullState) {
          replayHistory(data.fullState.history);
        }
        break;
      case 'full-state':
        replayHistory(data.history);
        break;
      default:
        break;
    }
  }, []);

  const sendSyncResponse = useCallback(() => {
    const fullState = {
      type: 'full-state',
      history: drawingHistoryRef.current,
      timestamp: Date.now(),
    };
    sendMessage({
      type: 'sync-response',
      fullState,
    });
  }, [sendMessage]);

  const requestSync = useCallback(() => {
    sendMessage({
      type: 'sync-request',
      timestamp: Date.now(),
    });
  }, [sendMessage]);

  useEffect(() => {
    if (onConnected) {
      onConnected(() => {
        requestSync();
      });
    }
  }, [onConnected, requestSync]);

  const replayHistory = useCallback((history) => {
    if (!canvasRef.current) return;
    
    isReplayingRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    history.forEach(action => {
      if (action.type === 'draw') {
        drawLine(ctx, action.from, action.to, action.color, action.size);
      }
    });
    
    drawingHistoryRef.current = [...history];
    isReplayingRef.current = false;
  }, []);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const drawLine = (ctx, from, to, color, size) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getCanvasCoords(e);
    lastPosRef.current = pos;
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getCanvasCoords(e);

    drawLine(ctx, lastPosRef.current, pos, color, brushSize);

    const action = {
      type: 'draw',
      from: lastPosRef.current,
      to: pos,
      color,
      size: brushSize,
      timestamp: Date.now(),
    };
    
    drawingHistoryRef.current.push(action);
    sendMessage(action);

    lastPosRef.current = pos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPosRef.current = null;
  };

  const drawRemote = useCallback((data) => {
    if (data.type === 'draw') {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      drawLine(ctx, data.from, data.to, data.color, data.size);
      
      if (!isReplayingRef.current) {
        drawingHistoryRef.current.push({
          ...data,
          timestamp: data.timestamp || Date.now(),
        });
      }
    }
  }, []);

  const clearCanvasRemote = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawingHistoryRef.current = [];
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawingHistoryRef.current = [];
    sendMessage({ type: 'clear', timestamp: Date.now() });
  };

  return (
    <div className="whiteboard-container">
      <div className="toolbar">
        <div className="toolbar-section">
          <label>颜色:</label>
          <div className="color-palette">
            {colors.map((c) => (
              <button
                key={c}
                className={`color-btn ${color === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-input"
            />
          </div>
        </div>

        <div className="toolbar-section">
          <label>笔刷大小:</label>
          <div className="brush-sizes">
            {brushSizes.map((s) => (
              <button
                key={s}
                className={`size-btn ${brushSize === s ? 'active' : ''}`}
                onClick={() => setBrushSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button className="clear-btn" onClick={clearCanvas}>
          清除画布
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="whiteboard"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  );
});

export default Whiteboard;
