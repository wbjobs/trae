import asyncio
import json
import threading
import time
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict, field
from http.server import HTTPServer, BaseHTTPRequestHandler
import websockets
from websockets.server import serve


@dataclass
class DebugDataPoint:
    cycle: int
    timestamp: float
    inputs: Dict[str, bool]
    outputs: Dict[str, bool]


@dataclass
class DebugSession:
    max_history: int = 500
    history: List[DebugDataPoint] = field(default_factory=list)
    current_cycle: int = 0
    is_running: bool = False
    is_paused: bool = False
    step_requested: bool = False
    on_scan_callback: Optional[Callable] = None

    def add_data_point(self, inputs: Dict[str, bool], outputs: Dict[str, bool]) -> DebugDataPoint:
        self.current_cycle += 1
        point = DebugDataPoint(
            cycle=self.current_cycle,
            timestamp=time.time(),
            inputs=dict(inputs),
            outputs=dict(outputs)
        )
        self.history.append(point)
        if len(self.history) > self.max_history:
            self.history.pop(0)
        return point

    def get_all_inputs(self) -> List[str]:
        if self.history:
            return sorted(self.history[-1].inputs.keys())
        return []

    def get_all_outputs(self) -> List[str]:
        if self.history:
            return sorted(self.history[-1].outputs.keys())
        return []

    def get_history_json(self, limit: int = 100) -> str:
        points = self.history[-limit:]
        return json.dumps([{
            "cycle": p.cycle,
            "timestamp": p.timestamp,
            "inputs": p.inputs,
            "outputs": p.outputs
        } for p in points])

    def get_latest_json(self) -> str:
        if not self.history:
            return json.dumps({"cycle": 0, "inputs": {}, "outputs": {}})
        point = self.history[-1]
        return json.dumps({
            "cycle": point.cycle,
            "timestamp": point.timestamp,
            "inputs": point.inputs,
            "outputs": point.outputs
        })

    def clear_history(self):
        self.history = []
        self.current_cycle = 0


