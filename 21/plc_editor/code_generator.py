from typing import Set

from .ast_nodes import (
    ASTVisitor,
    ProgramNode,
    RungNode,
    ContactNode,
    OutputNode,
    AndNode,
    OrNode,
    NotNode,
    ASTNode
)


DEBUG_SERVER_CODE = '''
import asyncio
import json
import threading
import time
import webbrowser
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False


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


class DebugServer:
    def __init__(self, session: DebugSession, simulator, port: int = 8765):
        self.session = session
        self.simulator = simulator
        self.port = port
        self.http_port = port + 1
        self._http_server = None
        self._ws_server = None
        self._running = False
        self.websocket_clients = set()

    def start(self):
        if not HAS_WEBSOCKETS:
            print("⚠  警告: websockets 库未安装，调试面板功能不可用")
            print("   请运行: pip install websockets")
            return False
        
        self._running = True
        self._start_http_server()
        self._start_websocket_server()
        print()
        print("=" * 60)
        print("  🔌 PLC 循环扫描模拟器 - 调试模式已启动")
        print("=" * 60)
        print(f"  🌐 Web调试面板:  http://localhost:{self.http_port}")
        print(f"  🔌 WebSocket:     ws://localhost:{self.port}")
        print("=" * 60)
        print()
        print("  控制面板操作:")
        print("    ▶ 运行  - 连续执行扫描周期")
        print("    ⏸ 暂停  - 暂停执行")
        print("    ⏭ 单步  - 执行一个周期")
        print("    🔄 重置  - 清空历史记录")
        print()
        print("  💡 点击输入寄存器可以切换状态 (ON/OFF)")
        print()
        
        try:
            webbrowser.open(f"http://localhost:{self.http_port}")
        except:
            pass
        
        return True

    def stop(self):
        self._running = False
        if self._http_server:
            self._http_server.shutdown()

    def _start_http_server(self):
        session = self.session
        simulator = self.simulator
        ws_port = self.port
        http_port = self.http_port
        server_instance = self

        class DebugHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == '/' or self.path == '/index.html':
                    self._send_html()
                elif self.path == '/api/status':
                    self._send_json(session.get_latest_json())
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
                            simulator.pause()
                            self._send_json(json.dumps({"status": "paused"}))
                        elif action == 'resume':
                            simulator.resume()
                            self._send_json(json.dumps({"status": "running"}))
                        elif action == 'step':
                            simulator.request_step()
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
                        if name is not None:
                            simulator.set_input(name, bool(value))
                            self._send_json(json.dumps({"status": "ok"}))
                        else:
                            self.send_error(400, "Invalid input")
                    except json.JSONDecodeError:
                        self.send_error(400, "Invalid JSON")
                else:
                    self.send_error(404)

            def _send_html(self):
                html = DEBUG_HTML.replace('{{WS_PORT}}', str(ws_port))
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

            def log_message(self, format, *args):
                pass

        server = HTTPServer(('localhost', http_port), DebugHandler)
        self._http_server = server
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

    async def _ws_handler(self, websocket, path):
        self.websocket_clients.add(websocket)
        try:
            async for message in websocket:
                pass
        finally:
            self.websocket_clients.discard(websocket)

    async def _ws_server(self):
        if not HAS_WEBSOCKETS:
            return
        try:
            async with websockets.serve(self._ws_handler, "localhost", self.port):
                while self._running:
                    await asyncio.sleep(0.1)
        except Exception as e:
            print(f"WebSocket 错误: {e}")

    def _start_websocket_server(self):
        def run():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._ws_server())

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

    def broadcast_update(self, data: str):
        if not self.websocket_clients:
            return
        async def send():
            for client in list(self.websocket_clients):
                try:
                    await client.send(data)
                except:
                    self.websocket_clients.discard(client)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(send(), loop)
        except:
            pass


DEBUG_HTML = '''<!DOCTYPE html>
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
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
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
        .waveform-section {
            grid-column: 1 / -1;
        }
        .waveform-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
            height: 70px;
            background: #0a0a0f;
            border-radius: 5px;
        }
        .legend {
            display: flex;
            gap: 20px;
            margin-top: 15px;
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
        <h1>⚡ PLC 循环扫描模拟器</h1>
        <div class="status">
            <div class="cycle-display" id="cycleDisplay">周期: 0</div>
            <div class="controls">
                <button class="btn btn-green" onclick="control('resume')">▶ 运行</button>
                <button class="btn btn-yellow" onclick="control('pause')">⏸ 暂停</button>
                <button class="btn btn-blue" onclick="control('step')">⏭ 单步</button>
                <button class="btn btn-red" onclick="control('reset')">🔄 重置</button>
            </div>
        </div>
    </div>

    <div class="main-container">
        <div class="panel">
            <h2>📥 输入寄存器 - 点击切换状态</h2>
            <div class="register-grid" id="inputGrid">
                <div style="color: #666; text-align: center; padding: 20px;">等待数据...</div>
            </div>
        </div>

        <div class="panel">
            <h2>📤 输出寄存器 - 逻辑结果</h2>
            <div class="register-grid" id="outputGrid">
                <div style="color: #666; text-align: center; padding: 20px;">等待数据...</div>
            </div>
        </div>

        <div class="panel waveform-section">
            <h2>📊 波形图 - 最近100个周期</h2>
            <div class="waveform-grid" id="waveformGrid"></div>
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
        PLC 梯形图编辑器 | WebSocket: <span id="wsStatus">未连接</span>
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
                updateDisplay(JSON.parse(event.data));
            };
        }

        async function fetchStatus() {
            try {
                const response = await fetch('/api/status');
                updateDisplay(await response.json());
            } catch (e) {}
        }

        async function control(action) {
            await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
        }

        async function toggleInput(name, currentValue) {
            await fetch('/api/input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, value: !currentValue })
            });
            fetchStatus();
        }

        function updateDisplay(data) {
            document.getElementById('cycleDisplay').textContent = '周期: ' + data.cycle;
            
            if (data.inputs && Object.keys(data.inputs).length > 0) {
                renderRegisters('inputGrid', data.inputs, true, INPUT_COLORS);
            }
            if (data.outputs && Object.keys(data.outputs).length > 0) {
                renderRegisters('outputGrid', data.outputs, false, OUTPUT_COLORS);
            }
            
            history.push(data);
            if (history.length > MAX_POINTS) history.shift();
            renderWaveforms();
        }

        function renderRegisters(containerId, registers, isInput, colors) {
            const container = document.getElementById(containerId);
            container.innerHTML = '';
            
            Object.keys(registers).sort().forEach((name, index) => {
                const value = registers[name];
                const div = document.createElement('div');
                div.className = 'register-item ' + (value ? 'on' : 'off');
                if (isInput) {
                    div.onclick = () => toggleInput(name, value);
                    div.title = '点击切换';
                }
                div.innerHTML = '<div class="register-name">' + name + '</div>' +
                    '<div class="register-value">' + (value ? 'ON' : 'OFF') + '</div>';
                container.appendChild(div);
            });
        }

        function renderWaveforms() {
            if (history.length === 0) return;
            
            const container = document.getElementById('waveformGrid');
            container.innerHTML = '';
            
            const latest = history[history.length - 1];
            const signals = [
                ...Object.keys(latest.inputs).sort().map(k => ({name: k, isOutput: false})),
                ...Object.keys(latest.outputs).sort().map(k => ({name: k, isOutput: true}))
            ];
            
            const colors = {};
            Object.keys(latest.inputs).sort().forEach((k, i) => colors[k] = INPUT_COLORS[i % INPUT_COLORS.length]);
            Object.keys(latest.outputs).sort().forEach((k, i) => colors[k] = OUTPUT_COLORS[i % OUTPUT_COLORS.length]);
            
            signals.forEach(sig => {
                const values = history.map(h => {
                    if (sig.name in h.inputs) return h.inputs[sig.name];
                    if (sig.name in h.outputs) return h.outputs[sig.name];
                    return false;
                });
                
                const box = document.createElement('div');
                box.className = 'waveform-box';
                box.innerHTML = '<div class="waveform-label" style="color:' + colors[sig.name] + '">' +
                    sig.name + ' ' + (sig.isOutput ? '(输出)' : '(输入)') + '</div>' +
                    '<canvas class="mini-canvas" id="cv-' + sig.name + '"></canvas>';
                container.appendChild(box);
                
                setTimeout(() => drawWaveform(sig.name, values, colors[sig.name]), 0);
            });
        }

        function drawWaveform(signal, values, color) {
            const canvas = document.getElementById('cv-' + signal);
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
            const highY = height * 0.25;
            const lowY = height * 0.75;
            
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
            if (!ws || ws.readyState !== WebSocket.OPEN) fetchStatus();
        }, 500);
    </script>
