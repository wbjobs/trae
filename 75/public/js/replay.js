class IndexedDBManager {
    constructor(dbName = 'TowerDefenseReplay', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('replays')) {
                    const replayStore = db.createObjectStore('replays', { keyPath: 'id' });
                    replayStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains('frames')) {
                    const frameStore = db.createObjectStore('frames', { keyPath: 'id', autoIncrement: true });
                    frameStore.createIndex('replayId', 'replayId', { unique: false });
                    frameStore.createIndex('frameTime', 'frameTime', { unique: false });
                }
            };
        });
    }

    async saveReplay(replayData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['replays'], 'readwrite');
            const store = transaction.objectStore('replays');
            const request = store.add(replayData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveFrames(frames) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['frames'], 'readwrite');
            const store = transaction.objectStore('frames');

            let count = 0;
            const total = frames.length;

            const saveNext = (index) => {
                if (index >= total) {
                    resolve(count);
                    return;
                }

                const request = store.add(frames[index]);
                request.onsuccess = () => {
                    count++;
                    saveNext(index + 1);
                };
                request.onerror = () => {
                    saveNext(index + 1);
                };
            };

            saveNext(0);
        });
    }

    async getReplays() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['replays'], 'readonly');
            const store = transaction.objectStore('replays');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getFrames(replayId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['frames'], 'readonly');
            const store = transaction.objectStore('frames');
            const index = store.index('replayId');
            const range = IDBKeyRange.only(replayId);
            const request = index.getAll(range);

            request.onsuccess = () => resolve(request.result.sort((a, b) => a.frameTime - b.frameTime));
            request.onerror = () => reject(request.error);
        });
    }

    async deleteReplay(replayId) {
        return new Promise((resolve, reject) => {
            const frameTransaction = this.db.transaction(['frames'], 'readwrite');
            const frameStore = frameTransaction.objectStore('frames');
            const frameIndex = frameStore.index('replayId');
            const frameRange = IDBKeyRange.only(replayId);
            
            frameIndex.openCursor(frameRange).onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            frameTransaction.oncomplete = () => {
                const replayTransaction = this.db.transaction(['replays'], 'readwrite');
                const replayStore = replayTransaction.objectStore('replays');
                const request = replayStore.delete(replayId);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            };
        });
    }

    async getLatestReplay() {
        const replays = await this.getReplays();
        if (replays.length === 0) return null;
        return replays.sort((a, b) => b.timestamp - a.timestamp)[0];
    }
}

class ReplayRecorder {
    constructor() {
        this.db = new IndexedDBManager();
        this.currentReplayId = null;
        this.frames = [];
        this.lastSavedFrameTime = 0;
        this.frameInterval = 100;
        this.recording = false;
        this.lastMonsterStates = new Map();
        this.lastProjectileStates = new Map();
        this.damageEvents = [];
    }

    async init() {
        await this.db.init();
    }