class DebugHTTPServer:
    def __init__(self, session: DebugSession, port: int = 8765):
        self.session = session
        self.port = port
        self.http_port = port + 1
        self.websocket_clients: set = set()
        self._http_server: Optional[HTTPServer] = None
        self._http_thread: Optional[threading.Thread] = None
        self._ws_thread: Optional[threading.Thread] = None
        self._running = False

    def start(self):
        self._running = True
        self._start_http_server()
        self._start_websocket_server()
        print(f"🌐 调试面板地址: http://localhost:{self.http_port}")
        print(f"🔌 WebSocket 地址: ws://localhost:{self.port}")

    def stop(self):
        self._running = False
        if self._http_server:
            self._http_server.shutdown()
        for client in list(self.websocket_clients):
            asyncio.run_coroutine_threadsafe(client.close(), asyncio.get_event_loop())

    def _start_http_server(self):
        session = self.session
        ws_port = self.port
        http_port = self.http_port

        class DebugHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == '/' or self.path == '/index.html':
                    self._send_html()
                elif self.path == '/api/status':
                    self._send_json(session.get_latest_json())
                elif self.path == '/api/history':
                    self._send_json(session.get_history_json())
                elif self.path == '/api/inputs':
                    self._send_json(json.dumps(session.get_all_inputs()))
                elif self.path == '/api/outputs':
                    self._send_json(json.dumps(session.get_all_outputs()))
                else:
                    self.send_error(404)

            def do_POST(self):
                content_length = int(self.headers['Content-Length'])
                body = self.rfile.read(content_length).decode('utf-8')
                
                if self.path == '/api/control':
                    try:
                        data = json.loads(body)
                        action = data.get('action')
                        if action == 'pause':
                            session.is_paused = True
                            self._send_json(json.dumps({"status": "paused"}))
                        elif action == 'resume':
                            session.is_paused = False
                            self._send_json(json.dumps({"status": "running"}))
                        elif action == 'step':
                            session.step_requested = True
                            self._send_json(json.dumps({"status": "step"}))
                        elif action == 'reset':
                            session.clear_history()
                            self._send_json(json.dumps({"status": "reset"}))
                        else:
                            self.send_error(400, "Unknown action")
                    except json.JSONDecodeError:
                        self.send_error(400, "Invalid JSON")
                elif self.path == '/api/input':
                    try:
                        data = json.loads(body)
                        name = data.get('name')
                        value = data.get('value')
                        if name and session.history:
                            latest = session.history[-1]
                            latest.inputs[name] = value
                            self._send_json(json.dumps({"status": "ok"}))
                        else:
                            self.send_error(400, "Invalid input")
                    except json.JSONDecodeError:
                        self.send_error(400, "Invalid JSON")
                else:
                    self.send_error(404)

            def _send_html(self):
                html = self._get_debug_html()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(html.encode('utf-8'))

            def _send_json(self, json_str: str):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json_str.encode('utf-8'))

            def _get_debug_html(self) -> str:
                return DEBUG_HTML_TEMPLATE.replace('{{WS_PORT}}', str(ws_port))

            def log_message(self, format, *args):
                pass

        server = HTTPServer(('localhost', http_port), DebugHandler)
        self._http_server = server
        self._http_thread = threading.Thread(target=server.serve_forever, daemon=True)
        self._http_thread.start()

    async def _websocket_handler(self, websocket, path):
        self.websocket_clients.add(websocket)
        try:
            async for message in websocket:
                pass
        finally:
            self.websocket_clients.remove(websocket)

    async def _websocket_server(self):
        async with serve(self._websocket_handler, "localhost", self.port):
            while self._running:
                await asyncio.sleep(0.1)

    def _start_websocket_server(self):
        def run_server():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._websocket_server())

        self._ws_thread = threading.Thread(target=run_server, daemon=True)
        self._ws_thread.start()

    def broadcast_update(self, data: str):
        if not self.websocket_clients:
            return
        
        async def send():
            dead_clients = []
            for client in self.websocket_clients:
                try:
                    await client.send(data)
                except:
                    dead_clients.append(client)
            for dead in dead_clients:
                self.websocket_clients.discard(dead)

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(send(), loop)
        except:
            pass