</body>
</html>
'''
'''


class CodeGenerator(ASTVisitor):
    def __init__(self):
        self.inputs: Set[str] = set()
        self.outputs: Set[str] = set()
        self._code_lines: list = []

    def visit_contact(self, node: ContactNode) -> str:
        self.inputs.add(node.name)
        if node.negated:
            return f"not plc_inputs['{node.name}']"
        return f"plc_inputs['{node.name}']"

    def visit_output(self, node: OutputNode) -> str:
        self.outputs.add(node.name)
        return node.name

    def visit_not(self, node: NotNode) -> str:
        operand_code = node.operand.accept(self)
        return f"not ({operand_code})"

    def visit_and(self, node: AndNode) -> str:
        left_code = node.left.accept(self)
        right_code = node.right.accept(self)
        return f"({left_code} and {right_code})"

    def visit_or(self, node: OrNode) -> str:
        left_code = node.left.accept(self)
        right_code = node.right.accept(self)
        return f"({left_code} or {right_code})"

    def visit_rung(self, node: RungNode) -> str:
        condition_code = node.condition.accept(self)
        output_name = node.output.accept(self)
        return f"        plc_outputs['{output_name}'] = {condition_code}"

    def visit_program(self, node: ProgramNode) -> str:
        self._code_lines = [
            "# -*- coding: utf-8 -*-",
            "# Auto-generated PLC simulation script with Debug Server",
            "# Generated by PLC Editor - Code Generator",
            "#",
            "# 使用方法:",
            "#   1. 安装依赖: pip install websockets",
            "#   2. 运行: python output.py",
            "#   3. 浏览器自动打开调试面板",
            "#",
            "# 调试面板功能:",
            "#   - 实时显示输入/输出状态",
            "#   - 波形图展示每个周期的变化",
            "#   - 暂停/继续/单步执行控制",
            "#   - 点击输入切换状态",
            "",
            DEBUG_SERVER_CODE,
            "",
            "",
            "class PLCSimulation:",
            "    def __init__(self, scan_interval_ms: int = 200):",
            "        self.scan_interval_ms = scan_interval_ms",
            "        self.inputs: Dict[str, bool] = {}",
            "        self.outputs: Dict[str, bool] = {}",
            "        self._scan_count: int = 0",
            "        self._running: bool = False",
            "        self._paused: bool = True",
            "        self._step_requested: bool = False",
            "        self._debug_session = DebugSession()",
            "        self._debug_server: Optional[DebugServer] = None",
            "",
        ]
        
        if self.inputs:
            for input_name in sorted(self.inputs):
                self._code_lines.append(f"        self.inputs['{input_name}'] = False")
        
        if self.outputs:
            for output_name in sorted(self.outputs):
                self._code_lines.append(f"        self.outputs['{output_name}'] = False")
        
        self._code_lines.extend([
            "",
            "    def set_input(self, name: str, value: bool) -> None:",
            "        self.inputs[name] = value",
            "",
            "    def get_output(self, name: str) -> bool:",
            "        return self.outputs.get(name, False)",
            "",
            "    def get_all_inputs(self) -> Dict[str, bool]:",
            "        return dict(self.inputs)",
            "",
            "    def get_all_outputs(self) -> Dict[str, bool]:",
            "        return dict(self.outputs)",
            "",
            "    def scan(self) -> None:",
            "        plc_inputs = self.inputs",
            "        plc_outputs = self.outputs",
        ])
        
        for rung in node.rungs:
            rung_code = rung.accept(self)
            self._code_lines.append(rung_code)
        
        self._code_lines.extend([
            "        self._scan_count += 1",
            "        self._debug_session.add_data_point(self.inputs, self.outputs)",
            "        if self._debug_server:",
            "            self._debug_server.broadcast_update(self._debug_session.get_latest_json())",
            "",
            "    def pause(self) -> None:",
            "        self._paused = True",
            "",
            "    def resume(self) -> None:",
            "        self._paused = False",
            "",
            "    def request_step(self) -> None:",
            "        self._step_requested = True",
            "",
            "    def is_paused(self) -> bool:",
            "        return self._paused",
            "",
            "    def run(self, debug_mode: bool = True) -> None:",
            "        if debug_mode and HAS_WEBSOCKETS:",
            "            self._debug_server = DebugServer(self._debug_session, self)",
            "            self._debug_server.start()",
            "",
            "        self._running = True",
            "        print('PLC 模拟已启动，按 Ctrl+C 停止...')",
            "",
            "        try:",
            "            while self._running:",
            "                if self._paused and not self._step_requested:",
            "                    import time",
            "                    time.sleep(0.05)",
            "                    continue",
            "",
            "                if self._step_requested:",
            "                    self._step_requested = False",
            "",
            "                self.scan()",
            "                import time",
            "                time.sleep(self.scan_interval_ms / 1000.0)",
            "        except KeyboardInterrupt:",
            "            pass",
            "        finally:",
            "            self._running = False",
            "            if self._debug_server:",
            "                self._debug_server.stop()",
            "            print('PLC 模拟已停止')",
            "",
            "",
            "def create_simulation() -> PLCSimulation:",
            "    return PLCSimulation()",
            "",
            "",
            "if __name__ == '__main__':",
            "    sim = create_simulation()",
            "    sim.run(debug_mode=True)",
        ])
        
        return "\n".join(self._code_lines)


def generate_code(ast: ProgramNode) -> str:
    generator = CodeGenerator()
    return ast.accept(generator)