    startRecording(gameData) {
        this.currentReplayId = `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.frames = [];
        this.lastSavedFrameTime = 0;
        this.recording = true;
        this.lastMonsterStates.clear();
        this.lastProjectileStates.clear();
        this.damageEvents = [];

        this.replayData = {
            id: this.currentReplayId,
            timestamp: Date.now(),
            duration: gameData.duration,
            mapWidth: gameData.mapWidth,
            mapHeight: gameData.mapHeight,
            path: gameData.path,
            towers: gameData.towers,
            playerName: gameData.playerName,
            opponentName: gameData.opponentName,
            playerIndex: gameData.playerIndex
        };
    }

    recordFrame(currentTime, gameState) {
        if (!this.recording) return;

        if (currentTime - this.lastSavedFrameTime >= this.frameInterval) {
            this.lastSavedFrameTime = currentTime;

            const monsterDiffs = [];
            for (const monster of gameState.monsters) {
                if (!monster.alive) continue;

                const lastState = this.lastMonsterStates.get(monster.id);
                const hasChanged = !lastState || 
                    lastState.x !== monster.x || 
                    lastState.y !== monster.y || 
                    lastState.health !== monster.health ||
                    lastState.shield !== monster.shield;

                if (hasChanged || !lastState) {
                    monsterDiffs.push({
                        id: monster.id,
                        x: Math.round(monster.x * 10) / 10,
                        y: Math.round(monster.y * 10) / 10,
                        h: Math.round(monster.health),
                        s: monster.shield > 0 ? 1 : 0,
                        sp: monster.speedBoostTime > 0 ? 1 : 0,
                        o: monster.ownerIndex
                    });

                    this.lastMonsterStates.set(monster.id, {
                        x: monster.x,
                        y: monster.y,
                        health: monster.health,
                        shield: monster.shield
                    });
                }
            }

            const projectileDiffs = [];
            const currentProjectileIds = new Set();
            for (const proj of gameState.projectiles) {
                if (!proj.alive) continue;
                currentProjectileIds.add(proj.id);
                
                const lastState = this.lastProjectileStates.get(proj.id);
                const hasChanged = !lastState || 
                    Math.abs(lastState.x - proj.x) > 2 || 
                    Math.abs(lastState.y - proj.y) > 2;

                if (hasChanged) {
                    projectileDiffs.push({
                        id: proj.id,
                        x: Math.round(proj.x * 10) / 10,
                        y: Math.round(proj.y * 10) / 10
                    });
                    this.lastProjectileStates.set(proj.id, { x: proj.x, y: proj.y });
                }
            }

            for (const [id] of this.lastProjectileStates) {
                if (!currentProjectileIds.has(id)) {
                    this.lastProjectileStates.delete(id);
                }
            }

            if (monsterDiffs.length > 0 || projectileDiffs.length > 0) {
                this.frames.push({
                    replayId: this.currentReplayId,
                    frameTime: Math.round(currentTime),
                    m: monsterDiffs,
                    p: projectileDiffs
                });
            }
        }
    }

    recordDamage(x, y, amount) {
        if (!this.recording) return;
        this.damageEvents.push({ x, y, amount, time: Date.now() });
    }

    async stopRecording(finalScores) {
        if (!this.recording) return;
        
        this.recording = false;
        this.replayData.finalScores = finalScores;
        this.replayData.damageHeatmap = this.generateHeatmapData();

        try {
            await this.db.saveReplay(this.replayData);
            await this.db.saveFrames(this.frames);
            console.log(`回放已保存: ${this.frames.length} 帧`);
        } catch (e) {
            console.error('保存回放失败:', e);
        }

        return this.currentReplayId;
    }

    generateHeatmapData() {
        const gridSize = 50;
        const heatmap = new Map();

        for (const event of this.damageEvents) {
            const gridX = Math.floor(event.x / gridSize);
            const gridY = Math.floor(event.y / gridSize);
            const key = `${gridX},${gridY}`;
            heatmap.set(key, (heatmap.get(key) || 0) + event.amount);
        }

        return Array.from(heatmap.entries()).map(([key, value]) => {
            const [x, y] = key.split(',').map(Number);
            return { x: x * gridSize + gridSize / 2, y: y * gridSize + gridSize / 2, intensity: value };
        });
    }
}

class ReplayPlayer {
    constructor(canvas, game) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.game = game;
        this.db = new IndexedDBManager();
        
        this.playing = false;
        this.currentTime = 0;
        this.duration = 0;
        this.speed = 1;
        this.heatmapEnabled = false;
        this.followEnabled = false;
        this.followTarget = null;
        
        this.replayData = null;
        this.frames = [];
        this.currentFrameIndex = 0;
        
        this.monsters = new Map();
        this.projectiles = new Map();
        
        this.camera = null;
        this.lastFrameTime = 0;
        this.timelineDragging = false;
    }

    async init() {
        await this.db.init();
        this.setupEventListeners();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupEventListeners() {
        document.getElementById('playPauseBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('speedBtn').addEventListener('click', () => this.cycleSpeed());
        document.getElementById('heatmapBtn').addEventListener('click', () => this.toggleHeatmap());
        document.getElementById('followBtn').addEventListener('click', () => this.toggleFollow());
        document.getElementById('exitReplayBtn').addEventListener('click', () => this.exitReplay());

        const timelineTrack = document.querySelector('.timeline-track');
        const timelineHandle = document.getElementById('timelineHandle');

        timelineTrack.addEventListener('mousedown', (e) => this.startTimelineDrag(e));
        document.addEventListener('mousemove', (e) => this.onTimelineDrag(e));
        document.addEventListener('mouseup', () => this.endTimelineDrag());

        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    }

    async loadLatestReplay() {
        const latest = await this.db.getLatestReplay();
        if (!latest) {
            alert('没有找到回放数据');
            return false;
        }
        return this.loadReplay(latest.id);
    }

    async loadReplay(replayId) {
        const replays = await this.db.getReplays();
        this.replayData = replays.find(r => r.id === replayId);
        
        if (!this.replayData) {
            alert('回放不存在');
            return false;
        }

        this.frames = await this.db.getFrames(replayId);
        this.duration = this.replayData.duration;
        
        this.monsters.clear();
        this.projectiles.clear();
        this.currentFrameIndex = 0;
        this.currentTime = 0;

        const replayCanvas = this.canvas;
        this.camera = {
            x: this.replayData.mapWidth / 2,
            y: this.replayData.mapHeight / 2,
            scale: Math.min(
                this.canvas.width / this.replayData.mapWidth,
                this.canvas.height / this.replayData.mapHeight
            ) * 0.9,
            shakeAmount: 0,
            shakeTime: 0,
            
            worldToScreen(wx, wy) {
                const shakeX = (Math.random() - 0.5) * this.shakeAmount;
                const shakeY = (Math.random() - 0.5) * this.shakeAmount;
                return {
                    x: (wx - this.x) * this.scale + replayCanvas.width / 2 + shakeX,
                    y: (wy - this.y) * this.scale + replayCanvas.height / 2 + shakeY
                };
            },
            
            update(dt) {
                if (this.shakeTime > 0) {
                    this.shakeTime -= dt;
                    this.shakeAmount *= 0.9;
                } else {
                    this.shakeAmount = 0;
                }
            },
            
            follow(x, y, dt) {
                this.x += (x - this.x) * 3 * dt;
                this.y += (y - this.y) * 3 * dt;
            }
        };

        document.getElementById('replayTime').textContent = `00:00 / ${this.formatTime(this.duration)}`;
        this.updateTimeline();
        
        return true;
    }

    play() {
        this.playing = true;
        document.getElementById('playPauseBtn').textContent = '⏸️ 暂停';
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    pause() {
        this.playing = false;
        document.getElementById('playPauseBtn').textContent = '▶️ 播放';
    }

    togglePlay() {
        if (this.playing) {
            this.pause();
        } else {
            this.play();
        }
    }

    cycleSpeed() {
        const speeds = [0.5, 1, 2];
        const currentIndex = speeds.indexOf(this.speed);
        this.speed = speeds[(currentIndex + 1) % speeds.length];
        document.getElementById('speedBtn').textContent = `⏩ ${this.speed}x`;
    }

    toggleHeatmap() {
        this.heatmapEnabled = !this.heatmapEnabled;
        const btn = document.getElementById('heatmapBtn');
        btn.classList.toggle('active', this.heatmapEnabled);
    }

    toggleFollow() {
        this.followEnabled = !this.followEnabled;
        const btn = document.getElementById('followBtn');
        btn.classList.toggle('active', this.followEnabled);
        
        if (this.followEnabled) {
            this.selectFollowTarget();
        } else {
            this.followTarget = null;
        }
    }

    selectFollowTarget() {
        if (this.monsters.size === 0) {
            this.followTarget = null;
            return;
        }

        let closest = null;
        let maxProgress = -1;

        for (const monster of this.monsters.values()) {
            if (monster.ownerIndex === this.replayData.playerIndex && monster.progress > maxProgress) {
                closest = monster;
                maxProgress = monster.progress;
            }
        }

        this.followTarget = closest;
    }

    handleCanvasClick(e) {
        if (!this.followEnabled) return;

        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        
        const worldX = (sx - this.canvas.width / 2) / this.camera.scale + this.camera.x;
        const worldY = (sy - this.canvas.height / 2) / this.camera.scale + this.camera.y;

        for (const monster of this.monsters.values()) {
            const dist = Math.hypot(monster.x - worldX, monster.y - worldY);
            if (dist < 30) {
                this.followTarget = monster;
                return;
            }
        }
    }

    startTimelineDrag(e) {
        this.timelineDragging = true;
        this.wasPlaying = this.playing;
        if (this.playing) this.pause();
        this.updateTimelineFromEvent(e);
    }

    onTimelineDrag(e) {
        if (!this.timelineDragging) return;
        this.updateTimelineFromEvent(e);
    }

    updateTimelineFromEvent(e) {
        const track = document.querySelector('.timeline-track');
        const rect = track.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        this.seek(percent * this.duration);
    }

    endTimelineDrag() {
        if (this.timelineDragging && this.wasPlaying) {
            this.play();
        }
        this.timelineDragging = false;
    }

    seek(time) {
        this.currentTime = Math.max(0, Math.min(this.duration, time));
        this.currentFrameIndex = 0;
        this.monsters.clear();
        this.projectiles.clear();

        while (this.currentFrameIndex < this.frames.length && 
               this.frames[this.currentFrameIndex].frameTime <= this.currentTime) {
            this.applyFrame(this.frames[this.currentFrameIndex]);
            this.currentFrameIndex++;
        }

        this.updateTimeline();
        this.render();
    }

    loop(currentTime) {
        if (!this.playing) return;

        const dt = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1) * this.speed;
        this.lastFrameTime = currentTime;

        this.update(dt);
        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        this.currentTime += dt;
        if (this.currentTime >= this.duration) {
            this.currentTime = this.duration;
            this.pause();
            return;
        }

        while (this.currentFrameIndex < this.frames.length && 
               this.frames[this.currentFrameIndex].frameTime <= this.currentTime * 1000) {
            this.applyFrame(this.frames[this.currentFrameIndex]);
            this.currentFrameIndex++;
        }

        if (this.followEnabled && this.followTarget) {
            const target = this.monsters.get(this.followTarget.id);
            if (target && target.alive) {
                this.camera.follow(target.x, target.y, dt);
            } else {
                this.selectFollowTarget();
            }
        }

        this.camera.update(dt);
        this.updateTimeline();
    }

    applyFrame(frame) {
        for (const md of frame.m) {
            let monster = this.monsters.get(md.id);
            if (!monster) {
                monster = {
                    id: md.id,
                    alive: true,
                    ownerIndex: md.o,
                    progress: 0,
                    maxHealth: 100
                };
                this.monsters.set(md.id, monster);
            }
            monster.x = md.x;
            monster.y = md.y;
            monster.health = md.h;
            monster.shield = md.s;
            monster.speedBoost = md.sp;
            monster.progress = (md.x / this.replayData.mapWidth) * 100;
        }

        const currentProjIds = new Set();
        for (const pd of frame.p) {
            currentProjIds.add(pd.id);
            let proj = this.projectiles.get(pd.id);
            if (!proj) {
                proj = { id: pd.id, alive: true };
                this.projectiles.set(pd.id, proj);
            }
            proj.x = pd.x;
            proj.y = pd.y;
        }

        for (const [id] of this.projectiles) {
            if (!currentProjIds.has(id)) {
                this.projectiles.delete(id);
            }
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawBackground(ctx);
        this.drawPath(ctx);

        if (this.heatmapEnabled) {
            this.drawHeatmap(ctx);
        }

        const objects = [];
        for (const tower of this.replayData.towers) {
            objects.push({ type: 'tower', y: tower.y, data: tower });
        }
        for (const monster of this.monsters.values()) {
            objects.push({ type: 'monster', y: monster.y, data: monster });
        }
        for (const proj of this.projectiles.values()) {
            objects.push({ type: 'projectile', y: proj.y, data: proj });
        }

        objects.sort((a, b) => a.y - b.y);

        for (const obj of objects) {
            switch (obj.type) {
                case 'tower':
                    this.drawTower(ctx, obj.data);
                    break;
                case 'monster':
                    this.drawMonster(ctx, obj.data);
                    break;
                case 'projectile':
                    this.drawProjectile(ctx, obj.data);
                    break;
            }
        }

        this.drawSpawnZone(ctx);
        document.getElementById('replayTime').textContent = 
            `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
    }

    drawBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#1a472a');
        gradient.addColorStop(1, '#0d2818');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const gridSize = 50;
        const topLeftX = this.camera.x - this.canvas.width / 2 / this.camera.scale;
        const topLeftY = this.camera.y - this.canvas.height / 2 / this.camera.scale;
        const startX = Math.floor(topLeftX / gridSize) * gridSize;
        const startY = Math.floor(topLeftY / gridSize) * gridSize;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;

        const endX = topLeftX + this.canvas.width / this.camera.scale;
        const endY = topLeftY + this.canvas.height / this.camera.scale;

        for (let x = startX; x < endX; x += gridSize) {
            const screenX = (x - this.camera.x) * this.camera.scale + this.canvas.width / 2;
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, this.canvas.height);
            ctx.stroke();
        }

        for (let y = startY; y < endY; y += gridSize) {
            const screenY = (y - this.camera.y) * this.camera.scale + this.canvas.height / 2;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(this.canvas.width, screenY);
            ctx.stroke();
        }
    }

    drawPath(ctx) {
        const path = this.replayData.path;
        if (path.length < 2) return;

        ctx.beginPath();
        const firstPoint = this.worldToScreen(path[0].x, path[0].y);
        ctx.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < path.length; i++) {
            const point = this.worldToScreen(path[i].x, path[i].y);
            ctx.lineTo(point.x, point.y);
        }

        ctx.strokeStyle = 'rgba(139, 90, 43, 0.6)';
        ctx.lineWidth = 50 * this.camera.scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.strokeStyle = 'rgba(194, 154, 108, 0.8)';
        ctx.lineWidth = 40 * this.camera.scale;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(210, 180, 140, 0.9)';
        ctx.lineWidth = 30 * this.camera.scale;
        ctx.setLineDash([10 * this.camera.scale, 10 * this.camera.scale]);
        ctx.stroke();
        ctx.setLineDash([]);

        const endPoint = this.worldToScreen(
            path[path.length - 1].x,
            path[path.length - 1].y
        );

        ctx.beginPath();
        ctx.arc(endPoint.x, endPoint.y, 30 * this.camera.scale, 0, Math.PI * 2);
        const endGradient = ctx.createRadialGradient(
            endPoint.x, endPoint.y, 0,
            endPoint.x, endPoint.y, 30 * this.camera.scale
        );
        endGradient.addColorStop(0, '#ffd700');
        endGradient.addColorStop(1, '#ff8c00');
        ctx.fillStyle = endGradient;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${20 * this.camera.scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏁', endPoint.x, endPoint.y);
    }

    drawHeatmap(ctx) {
        if (!this.replayData.damageHeatmap) return;

        const radius = 60;
        for (const point of this.replayData.damageHeatmap) {
            const screenPos = this.worldToScreen(point.x, point.y);
            const intensity = Math.min(1, point.intensity / 500);
            const gradient = ctx.createRadialGradient(
                screenPos.x, screenPos.y, 0,
                screenPos.x, screenPos.y, radius * this.camera.scale
            );
            gradient.addColorStop(0, `rgba(255, 0, 0, ${intensity * 0.6})`);
            gradient.addColorStop(0.5, `rgba(255, 200, 0, ${intensity * 0.3})`);
            gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, radius * this.camera.scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawTower(ctx, tower) {
        const screenPos = this.worldToScreen(tower.x, tower.y);
        const screenRadius = 25 * this.camera.scale;

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 180 * this.camera.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 100, 100, 0.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const baseColor = tower.ownerIndex === 0 ? '#8b4513' : '#2c3e50';
        const baseGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, screenRadius);
        baseGradient.addColorStop(0, this.lightenColor(baseColor, 0.3));
        baseGradient.addColorStop(1, baseColor);

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = baseGradient;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawMonster(ctx, monster) {
        const screenPos = this.worldToScreen(monster.x, monster.y);
        const screenRadius = 15 * this.camera.scale;

        if (monster.shield) {
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, screenRadius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 200, 255, 0.7)`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        if (monster.speedBoost) {
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, screenRadius + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 200, 50, 0.4)`;
            ctx.fill();
        }

        const baseColor = monster.ownerIndex === 0 ? '#ff6b6b' : '#4ecdc4';
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, screenRadius);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, this.darkenColor(baseColor, 0.5));

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        const healthBarWidth = screenRadius * 2;
        const healthBarHeight = 4 * this.camera.scale;
        const healthBarY = screenPos.y - screenRadius - 12 * this.camera.scale;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(screenPos.x - healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight);

        const healthPercent = (monster.health || 0) / 100;
        ctx.fillStyle = healthPercent > 0.5 ? '#4ecdc4' : healthPercent > 0.25 ? '#ffd700' : '#ff6b6b';
        ctx.fillRect(screenPos.x - healthBarWidth / 2, healthBarY, healthBarWidth * healthPercent, healthBarHeight);

        if (this.followTarget && this.followTarget.id === monster.id) {
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, screenRadius + 12, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawProjectile(ctx, proj) {
        const screenPos = this.worldToScreen(proj.x, proj.y);
        const screenRadius = 5 * this.camera.scale;

        const gradient = ctx.createRadialGradient(
            screenPos.x, screenPos.y, 0,
            screenPos.x, screenPos.y, screenRadius * 2
        );
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.5, '#ff6b6b');
        gradient.addColorStop(1, 'rgba(255, 107, 107, 0)');

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    drawSpawnZone(ctx) {
        const path = this.replayData.path;
        if (path.length === 0) return;

        const startPoint = this.worldToScreen(path[0].x, path[0].y);
        const pulseSize = 40 + Math.sin(Date.now() / 200) * 5;

        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, pulseSize * this.camera.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(78, 205, 196, ${0.2 + Math.sin(Date.now() / 200) * 0.1})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    worldToScreen(wx, wy) {
        return {
            x: (wx - this.camera.x) * this.camera.scale + this.canvas.width / 2,
            y: (wy - this.camera.y) * this.camera.scale + this.canvas.height / 2
        };
    }

    updateTimeline() {
        const percent = (this.currentTime / this.duration) * 100;
        document.getElementById('timelineProgress').style.width = `${percent}%`;
        document.getElementById('timelineHandle').style.left = `${percent}%`;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    darkenColor(color, factor) {
        const hex = color.replace('#', '');
        const r = Math.floor(parseInt(hex.substr(0, 2), 16) * factor);
        const g = Math.floor(parseInt(hex.substr(2, 2), 16) * factor);
        const b = Math.floor(parseInt(hex.substr(4, 2), 16) * factor);
        return `rgb(${r}, ${g}, ${b})`;
    }

    lightenColor(color, factor) {
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = Math.min(255, Math.floor(parseInt(hex.substr(0, 2), 16) * (1 + factor)));
            const g = Math.min(255, Math.floor(parseInt(hex.substr(2, 2), 16) * (1 + factor)));
            const b = Math.min(255, Math.floor(parseInt(hex.substr(4, 2), 16) * (1 + factor)));
            return `rgb(${r}, ${g}, ${b})`;
        }
        return color;
    }

    exitReplay() {
        this.pause();
        this.game.showScreen('end');
    }
}