DEBUG_HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PLC 循环扫描模拟器 - 调试面板</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Consolas, monospace;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #eee;
        }
        .header {
            background: rgba(0,0,0,0.3);
            padding: 15px 30px;
            border-bottom: 2px solid #00d4ff;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { color: #00d4ff; font-size: 24px; }
        .status {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        .cycle-display {
            background: #0f3460;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: bold;
            color: #00d4ff;
        }
        .controls {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s;
        }
        .btn-green { background: #4CAF50; color: white; }
        .btn-green:hover { background: #45a049; }
        .btn-yellow { background: #ff9800; color: white; }
        .btn-yellow:hover { background: #e68a00; }
        .btn-blue { background: #2196F3; color: white; }
        .btn-blue:hover { background: #1976D2; }
        .btn-red { background: #f44336; color: white; }
        .btn-red:hover { background: #d32f2f; }
        .main-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding: 20px;
        }
        .panel {
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .panel h2 {
            color: #00d4ff;
            margin-bottom: 15px;
            font-size: 18px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .register-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 10px;
        }
        .register-item {
            background: rgba(255,255,255,0.08);
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            border: 2px solid transparent;
        }
        .register-item:hover {
            background: rgba(255,255,255,0.15);
            transform: translateY(-2px);
        }
        .register-item.on {
            background: rgba(76, 175, 80, 0.3);
            border-color: #4CAF50;
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.4);
        }
        .register-item.off {
            background: rgba(244, 67, 54, 0.2);
            border-color: #f44336;
        }
        .register-name {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .register-value {
            font-size: 14px;
            opacity: 0.8;
        }
        .waveform-container {
            background: rgba(0,0,0,0.2);
            border-radius: 8px;
            padding: 10px;
            margin-top: 15px;
        }
        .waveform-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .waveform-canvas {
            width: 100%;
            height: 200px;
            background: #0a0a0f;
            border-radius: 5px;
        }
        .legend {
            display: flex;
            gap: 20px;
            margin-top: 10px;
            font-size: 12px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .legend-color {
            width: 20px;
            height: 10px;
            border-radius: 3px;
        }
        .waveform-section {
            grid-column: 1 / -1;
        }
        .waveform-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        .waveform-box {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 10px;
        }
        .waveform-label {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 8px;
            color: #00d4ff;
        }
        .mini-canvas {
            width: 100%;
            height: 80px;
            background: #0a0a0f;
            border-radius: 5px;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .running { animation: pulse 1s infinite; }
        .footer {
            text-align: center;
            padding: 15px;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ PLC 循环扫描模拟器 - 调试面板</h1>
        <div class="status">
            <div class="cycle-display" id="cycleDisplay">周期: 0</div>
            <div class="controls">
                <button class="btn btn-green" onclick="control('resume')" id="btnResume">▶ 运行</button>
                <button class="btn btn-yellow" onclick="control('pause')" id="btnPause">⏸ 暂停</button>
                <button class="btn btn-blue" onclick="control('step')" id="btnStep">⏭ 单步</button>
                <button class="btn btn-red" onclick="control('reset')" id="btnReset">🔄 重置</button>
            </div>
        </div>
    </div>

    <div class="main-container">
        <div class="panel">
            <h2>📥 输入寄存器 (X) - 点击切换状态</h2>
            <div class="register-grid" id="inputGrid">
                <div style="color: #666; text-align: center; padding: 20px;">等待数据...</div>
            </div>
        </div>

        <div class="panel">
            <h2>📤 输出寄存器 (Y) - 显示逻辑结果</h2>
            <div class="register-grid" id="outputGrid">
                <div style="color: #666; text-align: center; padding: 20px;">等待数据...</div>
            </div>
        </div>

        <div class="panel waveform-section">
            <h2>📊 波形图 - 最近100个周期</h2>
            <div class="waveform-grid" id="waveformGrid">
            </div>
            <div class="legend">
                <div class="legend-item">
                    <div class="legend-color" style="background: #4CAF50;"></div>
                    <span>ON (True)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #f44336;"></div>
                    <span>OFF (False)</span>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        PLC 梯形图编辑器 - 调试模式 | WebSocket 连接: <span id="wsStatus">未连接</span>
    </div>

    <script>
        let ws = null;
        let history = [];
        const MAX_POINTS = 100;
        const INPUT_COLORS = ['#2196F3', '#00BCD4', '#03A9F4', '#3F51B5'];
        const OUTPUT_COLORS = ['#FF5722', '#FF9800', '#FFC107', '#E91E63'];

        function connectWebSocket() {
            const url = 'ws://localhost:{{WS_PORT}}';
            ws = new WebSocket(url);
            
            ws.onopen = () => {
                document.getElementById('wsStatus').textContent = '已连接';
                document.getElementById('wsStatus').style.color = '#4CAF50';
                fetchStatus();
            };
            
            ws.onclose = () => {
                document.getElementById('wsStatus').textContent = '断开';
                document.getElementById('wsStatus').style.color = '#f44336';
                setTimeout(connectWebSocket, 2000);
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                updateDisplay(data);
            };
            
            ws.onerror = () => {
                document.getElementById('wsStatus').textContent = '错误';
            };
        }

        async function fetchStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                updateDisplay(data);
            } catch (e) {
                console.error('Fetch error:', e);
            }
        }

        async function control(action) {
            try {
                await fetch('/api/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });
            } catch (e) {
                console.error('Control error:', e);
            }
        }

        async function toggleInput(name, currentValue) {
            try {
                await fetch('/api/input', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, value: !currentValue })
                });
                fetchStatus();
            } catch (e) {
                console.error('Toggle error:', e);
            }
        }

        function updateDisplay(data) {
            document.getElementById('cycleDisplay').textContent = `周期: ${data.cycle}`;
            
            if (data.inputs && Object.keys(data.inputs).length > 0) {
                renderRegisters('inputGrid', data.inputs, true, INPUT_COLORS);
            }
            if (data.outputs && Object.keys(data.outputs).length > 0) {
                renderRegisters('outputGrid', data.outputs, false, OUTPUT_COLORS);
            }
            
            history.push(data);
            if (history.length > MAX_POINTS) {
                history.shift();
            }
            
            renderWaveforms();
        }

        function renderRegisters(containerId, registers, isInput, colors) {
            const container = document.getElementById(containerId);
            container.innerHTML = '';
            
            const names = Object.keys(registers).sort();
            names.forEach((name, index) => {
                const value = registers[name];
                const div = document.createElement('div');
                div.className = `register-item ${value ? 'on' : 'off'}`;
                if (isInput) {
                    div.onclick = () => toggleInput(name, value);
                    div.title = '点击切换状态';
                }
                div.innerHTML = `
                    <div class="register-name">${name}</div>
                    <div class="register-value">${value ? 'ON (1)' : 'OFF (0)'}</div>
                `;
                container.appendChild(div);
            });
        }

        function renderWaveforms() {
            if (history.length === 0) return;
            
            const container = document.getElementById('waveformGrid');
            container.innerHTML = '';
            
            const latest = history[history.length - 1];
            const allSignals = [
                ...Object.keys(latest.inputs).sort(),
                ...Object.keys(latest.outputs).sort()
            ];
            
            const colors = {
                ...Object.fromEntries(
                    Object.keys(latest.inputs).sort().map((k, i) => [k, INPUT_COLORS[i % INPUT_COLORS.length]])
                ),
                ...Object.fromEntries(
                    Object.keys(latest.outputs).sort().map((k, i) => [k, OUTPUT_COLORS[i % OUTPUT_COLORS.length]])
                )
            };
            
            allSignals.forEach(signal => {
                const box = document.createElement('div');
                box.className = 'waveform-box';
                
                const isOutput = signal in latest.outputs;
                const values = history.map(h => {
                    if (signal in h.inputs) return h.inputs[signal];
                    if (signal in h.outputs) return h.outputs[signal];
                    return false;
                });
                
                box.innerHTML = `
                    <div class="waveform-label" style="color: ${colors[signal]}">
                        ${signal} ${isOutput ? '(输出)' : '(输入)'}
                    </div>
                    <canvas class="mini-canvas" id="canvas-${signal}"></canvas>
                `;
                container.appendChild(box);
                
                setTimeout(() => drawWaveform(signal, values, colors[signal]), 0);
            });
        }

        function drawWaveform(signal, values, color) {
            const canvas = document.getElementById(`canvas-${signal}`);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            canvas.width = width;
            canvas.height = height;
            
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, width, height);
            
            if (values.length < 2) return;
            
            const stepX = width / Math.max(values.length - 1, 1);
            const highY = height * 0.2;
            const lowY = height * 0.8;
            
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, highY);
            ctx.lineTo(width, highY);
            ctx.moveTo(0, lowY);
            ctx.lineTo(width, lowY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            let x = 0;
            let prevY = values[0] ? highY : lowY;
            ctx.moveTo(0, prevY);
            
            for (let i = 1; i < values.length; i++) {
                const y = values[i] ? highY : lowY;
                
                if (values[i] !== values[i-1]) {
                    ctx.lineTo(x, prevY);
                    ctx.lineTo(x, y);
                }
                
                x += stepX;
                ctx.lineTo(x, y);
                prevY = y;
            }
            
            ctx.stroke();
        }

        connectWebSocket();
        
        setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                fetchStatus();
            }
        }, 500);
    </script>
</body>
</html>
'''


def create_debug_server(session: DebugSession, port: int = 8765) -> DebugHTTPServer:
    return DebugHTTPServer(session, port)
