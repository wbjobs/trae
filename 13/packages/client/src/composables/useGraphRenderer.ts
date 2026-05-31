import { ref, onUnmounted, watch, type Ref } from 'vue';
import { loadCanvasKit, CanvasKit, type SkPaint, type SkCanvas, type SkPath, type SkFont } from 'canvaskit-wasm';
import { useGraphStore } from '@/stores/graph';
import type { Node, Edge } from '@collaborative-graph/shared';

const NODE_RADIUS = 30;
const NODE_STROKE_WIDTH = 2;
const EDGE_STROKE_WIDTH = 2;
const ARROW_SIZE = 10;

export function useGraphRenderer(
  canvasRef: Ref<HTMLCanvasElement | null>,
) {
  const graphStore = useGraphStore();
  const CanvasKitInstance = ref<CanvasKit | null>(null);
  const surface = ref<any>(null);
  const animationFrameId = ref<number | null>(null);
  const nodePaint = ref<SkPaint | null>(null);
  const nodeStrokePaint = ref<SkPaint | null>(null);
  const selectedNodePaint = ref<SkPaint | null>(null);
  const edgePaint = ref<SkPaint | null>(null);
  const selectedEdgePaint = ref<SkPaint | null>(null);
  const textPaint = ref<SkPaint | null>(null);
  const font = ref<SkFont | null>(null);
  const viewport = ref({ x: 0, y: 0, zoom: 1 });

  const isDragging = ref(false);
  const dragStart = ref({ x: 0, y: 0 });
  const viewportStart = ref({ x: 0, y: 0 });
  const isDraggingNode = ref(false);
  const draggedNodeId = ref<string | null>(null);
  const nodeStartPos = ref({ x: 0, y: 0 });

  const isCreatingEdge = ref(false);
  const edgeStartNode = ref<string | null>(null);
  const tempEdgeEnd = ref({ x: 0, y: 0 });

  let pendingMoveUpdate: number | null = null;

  async function initCanvasKit(): Promise<void> {
    const ck = await loadCanvasKit();
    CanvasKitInstance.value = ck;
    createPaints();
  }

  function createPaints(): void {
    if (!CanvasKitInstance.value) return;
    const ck = CanvasKitInstance.value;

    nodePaint.value = new ck.Paint();
    nodePaint.value.setColor(ck.Color(0xFFFF5722));
    nodePaint.value.setStyle(ck.PaintStyle.Fill);
    nodePaint.value.setAntiAlias(true);

    nodeStrokePaint.value = new ck.Paint();
    nodeStrokePaint.value.setColor(ck.Color(0xFF333333));
    nodeStrokePaint.value.setStyle(ck.PaintStyle.Stroke);
    nodeStrokePaint.value.setStrokeWidth(NODE_STROKE_WIDTH);
    nodeStrokePaint.value.setAntiAlias(true);

    selectedNodePaint.value = new ck.Paint();
    selectedNodePaint.value.setColor(ck.Color(0xFF00BCD4));
    selectedNodePaint.value.setStyle(ck.PaintStyle.Fill);
    selectedNodePaint.value.setAntiAlias(true);

    edgePaint.value = new ck.Paint();
    edgePaint.value.setColor(ck.Color(0xFF666666));
    edgePaint.value.setStyle(ck.PaintStyle.Stroke);
    edgePaint.value.setStrokeWidth(EDGE_STROKE_WIDTH);
    edgePaint.value.setAntiAlias(true);

    selectedEdgePaint.value = new ck.Paint();
    selectedEdgePaint.value.setColor(ck.Color(0xFFFF5722));
    selectedEdgePaint.value.setStyle(ck.PaintStyle.Stroke);
    selectedEdgePaint.value.setStrokeWidth(EDGE_STROKE_WIDTH * 2);
    selectedEdgePaint.value.setAntiAlias(true);

    textPaint.value = new ck.Paint();
    textPaint.value.setColor(ck.Color(0xFF333333));
    textPaint.value.setAntiAlias(true);

    font.value = new ck.Font(null, 12);
  }

  function initCanvas(): void {
    if (!canvasRef.value || !CanvasKitInstance.value) return;

    const canvas = canvasRef.value;
    const ck = CanvasKitInstance.value;

    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;

    surface.value = ck.MakeCanvasSurface(canvas);
  }

  function render(): void {
    if (!surface.value || !CanvasKitInstance.value) return;

    const ck = CanvasKitInstance.value;
    const canvas: SkCanvas = surface.value.getCanvas();
    const width = canvasRef.value?.width || 800;
    const height = canvasRef.value?.height || 600;

    canvas.clear(ck.Color(0xFFFFFFFF));

    canvas.save();
    canvas.scale(viewport.value.zoom, viewport.value.zoom);
    canvas.translate(
      -viewport.value.x * viewport.value.zoom,
      -viewport.value.y * viewport.value.zoom,
    );

    graphStore.edges.forEach((edge) => {
      drawEdge(edge, canvas);
    });

    if (isCreatingEdge.value && edgeStartNode.value) {
      const startNode = graphStore.nodes.get(edgeStartNode.value);
      if (startNode) {
        drawTemporaryEdge(startNode, tempEdgeEnd.value, canvas);
      }
    }

    graphStore.nodes.forEach((node) => {
      drawNode(node, canvas);
    });

    graphStore.userCursors.forEach((cursor) => {
      drawUserCursor(cursor, canvas);
    });

    canvas.restore();

    surface.value.flush();
  }

  function drawNode(node: Node, canvas: SkCanvas): void {
    if (!CanvasKitInstance.value || !nodePaint.value || !nodeStrokePaint.value || !selectedNodePaint.value) return;

    const ck = CanvasKitInstance.value;
    const isSelected = graphStore.selectedNodeId === node.id;

    const paint = isSelected ? selectedNodePaint.value : nodePaint.value;
    paint.setColor(ck.parseColorString(node.color));

    canvas.drawCircle(node.x, node.y, NODE_RADIUS, paint);
    canvas.drawCircle(node.x, node.y, NODE_RADIUS, nodeStrokePaint.value);

    if (textPaint.value && font.value) {
      const text = node.label;
      const textWidth = font.value.measureText(text);
      const textX = node.x - textWidth / 2;
      const textY = node.y + 4;

      canvas.drawText(text, textX, textY, font.value, textPaint.value);
    }
  }

  function drawEdge(edge: Edge, canvas: SkCanvas): void {
    if (!CanvasKitInstance.value || !edgePaint.value || !selectedEdgePaint.value) return;

    const sourceNode = graphStore.nodes.get(edge.sourceId);
    const targetNode = graphStore.nodes.get(edge.targetId);

    if (!sourceNode || !targetNode) return;

    const ck = CanvasKitInstance.value;
    const isSelected = graphStore.selectedEdgeId === edge.id;
    const paint = isSelected ? selectedEdgePaint.value : edgePaint.value;

    const path = drawArrowedLine(sourceNode, targetNode);
    canvas.drawPath(path, paint);
    path.delete();

    if (edge.label && textPaint.value && font.value) {
      const midX = (sourceNode.x + targetNode.x) / 2;
      const midY = (sourceNode.y + targetNode.y) / 2;
      const textWidth = font.value.measureText(edge.label);

      canvas.drawText(
        edge.label,
        midX - textWidth / 2,
        midY - 8,
        font.value,
        textPaint.value,
      );
    }
  }

  function drawTemporaryEdge(startNode: Node, end: { x: number; y: number }, canvas: SkCanvas): void {
    if (!CanvasKitInstance.value || !edgePaint.value) return;

    const ck = CanvasKitInstance.value;
    const path = drawArrowedLineToPoint(startNode, end);
    canvas.drawPath(path, edgePaint.value);
    path.delete();
  }

  function drawArrowedLine(source: Node, target: Node): SkPath {
    if (!CanvasKitInstance.value) {
      throw new Error('CanvasKit not initialized');
    }
    const ck = CanvasKitInstance.value;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const unitDx = dx / distance;
    const unitDy = dy / distance;

    const startX = source.x + unitDx * NODE_RADIUS;
    const startY = source.y + unitDy * NODE_RADIUS;
    const endX = target.x - unitDx * (NODE_RADIUS + ARROW_SIZE);
    const endY = target.y - unitDy * (NODE_RADIUS + ARROW_SIZE);

    const path = new ck.Path();
    path.moveTo(startX, startY);
    path.lineTo(endX, endY);

    const arrowPoint1X = endX + unitDx * ARROW_SIZE;
    const arrowPoint1Y = endY + unitDy * ARROW_SIZE;
    const arrowPoint2X = endX + (unitDx * 0.7 - unitDy * 0.7) * ARROW_SIZE;
    const arrowPoint2Y = endY + (unitDy * 0.7 + unitDx * 0.7) * ARROW_SIZE;
    const arrowPoint3X = endX + (unitDx * 0.7 + unitDy * 0.7) * ARROW_SIZE;
    const arrowPoint3Y = endY + (unitDy * 0.7 - unitDx * 0.7) * ARROW_SIZE;

    path.moveTo(arrowPoint1X, arrowPoint1Y);
    path.lineTo(arrowPoint2X, arrowPoint2Y);
    path.moveTo(arrowPoint1X, arrowPoint1Y);
    path.lineTo(arrowPoint3X, arrowPoint3Y);

    return path;
  }

  function drawArrowedLineToPoint(source: Node, end: { x: number; y: number }): SkPath {
    if (!CanvasKitInstance.value) {
      throw new Error('CanvasKit not initialized');
    }
    const ck = CanvasKitInstance.value;

    const dx = end.x - source.x;
    const dy = end.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const unitDx = dx / distance;
    const unitDy = dy / distance;

    const startX = source.x + unitDx * NODE_RADIUS;
    const startY = source.y + unitDy * NODE_RADIUS;

    const path = new ck.Path();
    path.moveTo(startX, startY);
    path.lineTo(end.x, end.y);

    return path;
  }

  function drawUserCursor(cursor: any, canvas: SkCanvas): void {
    if (!CanvasKitInstance.value || !nodeStrokePaint.value) return;

    const ck = CanvasKitInstance.value;

    const cursorPaint = new ck.Paint();
    cursorPaint.setColor(ck.Color(0xFFFF0000));
    cursorPaint.setStyle(ck.PaintStyle.Fill);

    canvas.drawCircle(cursor.x, cursor.y, 5, cursorPaint);

    if (textPaint.value && font.value) {
      canvas.drawText(
        cursor.userId.substring(0, 8),
        cursor.x + 10,
        cursor.y,
        font.value,
        textPaint.value,
      );
    }

    cursorPaint.delete();
  }

  function handleMouseDown(event: MouseEvent): void {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return;

    const x = (event.clientX - rect.left) / viewport.value.zoom + viewport.value.x;
    const y = (event.clientY - rect.top) / viewport.value.zoom + viewport.value.y;

    const clickedNode = findNodeAt(x, y);
    const clickedEdge = findEdgeAt(x, y);

    if (event.button === 0) {
      if (clickedNode) {
        if (event.shiftKey && graphStore.selectedNodeId) {
          isCreatingEdge.value = true;
          edgeStartNode.value = graphStore.selectedNodeId;
          tempEdgeEnd.value = { x, y };
        } else {
          isDraggingNode.value = true;
          draggedNodeId.value = clickedNode;
          const node = graphStore.nodes.get(clickedNode);
          if (node) {
            nodeStartPos.value = { x: node.x, y: node.y };
          }
          graphStore.selectNode(clickedNode);
        }
      } else if (clickedEdge) {
        graphStore.selectEdge(clickedEdge);
      } else {
        graphStore.clearSelection();
      }
    } else if (event.button === 2) {
      isDragging.value = true;
      dragStart.value = { x: event.clientX, y: event.clientY };
      viewportStart.value = { x: viewport.value.x, y: viewport.value.y };
    }
  }

  function handleMouseMove(event: MouseEvent): void {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return;

    const x = (event.clientX - rect.left) / viewport.value.zoom + viewport.value.x;
    const y = (event.clientY - rect.top) / viewport.value.zoom + viewport.value.y;

    if (isDragging.value) {
      const dx = (event.clientX - dragStart.value.x) / viewport.value.zoom;
      const dy = (event.clientY - dragStart.value.y) / viewport.value.zoom;

      viewport.value.x = viewportStart.value.x - dx;
      viewport.value.y = viewportStart.value.y - dy;
    }

    if (isDraggingNode.value && draggedNodeId.value) {
      const node = graphStore.nodes.get(draggedNodeId.value);
      if (node) {
        node.x = x;
        node.y = y;
        graphStore.nodes = new Map(graphStore.nodes);

        if (pendingMoveUpdate) {
          cancelAnimationFrame(pendingMoveUpdate);
        }
        pendingMoveUpdate = requestAnimationFrame(() => {
          emitMoveNode(node, nodeStartPos.value.x, nodeStartPos.value, x, y);
          nodeStartPos.value = { x, y };
        });
      }
    }

    if (isCreatingEdge.value) {
      tempEdgeEnd.value = { x, y };
    }
  }

  function handleMouseUp(event: MouseEvent): void {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return;

    const x = (event.clientX - rect.left) / viewport.value.zoom + viewport.value.x;
    const y = (event.clientY - rect.top) / viewport.value.zoom + viewport.value.y;

    if (isDragging.value) {
      isDragging.value = false;
    }

    if (isDraggingNode.value) {
      isDraggingNode.value = false;
      draggedNodeId.value = null;
      if (pendingMoveUpdate) {
        cancelAnimationFrame(pendingMoveUpdate);
        pendingMoveUpdate = null;
      }
    }

    if (isCreatingEdge.value && edgeStartNode.value) {
      const targetNode = findNodeAt(x, y);
      if (targetNode && targetNode !== edgeStartNode.value) {
        emitAddEdge(edgeStartNode.value, targetNode);
      }
      isCreatingEdge.value = false;
      edgeStartNode.value = null;
    }
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();

    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3, viewport.value.zoom * zoomFactor));

    const worldX = mouseX / viewport.value.zoom + viewport.value.x;
    const worldY = mouseY / viewport.value.zoom + viewport.value.y;

    viewport.value.zoom = newZoom;
    viewport.value.x = worldX - mouseX / newZoom;
    viewport.value.y = worldY - mouseY / newZoom;
  }

  function handleContextMenu(event: Event): void {
    event.preventDefault();
  }

  function findNodeAt(x: number, y: number): string | null {
    let closestNode: string | null = null;
    let closestDistance = Infinity;

    graphStore.nodes.forEach((node) => {
      const dx = x - node.x;
      const dy = y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < NODE_RADIUS && distance < closestDistance) {
        closestDistance = distance;
        closestNode = node.id;
      }
    });

    return closestNode;
  }

  function findEdgeAt(x: number, y: number): string | null {
    let closestEdge: string | null = null;
    let closestDistance = Infinity;

    graphStore.edges.forEach((edge) => {
      const source = graphStore.nodes.get(edge.sourceId);
      const target = graphStore.nodes.get(edge.targetId);

      if (!source || !target) return;

      const distance = pointToLineDistance(
        x, y,
        source.x, source.y,
        target.x, target.y
      );

      if (distance < 8 && distance < closestDistance) {
        closestDistance = distance;
        closestEdge = edge.id;
      }
    });

    return closestEdge;
  }

  function pointToLineDistance(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      const ddx = px - x1;
      const ddy = py - y1;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    const ddx = px - nearestX;
    const ddy = py - nearestY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  function setEmitHandlers(
    emitMove: (node: Node, fromX: number, fromY: number, toX: number, toY: number) => void,
    emitEdge: (sourceId: string, targetId: string) => void,
  ): void {
    emitMoveNodeImpl = emitMove;
    emitAddEdgeImpl = emitEdge;
  }

  let emitMoveNodeImpl: ((node: Node, fromX: number, fromY: number, toX: number, toY: number) => void) | null = null;
  let emitAddEdgeImpl: ((sourceId: string, targetId: string) => void) | null = null;

  function emitMoveNode(node: Node, fromX: number, fromY: number, toX: number, toY: number): void {
    if (emitMoveNodeImpl) {
      emitMoveNodeImpl(node, fromX, fromY, toX, toY);
    }
  }

  function emitAddEdge(sourceId: string, targetId: string): void {
    if (emitAddEdgeImpl) {
      emitAddEdgeImpl(sourceId, targetId);
    }
  }

  function startRenderLoop(): void {
    function renderFrame(): void {
      render();
      animationFrameId.value = requestAnimationFrame(renderFrame);
    }
    animationFrameId.value = requestAnimationFrame(renderFrame);
  }

  function stopRenderLoop(): void {
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value);
      animationFrameId.value = null;
    }
  }

  function dispose(): void {
    stopRenderLoop();

    if (nodePaint.value) nodePaint.value.delete();
    if (nodeStrokePaint.value) nodeStrokePaint.value.delete();
    if (selectedNodePaint.value) selectedNodePaint.value.delete();
    if (edgePaint.value) edgePaint.value.delete();
    if (selectedEdgePaint.value) selectedEdgePaint.value.delete();
    if (textPaint.value) textPaint.value.delete();
    if (font.value) font.value.delete();
    if (surface.value) surface.value.delete();
  }

  onUnmounted(() => {
    dispose();
  });

  return {
    initCanvasKit,
    initCanvas,
    startRenderLoop,
    stopRenderLoop,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    viewport,
    dispose,
    setEmitHandlers,
  };
}
