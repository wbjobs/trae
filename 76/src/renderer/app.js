const { ipcRenderer } = require('electron');
const Recorder = require('../recorder/Recorder');
const Player = require('../player/Player');
const loader = require('@monaco-editor/loader');

class App {
    constructor() {
        this.recorder = new Recorder();
        this.player = new Player();
        this.editor = null;
        this.currentScript = null;
        this.init();
    }

    async init() {
        await this.initMonaco();
        this.bindEvents();
        this.setupIPC();
        this.updateUI();
        this.loadDefaultScript();
    }

    async initMonaco() {
        try {
            loader.config({
                paths: {
                    vs: 'node_modules/monaco-editor/min/vs'
                }
            });

            const monaco = await loader.init();
            
            this.editor = monaco.editor.create(document.getElementById('monacoEditor'), {
                value: this.getEmptyScript(),
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: {
                    enabled: true
                },
                fontSize: 13,
                wordWrap: 'on',
                formatOnPaste: true,
                tabSize: 2,
                scrollBeyondLastLine: false
            });

            this.editor.onDidChangeModelContent(() => {
                try {
                    const content = this.editor.getValue();
                    this.currentScript = JSON.parse(content);
                    this.updateStepList();
                } catch (e) {
                }
            });
        } catch (err) {
            console.error('Failed to initialize Monaco:', err);
            document.getElementById('monacoEditor').innerHTML = 
                '<div style="padding: 20px; color: #f87171;">编辑器加载失败，请检查依赖是否正确安装</div>';
        }
    }

