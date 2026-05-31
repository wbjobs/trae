import { useRef, useState, useEffect, useCallback } from 'react';
import { useQuantumStore } from '@/store/quantumStore';
import type { QuantumGate, GateType } from '@/types/quantum';
import { GATE_INFO } from '@/types/quantum';
import { X } from 'lucide-react';

const CELL_WIDTH = 80;
const CELL_HEIGHT = 60;
const GATE_SIZE = 50;
const PADDING_LEFT = 60;
const PADDING_TOP = 20;

const CircuitEditor = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    circuit,
    addGate,
    removeGate,
    updateGatePosition,
    selectedQubit,
    setSelectedQubit,
  } = useQuantumStore();

  const [draggingGate, setDraggingGate] = useState<{ type: GateType; isNew: boolean; gateId?: string } | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [hoveredGate, setHoveredGate] = useState<string | null>(null);

  const canvasWidth = Math.max(800, PADDING_LEFT + 20 * CELL_WIDTH + 50);
  const canvasHeight = PADDING_TOP + circuit.qubitCount * CELL_HEIGHT + 40;

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = '#2a2e3e';
      ctx.lineWidth = 1;

      for (let col = 0; col <= 20; col++) {
        ctx.beginPath();
        ctx.moveTo(PADDING_LEFT + col * CELL_WIDTH, PADDING_TOP);
        ctx.lineTo(PADDING_LEFT + col * CELL_WIDTH, PADDING_TOP + circuit.qubitCount * CELL_HEIGHT);
        ctx.stroke();
      }

      for (let row = 0; row < circuit.qubitCount; row++) {
        const y = PADDING_TOP + row * CELL_HEIGHT + CELL_HEIGHT / 2;
        ctx.strokeStyle = '#44475a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PADDING_LEFT, y);
        ctx.lineTo(PADDING_LEFT + 20 * CELL_WIDTH, y);
        ctx.stroke();

        ctx.fillStyle = '#64ffda';
        ctx.font = '14px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`q${row}`, PADDING_LEFT - 15, y);
      }
    },
    [circuit.qubitCount]
  );

  const drawGate = useCallback(
    (ctx: CanvasRenderingContext2D, gate: QuantumGate, isHovered: boolean) => {
      const x = PADDING_LEFT + gate.column * CELL_WIDTH + (CELL_WIDTH - GATE_SIZE) / 2;
      const y = PADDING_TOP + gate.targetQubit * CELL_HEIGHT + (CELL_HEIGHT - GATE_SIZE) / 2;

      const info = GATE_INFO[gate.type];

      if (gate.type === 'CNOT' && gate.controlQubit !== undefined) {
        const controlY = PADDING_TOP + gate.controlQubit * CELL_HEIGHT + CELL_HEIGHT / 2;
        const targetY = y + GATE_SIZE / 2;

        ctx.strokeStyle = info.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + GATE_SIZE / 2, controlY);
        ctx.lineTo(x + GATE_SIZE / 2, targetY);
        ctx.stroke();

        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.arc(x + GATE_SIZE / 2, controlY, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isHovered ? 'rgba(100, 255, 218, 0.3)' : 'rgba(26, 26, 46, 0.9)';
      ctx.strokeStyle = isHovered ? '#64ffda' : info.color;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(x, y, GATE_SIZE, GATE_SIZE, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = info.color;
      ctx.font = 'bold 18px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.symbol, x + GATE_SIZE / 2, y + GATE_SIZE / 2);
    },
    []
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx);

    circuit.gates.forEach((gate) => {
      drawGate(ctx, gate, hoveredGate === gate.id);
    });
  }, [circuit, drawGrid, drawGate, hoveredGate]);

  useEffect(() => {
    render();
  }, [render]);

  const getPositionFromEvent = (e: React.MouseEvent | React.DragEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const getGridPosition = (x: number, y: number) => {
    const col = Math.floor((x - PADDING_LEFT) / CELL_WIDTH);
    const row = Math.floor((y - PADDING_TOP) / CELL_HEIGHT);
    return {
      column: Math.max(0, Math.min(19, col)),
      qubit: Math.max(0, Math.min(circuit.qubitCount - 1, row)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    const { column, qubit } = getGridPosition(pos.x, pos.y);

    const clickedGate = circuit.gates.find(
      (g) =>
        g.column === column &&
        (g.targetQubit === qubit || g.controlQubit === qubit)
    );

    if (clickedGate) {
      setDraggingGate({ type: clickedGate.type, isNew: false, gateId: clickedGate.id });
      setDragPosition(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    const { column, qubit } = getGridPosition(pos.x, pos.y);

    const hovered = circuit.gates.find(
      (g) =>
        g.column === column &&
        (g.targetQubit === qubit || g.controlQubit === qubit)
    );
    setHoveredGate(hovered?.id || null);

    if (draggingGate) {
      setDragPosition(pos);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingGate) {
      const pos = getPositionFromEvent(e);
      const { column, qubit } = getGridPosition(pos.x, pos.y);

      if (draggingGate.isNew) {
        const newGate: QuantumGate = {
          id: Math.random().toString(36).substr(2, 9),
          type: draggingGate.type,
          targetQubit: qubit,
          column,
          controlQubit: draggingGate.type === 'CNOT' ? Math.max(0, qubit - 1) : undefined,
        };
        addGate(newGate);
      } else if (draggingGate.gateId) {
        updateGatePosition(draggingGate.gateId, column, qubit);
      }
      setDraggingGate(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    const { column, qubit } = getGridPosition(pos.x, pos.y);

    const clickedGate = circuit.gates.find(
      (g) =>
        g.column === column &&
        (g.targetQubit === qubit || g.controlQubit === qubit)
    );

    if (clickedGate) {
      removeGate(clickedGate.id);
    }
  };

  const handleDragStart = (e: React.DragEvent, gateType: GateType) => {
    setDraggingGate({ type: gateType, isNew: true });
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = getPositionFromEvent(e);
    setDragPosition(pos);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingGate?.isNew) {
      const pos = getPositionFromEvent(e);
      const { column, qubit } = getGridPosition(pos.x, pos.y);

      const newGate: QuantumGate = {
        id: Math.random().toString(36).substr(2, 9),
        type: draggingGate.type,
        targetQubit: qubit,
        column,
        controlQubit: draggingGate.type === 'CNOT' ? Math.max(0, qubit - 1) : undefined,
      };
      addGate(newGate);
    }
    setDraggingGate(null);
  };

  const handleQubitSelect = (e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    const { qubit } = getGridPosition(pos.x, pos.y);
    setSelectedQubit(qubit);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-3 bg-[#111525] border-b border-[#2a2e3e] flex-wrap">
        {Object.entries(GATE_INFO).map(([type, info]) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type as GateType)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[#1a1f35] border border-[#2a2e3e] cursor-grab hover:border-[#64ffda] hover:bg-[#222842] transition-all active:cursor-grabbing"
            style={{ minWidth: '60px' }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
              style={{ backgroundColor: `${info.color}20`, color: info.color }}
            >
              {info.symbol}
            </div>
            <span className="text-[10px] text-gray-400">{info.name}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-[#0a0e1a]">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setDraggingGate(null);
            setHoveredGate(null);
          }}
          onDoubleClick={handleDoubleClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleQubitSelect}
          className="cursor-crosshair"
        />
      </div>

      <div className="p-2 bg-[#111525] border-t border-[#2a2e3e] text-xs text-gray-400 flex justify-between items-center">
        <div className="flex gap-4">
          <span>量子比特数: {circuit.qubitCount}</span>
          <span>门数量: {circuit.gates.length}</span>
          <span>选中量子比特: q{selectedQubit}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-[#64ffda]">拖拽量子门到画布</span>
          <span>|</span>
          <span className="text-[#64ffda]">双击删除门</span>
          <span>|</span>
          <span className="text-[#64ffda]">点击选择量子比特查看布洛赫球</span>
        </div>
      </div>
    </div>
  );
};

export default CircuitEditor;
