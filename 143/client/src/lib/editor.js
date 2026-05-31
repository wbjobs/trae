import { fabric } from 'fabric';
import { v4 as uuidv4 } from 'uuid';

export class FlowEditor {
  constructor(canvasElement, options = {}) {
    this.canvas = new fabric.Canvas(canvasElement, {
      width: options.width || 1200,
      height: options.height || 800,
      backgroundColor: '#f8fafc',
      selection: true
    });

    this.nodes = new Map();
    this.connections = new Map();
    this.selectedNode = null;
    this.isConnecting = false;
    this.connectionStart = null;
    this.tempLine = null;
    this.onChange = options.onChange || (() => {});
    this.onSelect = options.onSelect || (() => {});
    this.remoteCursors = new Map();

    this.setupEvents();
    this.setupGrid();
  }

  setupGrid() {
    const gridSize = 20;
    const gridLines = [];

    for (let i = 0; i < this.canvas.width; i += gridSize) {
      gridLines.push(new fabric.Line([i, 0, i, this.canvas.height], {
        stroke: '#e5e7eb',
        selectable: false,
        evented: false
      }));
    }

    for (let i = 0; i < this.canvas.height; i += gridSize) {
      gridLines.push(new fabric.Line([0, i, this.canvas.width, i], {
        stroke: '#e5e7eb',
        selectable: false,
        evented: false
      }));
    }

    gridLines.forEach(line => this.canvas.add(line));
  }