    bindEvents() {
        document.getElementById('btnRecord').addEventListener('click', () => this.toggleRecord());
        document.getElementById('btnStop').addEventListener('click', () => this.stopRecord());
        document.getElementById('btnPlay').addEventListener('click', () => this.togglePlay());
        document.getElementById('btnPause').addEventListener('click', () => this.togglePause());
        document.getElementById('btnSave').addEventListener('click', () => this.saveScript());
        document.getElementById('btnLoad').addEventListener('click', () => this.loadScript());
        document.getElementById('btnClear').addEventListener('click', () => this.clearScript());
        
        document.getElementById('btnCaptureAnchor').addEventListener('click', () => this.captureScreenshotAnchor());
        document.getElementById('btnAddFindImage').addEventListener('click', () => this.addFindImageEvent());
        document.getElementById('btnAddClickImage').addEventListener('click', () => this.addClickImageEvent());
        document.getElementById('btnAddWaitImage').addEventListener('click', () => this.addWaitImageEvent());

        document.getElementById('captureMouseMove').addEventListener('change', (e) => {
            this.recorder.captureMouseMove = e.target.checked;
        });

        document.getElementById('captureWheel').addEventListener('change', (e) => {
            this.recorder.captureWheel = e.target.checked;
        });

        document.getElementById('filterSensitive').addEventListener('change', (e) => {
            this.recorder.setSensitiveFilterEnabled(e.target.checked);
        });

        document.getElementById('mouseThreshold').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.recorder.mouseMoveThreshold = value;
            document.getElementById('thresholdValue').textContent = value;
        });

        document.getElementById('playSpeed').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.player.setSpeed(value);
            document.getElementById('speedValue').textContent = value.toFixed(1);
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });

        this.recorder.onEvent((event) => {
            this.addLogEntry(event);
            this.updateStats();
        });

        this.recorder.onStatus((status) => {
            this.updateUI();
        });

        this.player.onEvent((event, index) => {
            this.highlightCurrentStep(index);
            document.getElementById('currentIndex').textContent = index;
        });

        this.player.onStatus((status) => {
            this.updateUI();
        });

        this.player.onComplete((result) => {
            this.updateUI();
            if (result.success) {
                this.addLogEntry({ type: 'system', message: '播放完成' });
            } else {
                this.addLogEntry({ type: 'error', message: `播放失败: ${result.error}` });
            }
        });
    }

    setupIPC() {
        ipcRenderer.on('toggle-record', () => this.toggleRecord());
        ipcRenderer.on('stop-record', () => this.stopRecord());
        ipcRenderer.on('toggle-play', () => this.togglePlay());
        
        ipcRenderer.on('script-saved', (event, filePath) => {
            this.addLogEntry({ type: 'system', message: `脚本已保存到: ${filePath}` });
        });

        ipcRenderer.on('script-loaded', (event, script) => {
            this.currentScript = script;
            this.editor.setValue(JSON.stringify(script, null, 2));
            this.updateStepList();
            this.addLogEntry({ type: 'system', message: '脚本加载成功' });
        });

        ipcRenderer.on('script-load-error', (event, error) => {
            this.addLogEntry({ type: 'error', message: `脚本加载失败: ${error}` });
        });

        ipcRenderer.on('screenshot:captured', (event, data) => {
            this.addLogEntry({ type: 'system', message: `截图锚点已保存: ${data.path}` });
            this.promptInsertImageEvent(data.path, data.rect);
        });

        ipcRenderer.on('screenshot:error', (event, error) => {
            this.addLogEntry({ type: 'error', message: `截图失败: ${error}` });
        });
    }

    toggleRecord() {
        if (this.recorder.isRecording) {
            this.stopRecord();
        } else {
            this.startRecord();
        }
    }

    startRecord() {
        this.recorder.captureMouseMove = document.getElementById('captureMouseMove').checked;
        this.recorder.captureWheel = document.getElementById('captureWheel').checked;
        this.recorder.mouseMoveThreshold = parseInt(document.getElementById('mouseThreshold').value);
        
        this.recorder.start();
        this.addLogEntry({ type: 'system', message: '开始录制...' });
    }

    stopRecord() {
        const script = this.recorder.stop();
        if (script) {
            this.currentScript = script;
            if (this.editor) {
                this.editor.setValue(JSON.stringify(script, null, 2));
            }
            this.updateStepList();
            this.addLogEntry({ type: 'system', message: `录制完成，共 ${script.eventCount} 个事件` });
        }
        this.updateStats();
    }

    togglePlay() {
        if (this.player.isPlaying) {
            if (this.player.isPaused) {
                this.player.resume();
            } else {
                this.player.pause();
            }
        } else {
            this.startPlay();
        }
    }

    async startPlay() {
        if (!this.currentScript) {
            this.addLogEntry({ type: 'error', message: '没有可播放的脚本' });
            return;
        }

        try {
            const content = this.editor.getValue();
            const script = JSON.parse(content);
            this.currentScript = script;
            this.addLogEntry({ type: 'system', message: '开始播放...' });
            await this.player.play(script);
        } catch (err) {
            this.addLogEntry({ type: 'error', message: `播放失败: ${err.message}` });
        }
    }

    togglePause() {
        if (this.player.isPaused) {
            this.player.resume();
        } else {
            this.player.pause();
        }
    }

    saveScript() {
        try {
            const content = this.editor.getValue();
            const script = JSON.parse(content);
            ipcRenderer.send('save-script', script);
        } catch (err) {
            this.addLogEntry({ type: 'error', message: `保存失败: ${err.message}` });
        }
    }

    loadScript() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                ipcRenderer.send('load-script', file.path);
            }
        };
        input.click();
    }

    clearScript() {
        if (confirm('确定要清空当前脚本吗？')) {
            this.currentScript = null;
            if (this.editor) {
                this.editor.setValue(this.getEmptyScript());
            }
            document.getElementById('eventLog').innerHTML = '';
            document.getElementById('stepList').innerHTML = '';
            this.updateStats();
            this.addLogEntry({ type: 'system', message: '脚本已清空' });
        }
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tab}`);
        });
    }

    updateUI() {
        const isRecording = this.recorder.isRecording;
        const isPlaying = this.player.isPlaying;
        const isPaused = this.player.isPaused;

        document.getElementById('btnRecord').disabled = isPlaying;
        document.getElementById('btnStop').disabled = !isRecording;
        document.getElementById('btnPlay').disabled = isRecording;
        document.getElementById('btnPause').disabled = !isPlaying;

        document.getElementById('btnRecord').innerHTML = isRecording 
            ? '<span class="btn-icon">⏹</span>停止录制'
            : '<span class="btn-icon">⏺</span>录制 (Ctrl+Shift+R)';

        document.getElementById('btnPlay').innerHTML = isPaused 
            ? '<span class="btn-icon">▶</span>继续'
            : '<span class="btn-icon">▶</span>播放 (Ctrl+Shift+P)';

        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        statusIndicator.className = 'status-indicator';
        if (isRecording) {
            statusIndicator.classList.add('status-recording');
            statusText.textContent = '录制中';
        } else if (isPaused) {
            statusIndicator.classList.add('status-paused');
            statusText.textContent = '已暂停';
        } else if (isPlaying) {
            statusIndicator.classList.add('status-playing');
            statusText.textContent = '播放中';
        } else {
            statusIndicator.classList.add('status-idle');
            statusText.textContent = '空闲';
        }
    }

    updateStats() {
        const status = this.recorder.getStatus();
        document.getElementById('eventCount').textContent = status.eventCount;
        document.getElementById('recordDuration').textContent = Math.floor(status.duration / 1000) + 's';
        document.getElementById('sensitiveContext').textContent = status.inSensitiveContext ? '是' : '否';
    }

    addLogEntry(event) {
        const logContainer = document.getElementById('eventLog');
        const entry = document.createElement('div');
        entry.className = 'log-entry';

        let typeClass = 'log-type-mouse';
        let prefix = '[MOUSE]';
        let content = '';

        if (event.type === 'system') {
            typeClass = '';
            prefix = '[系统]';
            content = event.message;
        } else if (event.type === 'error') {
            typeClass = 'log-type-sensitive';
            prefix = '[错误]';
            content = event.message;
        } else if (event.type === 'mouseClick' || event.type === 'mouseMove' || event.type === 'mouseWheel') {
            typeClass = 'log-type-mouse';
            prefix = '[鼠标]';
            if (event.type === 'mouseClick') {
                content = `${event.action} ${event.button} (${event.x}, ${event.y})`;
            } else if (event.type === 'mouseMove') {
                content = `移动到 (${event.x}, ${event.y})`;
            } else {
                content = `滚轮 ${event.direction === 'vertical' ? '垂直' : '水平'}: ${event.rotation}`;
            }
        } else if (event.type === 'keyPress' || event.type === 'typeText') {
            typeClass = event.isSensitive || event.hasSensitive ? 'log-type-sensitive' : 'log-type-key';
            prefix = '[键盘]';
            if (event.type === 'typeText') {
                content = `输入: ${event.hasSensitive ? '***(敏感内容已过滤)***' : event.text}`;
            } else {
                content = `${event.action}: ${event.isSensitive ? '*' : event.key}`;
            }
        } else if (event.type === 'windowChange') {
            typeClass = 'log-type-window';
            prefix = '[窗口]';
            content = `切换到: ${event.window.owner} - ${event.window.title}${event.isSensitive ? ' (敏感上下文)' : ''}`;
        }

        entry.innerHTML = `<span class="${typeClass}">${prefix}</span> ${content}`;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;

        while (logContainer.children.length > 100) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    updateStepList() {
        const stepList = document.getElementById('stepList');
        if (!this.currentScript || !this.currentScript.events) {
            stepList.innerHTML = '<div style="color: #6b7280; padding: 20px;">暂无步骤</div>';
            return;
        }

        stepList.innerHTML = this.currentScript.events.map((event, index) => {
            let typeLabel = event.type;
            let content = '';

            switch (event.type) {
                case 'mouseClick':
                    typeLabel = '鼠标点击';
                    content = `${event.action} ${event.button} (${event.x}, ${event.y})`;
                    break;
                case 'mouseMove':
                    typeLabel = '鼠标移动';
                    content = `移动到 (${event.x}, ${event.y})`;
                    break;
                case 'mouseWheel':
                    typeLabel = '鼠标滚轮';
                    content = `滚动: ${event.rotation}`;
                    break;
                case 'keyPress':
                    typeLabel = '按键';
                    content = `${event.action}: ${event.key}`;
                    break;
                case 'typeText':
                    typeLabel = '输入文本';
                    content = event.hasSensitive ? '***(敏感内容)***' : `"${event.text}"`;
                    break;
                case 'windowChange':
                    typeLabel = '窗口切换';
                    content = `${event.window.owner} - ${event.window.title}`;
                    break;
                case 'wait':
                    typeLabel = '等待';
                    content = event.duration ? `${event.duration}ms` : '条件等待';
                    break;
                case 'if':
                    typeLabel = '条件判断';
                    content = '条件分支';
                    break;
                case 'loop':
                    typeLabel = '循环';
                    content = `循环 ${event.times} 次`;
                    break;
                case 'setVariable':
                    typeLabel = '设置变量';
                    content = `${event.name} = ${event.value}`;
                    break;
                case 'findImage':
                    typeLabel = '查找图像';
                    content = `查找: ${this._truncatePath(event.templatePath)}`;
                    break;
                case 'clickImage':
                    typeLabel = '点击图像';
                    content = `点击: ${this._truncatePath(event.templatePath)}`;
                    break;
                case 'waitForImage':
                    typeLabel = '等待图像';
                    content = `等待: ${this._truncatePath(event.templatePath)}`;
                    break;
            }

            return `
                <div class="step-item" data-index="${index}">
                    <div class="step-index">${index + 1}</div>
                    <div class="step-type">${typeLabel}</div>
                    <div class="step-content">${content}</div>
                    <div class="step-delay">${event.delay || 0}ms</div>
                </div>
            `;
        }).join('');
    }

    highlightCurrentStep(index) {
        document.querySelectorAll('.step-item').forEach((item, i) => {
            item.classList.toggle('current', i === index);
            if (i === index) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    _truncatePath(filePath, maxLength = 40) {
        if (!filePath) return '';
        if (filePath.length <= maxLength) return filePath;
        const parts = filePath.split(/[/\\]/);
        const fileName = parts[parts.length - 1];
        return '.../' + fileName;
    }

    getEmptyScript() {
        return JSON.stringify({
            version: '1.0',
            createdAt: new Date().toISOString(),
            description: '自动化脚本',
            variables: {
                exampleVar: '示例变量'
            },
            events: [
                {
                    type: 'comment',
                    text: '这是一个示例脚本，你可以在此编辑或录制新脚本'
                },
                {
                    type: 'wait',
                    duration: 1000,
                    delay: 0
                },
                {
                    type: 'setVariable',
                    name: 'counter',
                    value: 0,
                    delay: 0
                },
                {
                    type: 'loop',
                    times: 3,
                    events: [
                        {
                            type: 'comment',
                            text: '循环体内容'
                        }
                    ],
                    delay: 0
                }
            ]
        }, null, 2);
    }

    captureScreenshotAnchor() {
        this.addLogEntry({ type: 'system', message: '请在屏幕上拖动选择截图区域...' });
        ipcRenderer.send('screenshot:start-selection');
    }

    promptInsertImageEvent(imagePath, rect) {
        const eventType = prompt(
            '选择要插入的事件类型:\n' +
            '1 - findImage (查找图像)\n' +
            '2 - clickImage (点击图像)\n' +
            '3 - waitForImage (等待图像)\n' +
            '4 - 仅复制路径',
            '2'
        );

        if (eventType === null) return;

        let event = null;
        switch (eventType) {
            case '1':
                event = this.createFindImageEvent(imagePath);
                break;
            case '2':
                event = this.createClickImageEvent(imagePath);
                break;
            case '3':
                event = this.createWaitForImageEvent(imagePath);
                break;
            case '4':
                navigator.clipboard.writeText(imagePath);
                this.addLogEntry({ type: 'system', message: '图像路径已复制到剪贴板' });
                return;
            default:
                return;
        }

        this.insertEventToScript(event);
    }

    createFindImageEvent(imagePath) {
        return {
            type: 'findImage',
            templatePath: imagePath,
            threshold: 0.85,
            moveTo: true,
            storePositionAs: 'foundPosition',
            storeResultAs: 'findResult',
            throwOnNotFound: true,
            delay: 0
        };
    }

    createClickImageEvent(imagePath) {
        return {
            type: 'clickImage',
            templatePath: imagePath,
            threshold: 0.85,
            button: 'left',
            clicks: 1,
            timeout: 5000,
            interval: 500,
            storeResultAs: 'clickResult',
            throwOnNotFound: true,
            delay: 0
        };
    }

    createWaitForImageEvent(imagePath) {
        return {
            type: 'waitForImage',
            templatePath: imagePath,
            threshold: 0.85,
            timeout: 10000,
            interval: 500,
            storePositionAs: 'foundPosition',
            storeResultAs: 'waitResult',
            throwOnTimeout: true,
            delay: 0
        };
    }

    addFindImageEvent() {
        const path = prompt('请输入模板图像路径:', '');
        if (path) {
            const event = this.createFindImageEvent(path);
            this.insertEventToScript(event);
        }
    }

    addClickImageEvent() {
        const path = prompt('请输入模板图像路径:', '');
        if (path) {
            const event = this.createClickImageEvent(path);
            this.insertEventToScript(event);
        }
    }

    addWaitImageEvent() {
        const path = prompt('请输入模板图像路径:', '');
        if (path) {
            const event = this.createWaitForImageEvent(path);
            this.insertEventToScript(event);
        }
    }

    insertEventToScript(event) {
        try {
            const content = this.editor.getValue();
            const script = JSON.parse(content);
            
            if (!script.events) {
                script.events = [];
            }
            
            script.events.push(event);
            
            this.currentScript = script;
            this.editor.setValue(JSON.stringify(script, null, 2));
            this.updateStepList();
            
            this.addLogEntry({ type: 'system', message: `已添加 ${event.type} 事件` });
        } catch (err) {
            this.addLogEntry({ type: 'error', message: `添加事件失败: ${err.message}` });
        }
    }

    loadDefaultScript() {
        if (this.editor) {
            this.editor.setValue(this.getEmptyScript());
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