  setupEvents() {
    this.canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (obj.nodeId) {
        this.updateConnections(obj.nodeId);
      }
    });

    this.canvas.on('object:modified', (e) => {
      const obj = e.target;
      if (obj.nodeId) {
        this.onNodeMoved(obj);
      }
    });

    this.canvas.on('selection:created', (e) => {
      this.handleSelection(e.selected[0]);
    });

    this.canvas.on('selection:updated', (e) => {
      this.handleSelection(e.selected[0]);
    });

    this.canvas.on('selection:cleared', () => {
      this.selectedNode = null;
      this.onSelect(null);
    });

    this.canvas.on('mouse:down', (e) => {
      this.handleMouseDown(e);
    });

    this.canvas.on('mouse:move', (e) => {
      this.handleMouseMove(e);
    });

    this.canvas.on('mouse:up', (e) => {
      this.handleMouseUp(e);
    });
  }

  handleSelection(obj) {
    if (!obj) return;

    if (obj.nodeId) {
      this.selectedNode = obj;
      this.onSelect({
        id: obj.nodeId,
        type: obj.nodeType,
        text: obj.textValue,
        color: obj.fill
      });
    } else if (obj.connectionId) {
      this.selectedConnection = obj;
      this.onSelect({
        type: 'connection',
        id: obj.connectionId,
        from: obj.fromNode,
        to: obj.toNode
      });
    }
  }

  handleMouseDown(e) {
    if (!e.target && e.pointer) {
      if (this.selectedNode) {
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
      }
    }
  }

  handleMouseMove(e) {
    if (this.isConnecting && this.tempLine && e.pointer) {
      this.tempLine.set({
        x2: e.pointer.x,
        y2: e.pointer.y
      });
      this.canvas.renderAll();
    }
  }

  handleMouseUp(e) {
    if (this.isConnecting && e.target && e.target.nodeId && this.connectionStart) {
      if (e.target.nodeId !== this.connectionStart.nodeId) {
        this.createConnection(this.connectionStart, e.target);
      }
    }

    this.cancelConnection();
  }

  addNode(type = 'rect', options = {}) {
    const id = uuidv4();
    const x = options.x || 100;
    const y = options.y || 100;
    const text = options.text || 'New Node';
    const color = options.color || '#60a5fa';

    let node;

    switch (type) {
      case 'circle':
        node = new fabric.Circle({
          radius: 40,
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          left: x,
          top: y,
          originX: 'center',
          originY: 'center'
        });
        break;

      case 'diamond':
        node = new fabric.Polygon([
          { x: 0, y: -50 },
          { x: 60, y: 0 },
          { x: 0, y: 50 },
          { x: -60, y: 0 }
        ], {
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          left: x,
          top: y,
          originX: 'center',
          originY: 'center'
        });
        break;

      case 'ellipse':
        node = new fabric.Ellipse({
          rx: 60,
          ry: 35,
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          left: x,
          top: y,
          originX: 'center',
          originY: 'center'
        });
        break;

      case 'rect':
      default:
        node = new fabric.Rect({
          width: 120,
          height: 70,
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          left: x,
          top: y,
          originX: 'center',
          originY: 'center'
        });
        break;
    }

    node.nodeId = id;
    node.nodeType = type;
    node.textValue = text;

    const textObj = new fabric.Text(text, {
      fontSize: 14,
      fill: '#1f2937',
      originX: 'center',
      originY: 'center'
    });

    const group = new fabric.Group([node, textObj], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center'
    });

    group.nodeId = id;
    group.nodeType = type;
    group.textValue = text;
    group.fill = color;

    this.nodes.set(id, group);
    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.renderAll();

    this.onChange({
      type: 'add_node',
      nodeId: id,
      node: {
        id,
        type,
        text,
        color,
        x,
        y
      }
    });

    return id;
  }

  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    this.canvas.remove(node);
    this.nodes.delete(nodeId);

    const connectionsToRemove = [];
    this.connections.forEach((conn, id) => {
      if (conn.fromNode === nodeId || conn.toNode === nodeId) {
        this.canvas.remove(conn.line);
        connectionsToRemove.push(id);
      }
    });

    connectionsToRemove.forEach(id => {
      this.connections.delete(id);
      this.onChange({
        type: 'remove_connection',
        connectionId: id
      });
    });

    this.canvas.renderAll();

    this.onChange({
      type: 'remove_node',
      nodeId
    });
  }

  updateNode(nodeId, updates) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const items = node.getObjects();
    const shape = items[0];
    const textObj = items[1];

    if (updates.text !== undefined) {
      textObj.set('text', updates.text);
      node.textValue = updates.text;
    }

    if (updates.color !== undefined) {
      shape.set('fill', updates.color);
      node.fill = updates.color;
    }

    this.canvas.renderAll();

    this.onChange({
      type: 'update_node',
      nodeId,
      updates
    });
  }

  startConnection(node) {
    if (!node) return;

    this.isConnecting = true;
    this.connectionStart = node;

    this.tempLine = new fabric.Line([
      node.left,
      node.top,
      node.left,
      node.top
    ], {
      stroke: '#9ca3af',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false
    });

    this.canvas.add(this.tempLine);
    this.canvas.renderAll();
  }

  cancelConnection() {
    if (this.tempLine) {
      this.canvas.remove(this.tempLine);
      this.tempLine = null;
    }
    this.isConnecting = false;
    this.connectionStart = null;
    this.canvas.renderAll();
  }

  createConnection(fromNode, toNode) {
    const id = uuidv4();

    const line = new fabric.Line([
      fromNode.left,
      fromNode.top,
      toNode.left,
      toNode.top
    ], {
      stroke: '#6b7280',
      strokeWidth: 2,
      selectable: true
    });

    line.connectionId = id;
    line.fromNode = fromNode.nodeId;
    line.toNode = toNode.nodeId;

    const arrow = new fabric.Triangle({
      width: 10,
      height: 10,
      fill: '#6b7280',
      originX: 'center',
      originY: 'center'
    });

    const group = new fabric.Group([line, arrow], {
      selectable: true
    });

    group.connectionId = id;
    group.fromNode = fromNode.nodeId;
    group.toNode = toNode.nodeId;
    group.line = line;
    group.arrow = arrow;

    this.connections.set(id, group);
    this.canvas.add(group);
    this.canvas.sendToBack(group);
    this.canvas.renderAll();

    this.onChange({
      type: 'add_connection',
      connectionId: id,
      connection: {
        id,
        from: fromNode.nodeId,
        to: toNode.nodeId
      }
    });

    return id;
  }

  removeConnection(connectionId) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    this.canvas.remove(conn);
    this.connections.delete(connectionId);
    this.canvas.renderAll();

    this.onChange({
      type: 'remove_connection',
      connectionId
    });
  }

  updateConnections(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    this.connections.forEach(conn => {
      if (conn.fromNode === nodeId || conn.toNode === nodeId) {
        const fromNode = this.nodes.get(conn.fromNode);
        const toNode = this.nodes.get(conn.toNode);

        if (fromNode && toNode) {
          const line = conn.getObjects()[0];
          line.set({
            x1: fromNode.left,
            y1: fromNode.top,
            x2: toNode.left,
            y2: toNode.top
          });

          conn.setCoords();
        }
      }
    });

    this.canvas.renderAll();
  }

  onNodeMoved(node) {
    this.onChange({
      type: 'move_node',
      nodeId: node.nodeId,
      x: node.left,
      y: node.top
    });
  }

  loadFromData(data) {
    this.clear();

    if (!data) return;

    if (data.nodes) {
      data.nodes.forEach(nodeData => {
        this.addNodeFromData(nodeData);
      });
    }

    if (data.connections) {
      data.connections.forEach(connData => {
        this.addConnectionFromData(connData);
      });
    }

    this.canvas.renderAll();
  }

  addNodeFromData(nodeData) {
    const id = nodeData.id;
    const type = nodeData.type || 'rect';
    const text = nodeData.text || '';
    const color = nodeData.color || '#60a5fa';
    const x = nodeData.x || 100;
    const y = nodeData.y || 100;

    let shape;

    switch (type) {
      case 'circle':
        shape = new fabric.Circle({
          radius: 40,
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          originX: 'center',
          originY: 'center'
        });
        break;

      case 'diamond':
        shape = new fabric.Polygon([
          { x: 0, y: -50 },
          { x: 60, y: 0 },
          { x: 0, y: 50 },
          { x: -60, y: 0 }
        ], {
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          originX: 'center',
          originY: 'center'
        });
        break;

      case 'ellipse':
        shape = new fabric.Ellipse({
          rx: 60,
          ry: 35,
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          originX: 'center',
          originY: 'center'
        });
        break;

      case 'rect':
      default:
        shape = new fabric.Rect({
          width: 120,
          height: 70,
          fill: color,
          stroke: '#3b82f6',
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          originX: 'center',
          originY: 'center'
        });
        break;
    }

    const textObj = new fabric.Text(text, {
      fontSize: 14,
      fill: '#1f2937',
      originX: 'center',
      originY: 'center'
    });

    const group = new fabric.Group([shape, textObj], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center'
    });

    group.nodeId = id;
    group.nodeType = type;
    group.textValue = text;
    group.fill = color;

    this.nodes.set(id, group);
    this.canvas.add(group);
  }

  addConnectionFromData(connData) {
    const fromNode = this.nodes.get(connData.from);
    const toNode = this.nodes.get(connData.to);

    if (!fromNode || !toNode) return;

    const id = connData.id;

    const line = new fabric.Line([
      fromNode.left,
      fromNode.top,
      toNode.left,
      toNode.top
    ], {
      stroke: '#6b7280',
      strokeWidth: 2,
      selectable: true
    });

    line.connectionId = id;
    line.fromNode = connData.from;
    line.toNode = connData.to;

    const arrow = new fabric.Triangle({
      width: 10,
      height: 10,
      fill: '#6b7280',
      originX: 'center',
      originY: 'center'
    });

    const group = new fabric.Group([line, arrow], {
      selectable: true
    });

    group.connectionId = id;
    group.fromNode = connData.from;
    group.toNode = connData.to;
    group.line = line;
    group.arrow = arrow;

    this.connections.set(id, group);
    this.canvas.add(group);
    this.canvas.sendToBack(group);
  }

  getData() {
    const nodes = [];
    const connections = [];

    this.nodes.forEach((node, id) => {
      nodes.push({
        id: node.nodeId,
        type: node.nodeType,
        text: node.textValue,
        color: node.fill,
        x: node.left,
        y: node.top
      });
    });

    this.connections.forEach((conn, id) => {
      connections.push({
        id: conn.connectionId,
        from: conn.fromNode,
        to: conn.toNode
      });
    });

    return { nodes, connections };
  }

  applyOperation(operation) {
    switch (operation.type) {
      case 'add_node':
        this.addNodeFromData(operation.node);
        break;

      case 'remove_node':
        const node = this.nodes.get(operation.nodeId);
        if (node) {
          this.canvas.remove(node);
          this.nodes.delete(operation.nodeId);

          const connectionsToRemove = [];
          this.connections.forEach((conn, id) => {
            if (conn.fromNode === operation.nodeId || conn.toNode === operation.nodeId) {
              this.canvas.remove(conn);
              connectionsToRemove.push(id);
            }
          });
          connectionsToRemove.forEach(id => this.connections.delete(id));
        }
        break;

      case 'move_node':
        const nodeToMove = this.nodes.get(operation.nodeId);
        if (nodeToMove) {
          nodeToMove.set({ left: operation.x, top: operation.y });
          nodeToMove.setCoords();
          this.updateConnections(operation.nodeId);
        }
        break;

      case 'update_node':
        const nodeToUpdate = this.nodes.get(operation.nodeId);
        if (nodeToUpdate) {
          const items = nodeToUpdate.getObjects();
          const shape = items[0];
          const textObj = items[1];

          if (operation.updates.text !== undefined) {
            textObj.set('text', operation.updates.text);
            nodeToUpdate.textValue = operation.updates.text;
          }
          if (operation.updates.color !== undefined) {
            shape.set('fill', operation.updates.color);
            nodeToUpdate.fill = operation.updates.color;
          }
        }
        break;

      case 'add_connection':
        this.addConnectionFromData(operation.connection);
        break;

      case 'remove_connection':
        const conn = this.connections.get(operation.connectionId);
        if (conn) {
          this.canvas.remove(conn);
          this.connections.delete(operation.connectionId);
        }
        break;
    }

    this.canvas.renderAll();
  }

  addRemoteCursor(userId, cursor) {
    this.removeRemoteCursor(userId);

    const cursorEl = new fabric.Rect({
      width: 15,
      height: 20,
      fill: cursor.color,
      left: cursor.x,
      top: cursor.y,
      selectable: false,
      evented: false,
      opacity: 0.8
    });

    const label = new fabric.Text(cursor.name || userId.slice(0, 4), {
      fontSize: 12,
      fill: cursor.color,
      left: cursor.x + 10,
      top: cursor.y - 15,
      selectable: false,
      evented: false
    });

    const group = new fabric.Group([cursorEl, label], {
      selectable: false,
      evented: false
    });

    this.remoteCursors.set(userId, group);
    this.canvas.add(group);
    this.canvas.renderAll();
  }

  updateRemoteCursor(userId, cursor) {
    const group = this.remoteCursors.get(userId);
    if (group && cursor) {
      group.set({ left: cursor.x, top: cursor.y });
      group.setCoords();
      this.canvas.renderAll();
    }
  }

  removeRemoteCursor(userId) {
    const cursor = this.remoteCursors.get(userId);
    if (cursor) {
      this.canvas.remove(cursor);
      this.remoteCursors.delete(userId);
      this.canvas.renderAll();
    }
  }

  clear() {
    this.nodes.forEach(node => this.canvas.remove(node));
    this.connections.forEach(conn => this.canvas.remove(conn));
    this.remoteCursors.forEach(cursor => this.canvas.remove(cursor));

    this.nodes.clear();
    this.connections.clear();
    this.remoteCursors.clear();

    this.canvas.getObjects().forEach(obj => {
      if (!obj.nodeId && !obj.connectionId && obj.stroke !== '#e5e7eb') {
        this.canvas.remove(obj);
      }
    });

    this.canvas.renderAll();
  }

  destroy() {
    this.canvas.dispose();
  }
}
