const GameState = {
    MENU: 'menu',
    WAITING: 'waiting',
    PLAYING: 'playing',
    ENDED: 'ended'
};

const Formation = {
    SPREAD: 'spread',
    CONCENTRATED: 'concentrated'
};

class SpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = [];
        this._dirtyCells = new Set();
        
        for (let y = 0; y < this.rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x] = [];
            }
        }
    }

    clear() {
        for (const key of this._dirtyCells) {
            const [x, y] = key.split(',').map(Number);
            this.grid[y][x].length = 0;
        }
        this._dirtyCells.clear();
    }

    insert(obj) {
        const startCol = Math.max(0, Math.floor((obj.x - obj.radius) / this.cellSize));
        const endCol = Math.min(this.cols - 1, Math.floor((obj.x + obj.radius) / this.cellSize));
        const startRow = Math.max(0, Math.floor((obj.y - obj.radius) / this.cellSize));
        const endRow = Math.min(this.rows - 1, Math.floor((obj.y + obj.radius) / this.cellSize));

        for (let y = startRow; y <= endRow; y++) {
            for (let x = startCol; x <= endCol; x++) {
                this.grid[y][x].push(obj);
                this._dirtyCells.add(`${x},${y}`);
            }
        }
    }

    query(x, y, radius) {
        const results = [];
        const startCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
        const endCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
        const startRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
        const endRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

        const checked = new Set();

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cell = this.grid[row][col];
                for (const obj of cell) {
                    if (!checked.has(obj.id)) {
                        checked.add(obj.id);
                        results.push(obj);
                    }
                }
            }
        }

        return results;
    }

    queryRange(minX, minY, maxX, maxY) {
        const results = [];
        const startCol = Math.max(0, Math.floor(minX / this.cellSize));
        const endCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
        const startRow = Math.max(0, Math.floor(minY / this.cellSize));
        const endRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));

        const checked = new Set();

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cell = this.grid[row][col];
                for (const obj of cell) {
                    if (!checked.has(obj.id)) {
                        checked.add(obj.id);
                        results.push(obj);
                    }
                }
            }
        }

        return results;
    }
}

class ObjectPool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    acquire(...args) {
        const obj = this.pool.pop() || this.createFn();
        if (this.resetFn) {
            this.resetFn(obj, ...args);
        }
        obj._pooled = false;
        return obj;
    }

    release(obj) {
        if (obj._pooled) return;
        obj._pooled = true;
        obj.alive = false;
        this.pool.push(obj);
    }

    clear() {
        this.pool.length = 0;
    }
}

class Monster {
    constructor() {
        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.path = null;
        this.pathProgress = 0;
        this.ownerIndex = 0;
        this.baseSpeed = 80;
        this.speed = this.baseSpeed;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.radius = 15;
        this.alive = false;
        this._pooled = true;
        this.reachedEnd = false;
        this.speedBoostTime = 0;
        this.shieldTime = 0;
        this.shieldMax = 50;
        this.shield = 0;
        this.angle = 0;
        this.wobbleOffset = 0;
    }

    init(id, x, y, path, ownerIndex) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.path = path;
        this.pathProgress = 0;
        this.ownerIndex = ownerIndex;
        this.baseSpeed = 80;
        this.speed = this.baseSpeed;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.radius = 15;
        this.alive = true;
        this._pooled = false;
        this.reachedEnd = false;
        this.speedBoostTime = 0;
        this.shieldTime = 0;
        this.shield = 0;
        this.angle = 0;
        this.wobbleOffset = Math.random() * Math.PI * 2;
    }

    update(dt, pathLength) {
        if (!this.alive) return;

        if (this.speedBoostTime > 0) {
            this.speedBoostTime -= dt;
            this.speed = this.baseSpeed * 1.8;
        } else {
            this.speed = this.baseSpeed;
        }

        if (this.shieldTime > 0) {
            this.shieldTime -= dt;
            this.shield = this.shieldMax;
        } else {
            this.shield = 0;
        }

        this.pathProgress += this.speed * dt;

        if (this.pathProgress >= pathLength) {
            this.reachedEnd = true;
            this.alive = false;
            return;
        }

        const point = PathSmoother.getPointOnPath(this.path, this.pathProgress);
        this.x = point.x;
        this.y = point.y;
        this.angle = point.angle;
    }

    takeDamage(damage) {
        if (!this.alive) return { killed: false, actualDamage: 0 };

        const originalDamage = damage;

        if (this.shield > 0) {
            const shieldDamage = Math.min(this.shield, damage);
            this.shield -= shieldDamage;
            damage -= shieldDamage;
        }

        this.health -= damage;
        const actualDamage = originalDamage - damage;

        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            return { killed: true, actualDamage: actualDamage };
        }
        return { killed: false, actualDamage: actualDamage };
    }

    applySpeedBoost(duration) {
        this.speedBoostTime = Math.max(this.speedBoostTime, duration);
    }

    applyShield(duration) {
        this.shieldTime = Math.max(this.shieldTime, duration);
    }

    draw(ctx, camera) {
        if (!this.alive) return;

        const screenPos = camera.worldToScreen(this.x, this.y);
        const screenRadius = this.radius * camera.scale;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        const wobble = Math.sin(Date.now() / 100 + this.wobbleOffset) * 3;

        if (this.shield > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, screenRadius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.5 + Math.sin(Date.now() / 100) * 0.3})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        if (this.speedBoostTime > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, screenRadius + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 200, 50, ${0.3 + Math.sin(Date.now() / 50) * 0.2})`;
            ctx.fill();
        }

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, screenRadius);
        const baseColor = this.ownerIndex === 0 ? '#ff6b6b' : '#4ecdc4';
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, this.darkenColor(baseColor, 0.5));

        ctx.beginPath();
        ctx.arc(0, wobble * camera.scale, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        const eyeOffsetX = Math.cos(this.angle) * screenRadius * 0.4;
        const eyeOffsetY = Math.sin(this.angle) * screenRadius * 0.4;
        
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eyeOffsetX - 4, eyeOffsetY + wobble * camera.scale - 3, 3 * camera.scale, 0, Math.PI * 2);
        ctx.arc(eyeOffsetX + 4, eyeOffsetY + wobble * camera.scale - 3, 3 * camera.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(eyeOffsetX - 4 + Math.cos(this.angle) * 2, eyeOffsetY + wobble * camera.scale - 3 + Math.sin(this.angle) * 2, 1.5 * camera.scale, 0, Math.PI * 2);
        ctx.arc(eyeOffsetX + 4 + Math.cos(this.angle) * 2, eyeOffsetY + wobble * camera.scale - 3 + Math.sin(this.angle) * 2, 1.5 * camera.scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        const healthBarWidth = screenRadius * 2;
        const healthBarHeight = 4 * camera.scale;
        const healthBarY = screenPos.y - screenRadius - 12 * camera.scale;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(screenPos.x - healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight);

        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = healthPercent > 0.5 ? '#4ecdc4' : healthPercent > 0.25 ? '#ffd700' : '#ff6b6b';
        ctx.fillRect(screenPos.x - healthBarWidth / 2, healthBarY, healthBarWidth * healthPercent, healthBarHeight);
    }

    darkenColor(color, factor) {
        const hex = color.replace('#', '');
        const r = Math.floor(parseInt(hex.substr(0, 2), 16) * factor);
        const g = Math.floor(parseInt(hex.substr(2, 2), 16) * factor);
        const b = Math.floor(parseInt(hex.substr(4, 2), 16) * factor);
        return `rgb(${r}, ${g}, ${b})`;
    }
}

class Tower {
    constructor(x, y, type, ownerIndex) {
        this.x = x;
        this.y = y;
        this.ownerIndex = ownerIndex;
        this.type = type;
        this.range = 180;
        this.damage = 25;
        this.fireRate = 0.8;
        this.fireCooldown = 0;
        this.radius = 25;
        this.angle = 0;
        this.target = null;
        this.level = 1;
    }

    update(dt, spatialGrid, projectiles, projectilePool) {
        this.fireCooldown -= dt;

        this.target = this.findTarget(spatialGrid);

        if (this.target) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            this.angle = Math.atan2(dy, dx);

            if (this.fireCooldown <= 0) {
                this.fire(projectiles, projectilePool);
                this.fireCooldown = this.fireRate;
            }
        }
    }

    findTarget(spatialGrid) {
        const minX = this.x - this.range;
        const minY = this.y - this.range;
        const maxX = this.x + this.range;
        const maxY = this.y + this.range;

        const candidates = spatialGrid.queryRange(minX, minY, maxX, maxY);

        let closest = null;
        let closestProgress = -1;

        for (const monster of candidates) {
            if (!monster.alive || monster.ownerIndex === this.ownerIndex) continue;

            const dist = Math.hypot(monster.x - this.x, monster.y - this.y);
            if (dist <= this.range) {
                if (monster.pathProgress > closestProgress) {
                    closest = monster;
                    closestProgress = monster.pathProgress;
                }
            }
        }

        return closest;
    }

    fire(projectiles, projectilePool) {
        if (!this.target) return;

        const proj = projectilePool.acquire(this.x, this.y, this.target, this.damage, this.ownerIndex);
        projectiles.push(proj);
    }

    draw(ctx, camera) {
        const screenPos = camera.worldToScreen(this.x, this.y);
        const screenRadius = this.radius * camera.scale;

        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, this.range * camera.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 100, 100, 0.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        const baseGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, screenRadius);
        const baseColor = this.ownerIndex === 0 ? '#8b4513' : '#2c3e50';
        baseGradient.addColorStop(0, this.lightenColor(baseColor, 0.3));
        baseGradient.addColorStop(1, baseColor);

        ctx.beginPath();
        ctx.arc(0, 0, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = baseGradient;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.rotate(this.angle);

        const barrelLength = screenRadius * 1.5;
        const barrelWidth = screenRadius * 0.4;

        ctx.fillStyle = this.ownerIndex === 0 ? '#555' : '#777';
        ctx.fillRect(0, -barrelWidth / 2, barrelLength, barrelWidth);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, -barrelWidth / 2, barrelLength, barrelWidth);

        ctx.restore();
    }

    lightenColor(color, factor) {
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = Math.min(255, Math.floor(parseInt(hex.substr(0, 2), 16) * (1 + factor));
            const g = Math.min(255, Math.floor(parseInt(hex.substr(2, 2), 16) * (1 + factor));
            const b = Math.min(255, Math.floor(parseInt(hex.substr(4, 2), 16) * (1 + factor));
            return `rgb(${r}, ${g}, ${b})`;
        }
        return color;
    }
}

class Projectile {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.target = null;
        this.damage = 0;
        this.ownerIndex = 0;
        this.speed = 600;
        this.radius = 5;
        this.alive = false;
        this._pooled = true;
        this.id = 0;
    }

    init(x, y, target, damage, ownerIndex) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.ownerIndex = ownerIndex;
        this.speed = 600;
        this.radius = 5;
        this.alive = true;
        this._pooled = false;
        this.id = Math.random();
    }

    update(dt, game) {
        if (!this.alive) return;

        if (!this.target || !this.target.alive) {
            this.alive = false;
            return;
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.target.radius + this.radius) {
            const result = this.target.takeDamage(this.damage);
            if (result.actualDamage > 0 && game) {
                game.recorder.recordDamage(this.x, this.y, result.actualDamage);
            }
            this.alive = false;
            return;
        }

        const moveX = (dx / dist) * this.speed * dt;
        const moveY = (dy / dist) * this.speed * dt;

        this.x += moveX;
        this.y += moveY;
    }

    draw(ctx, camera) {
        if (!this.alive) return;

        const screenPos = camera.worldToScreen(this.x, this.y);
        const screenRadius = this.radius * camera.scale;

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
}

class Particle {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.color = '';
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 0;
        this.size = 0;
        this.alive = false;
        this._pooled = true;
        this.id = 0;
    }

    init(x, y, color, velocity, life, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = velocity.x;
        this.vy = velocity.y;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.alive = true;
        this._pooled = false;
        this.id = Math.random();
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) {
            this.alive = false;
            return;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.98;
        this.vy *= 0.98;
    }

    draw(ctx, camera) {
        if (!this.alive) return;

        const screenPos = camera.worldToScreen(this.x, this.y);
        const alpha = this.life / this.maxLife;
        const size = this.size * camera.scale * alpha;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class Camera {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = 0;
        this.y = 0;
        this.scale = 1;
        this.targetScale = 1;
        this.shakeAmount = 0;
        this.shakeTime = 0;
    }

    update(dt) {
        this.scale += (this.targetScale - this.scale) * 5 * dt;

        if (this.shakeTime > 0) {
            this.shakeTime -= dt;
            this.shakeAmount *= 0.9;
        } else {
            this.shakeAmount = 0;
        }
    }

    shake(amount, duration) {
        this.shakeAmount = Math.max(this.shakeAmount, amount);
        this.shakeTime = Math.max(this.shakeTime, duration);
    }

    worldToScreen(wx, wy) {
        const shakeX = (Math.random() - 0.5) * this.shakeAmount;
        const shakeY = (Math.random() - 0.5) * this.shakeAmount;

        return {
            x: (wx - this.x) * this.scale + this.canvas.width / 2 + shakeX,
            y: (wy - this.y) * this.scale + this.canvas.height / 2 + shakeY
        };
    }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.canvas.width / 2) / this.scale + this.x,
            y: (sy - this.canvas.height / 2) / this.scale + this.y
        };
    }

    follow(x, y, dt) {
        this.x += (x - this.x) * 3 * dt;
        this.y += (y - this.y) * 3 * dt;
    }
}

class ParticleSystem {
    constructor(particlePool) {
        this.particles = [];
        this.particlePool = particlePool;
    }

    emit(x, y, color, count, speed, life, size) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * speed;
            const particle = this.particlePool.acquire(
                x, y, color,
                { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd },
                life * (0.5 + Math.random() * 0.5),
                size * (0.5 + Math.random() * 0.5)
            );
            this.particles.push(particle);
        }
    }

    update(dt, particlePool) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update(dt);
            if (!p.alive) {
                particlePool.release(p);
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx, camera) {
        for (const particle of this.particles) {
            particle.draw(ctx, camera);
        }
    }
}

class RenderBatch {
    constructor() {
        this.towers = [];
        this.monsters = [];
        this.projectiles = [];
    }

    clear() {
        this.towers.length = 0;
        this.monsters.length = 0;
        this.projectiles.length = 0;
    }

    sort() {
        this.monsters.sort((a, b) => a.y - b.y);
        this.towers.sort((a, b) => a.y - b.y);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.camera = new Camera(this.canvas);

        this.state = GameState.MENU;
        this.ws = null;
        this.playerIndex = 0;
        this.myName = '';
        this.opponentName = '';
        this.gameId = null;

        this.monsterPool = new ObjectPool(
            () => new Monster(),
            (obj, ...args) => obj.init(...args)
        );

        this.projectilePool = new ObjectPool(
            () => new Projectile(),
            (obj, ...args) => obj.init(...args)
        );

        this.particlePool = new ObjectPool(
            () => new Particle(),
            (obj, ...args) => obj.init(...args),
            200
        );

        this.particles = new ParticleSystem(this.particlePool);

        this.spatialGrid = null;
        this.renderBatch = new RenderBatch();

        this.monsters = [];
        this.towers = [];
        this.projectiles = [];
        this.path = [];
        this.pathLength = 0;

        this.myScore = 0;
        this.opponentScore = 0;
        this.gameTime = 0;
        this.gameDuration = 120;

        this.maxMonsters = 40;
        this.monstersPerPlayer = 20;
        this.myMonsterCount = 0;
        this.opponentMonsterCount = 0;

        this.formation = Formation.SPREAD;
        this.speedCooldown = 0;
        this.shieldCooldown = 0;
        this.speedCooldownMax = 15;
        this.shieldCooldownMax = 20;

        this.lastTime = 0;
        this.monsterIdCounter = 0;

        this.fps = 0;
        this.fpsTime = 0;
        this.fpsFrames = 0;

        this.recorder = new ReplayRecorder();
        this.replayPlayer = null;
        this.gameStartTime = 0;

        this.setupCanvas();
        this.setupEventListeners();
        this.generateMap();
        this.initReplay();
    }

    async initReplay() {
        await this.recorder.init();
        this.replayPlayer = new ReplayPlayer(
            document.getElementById('replayCanvas'),
            this
        );
        await this.replayPlayer.init();
    }

    setupCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupEventListeners() {
        document.getElementById('findMatchBtn').addEventListener('click', () => this.findMatch());
        document.getElementById('soloBtn').addEventListener('click', () => this.startSoloGame());
        document.getElementById('cancelMatchBtn').addEventListener('click', () => this.cancelMatch());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.findMatch());
        document.getElementById('watchReplayBtn').addEventListener('click', () => this.watchReplay());
        document.getElementById('backToMenuBtn').addEventListener('click', () => this.showScreen('start'));

        document.getElementById('formationBtn').addEventListener('click', () => this.toggleFormation());
        document.getElementById('speedSkillBtn').addEventListener('click', () => this.useSpeedSkill());
        document.getElementById('shieldSkillBtn').addEventListener('click', () => this.useShieldSkill());

        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendChat());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });

        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        document.addEventListener('keydown', (e) => {
            if (this.state !== GameState.PLAYING) return;

            switch (e.key.toLowerCase()) {
                case 'q':
                    this.toggleFormation();
                    break;
                case 'w':
                    this.useSpeedSkill();
                    break;
                case 'e':
                    this.useShieldSkill();
                    break;
            }
        });
    }

    generateMap() {
        const mapWidth = 1600;
        const mapHeight = 1000;
        const astar = new AStar(mapWidth, mapHeight, 40);

        const towerPositions = [
            { x: 400, y: 300 },
            { x: 600, y: 500 },
            { x: 800, y: 250 },
            { x: 1000, y: 600 },
            { x: 1200, y: 400 },
            { x: 500, y: 700 },
            { x: 900, y: 750 },
            { x: 1100, y: 200 }
        ];

        for (const pos of towerPositions) {
            astar.setObstacle(pos.x, pos.y, 50);
        }

        const startPoints = [
            { x: 50, y: 200 },
            { x: 50, y: 500 },
            { x: 50, y: 800 }
        ];

        const endPoint = { x: mapWidth - 50, y: mapHeight / 2 };

        let bestPath = [];
        let bestLength = Infinity;

        for (const start of startPoints) {
            const path = astar.findPath(start.x, start.y, endPoint.x, endPoint.y);
            if (path.length > 0) {
                const smoothPath = PathSmoother.smoothPath(path, 3);
                const length = PathSmoother.getPathLength(smoothPath);
                if (length < bestLength) {
                    bestLength = length;
                    bestPath = smoothPath;
                }
            }
        }

        this.path = bestPath;
        this.pathLength = bestLength;

        this.towers = [];
        for (let i = 0; i < towerPositions.length; i++) {
            const pos = towerPositions[i];
            const owner = i % 2 === 0 ? 0 : 1;
            this.towers.push(new Tower(pos.x, pos.y, 'basic', owner));
        }

        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;

        this.spatialGrid = new SpatialGrid(mapWidth, mapHeight, 100);
    }

    findMatch() {
        const nameInput = document.getElementById('playerName');
        this.myName = nameInput.value.trim() || '匿名玩家';

        this.showScreen('waiting');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({
                type: 'find_match',
                playerName: this.myName
            }));
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleServerMessage(message);
        };

        this.ws.onclose = () => {
            if (this.state === GameState.WAITING) {
                this.showScreen('start');
                alert('连接断开，请重试');
            }
        };

        this.ws.onerror = () => {
            this.showScreen('start');
            alert('无法连接到服务器');
        };
    }

    cancelMatch() {
        if (this.ws) {
            this.ws.close();
        }
        this.showScreen('start');
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'waiting':
                document.getElementById('waitingText').textContent = '正在匹配对手...';
                break;

            case 'match_found':
                this.playerIndex = message.playerIndex;
                this.opponentName = message.opponentName;
                this.gameId = message.gameId;
                this.startGame();
                break;

            case 'game_action':
                this.handleOpponentAction(message.action, message.data);
                break;

            case 'opponent_disconnected':
                alert('对手断开连接');
                this.endGame(true);
                break;

            case 'chat':
                this.addChatMessage(message.from, message.text);
                break;
        }
    }

    startSoloGame() {
        this.myName = document.getElementById('playerName').value.trim() || '玩家';
        this.opponentName = 'AI';
        this.playerIndex = 0;
        this.startGame();
    }

    startGame() {
        this.state = GameState.PLAYING;
        this.clearAllEntities();
        this.myScore = 0;
        this.opponentScore = 0;
        this.gameTime = this.gameDuration;
        this.myMonsterCount = 0;
        this.opponentMonsterCount = 0;
        this.speedCooldown = 0;
        this.shieldCooldown = 0;
        this.monsterIdCounter = 0;

        document.getElementById('myName').textContent = this.myName;
        document.getElementById('opponentName').textContent = this.opponentName;
        document.getElementById('monsterMax').textContent = this.monstersPerPlayer;

        this.showScreen('game');

        this.camera.x = this.mapWidth / 2;
        this.camera.y = this.mapHeight / 2;
        this.camera.scale = Math.min(
            this.canvas.width / this.mapWidth,
            this.canvas.height / this.mapHeight
        ) * 0.9;
        this.camera.targetScale = this.camera.scale;

        this.recorder.startRecording({
            duration: this.gameDuration,
            mapWidth: this.mapWidth,
            mapHeight: this.mapHeight,
            path: this.path,
            towers: this.towers.map(t => ({ x: t.x, y: t.y, ownerIndex: t.ownerIndex })),
            playerName: this.myName,
            opponentName: this.opponentName,
            playerIndex: this.playerIndex
        });
        this.gameStartTime = Date.now();

        this.lastTime = performance.now();
        this.fpsTime = this.lastTime;
        this.fpsFrames = 0;
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    clearAllEntities() {
        for (const monster of this.monsters) {
            this.monsterPool.release(monster);
        }
        this.monsters.length = 0;

        for (const proj of this.projectiles) {
            this.projectilePool.release(proj);
        }
        this.projectiles.length = 0;

        for (const particle of this.particles.particles) {
            this.particlePool.release(particle);
        }
        this.particles.particles.length = 0;
    }

    gameLoop(currentTime) {
        if (this.state !== GameState.PLAYING) return;

        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        this.fpsFrames++;
        if (currentTime - this.fpsTime >= 1000) {
            this.fps = this.fpsFrames;
            this.fpsFrames = 0;
            this.fpsTime = currentTime;
        }

        this.update(dt);
        this.render();

        const elapsedMs = Date.now() - this.gameStartTime;
        this.recorder.recordFrame(elapsedMs, {
            monsters: this.monsters,
            projectiles: this.projectiles
        });

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(dt) {
        this.gameTime -= dt;
        if (this.gameTime <= 0) {
            this.gameTime = 0;
            this.endGame(false);
            return;
        }

        this.speedCooldown = Math.max(0, this.speedCooldown - dt);
        this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
        this.updateSkillUI();

        this.spatialGrid.clear();
        for (const monster of this.monsters) {
            if (monster.alive) {
                this.spatialGrid.insert(monster);
            }
        }

        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const monster = this.monsters[i];
            monster.update(dt, this.pathLength);

            if (monster.reachedEnd) {
                if (monster.ownerIndex === this.playerIndex) {
                    this.myScore += 10;
                    this.myMonsterCount--;
                } else {
                    this.opponentScore += 10;
                    this.opponentMonsterCount--;
                }
                this.particles.emit(monster.x, monster.y, '#4ecdc4', 15, 100, 0.5, 8);
                this.monsterPool.release(monster);
                this.monsters.splice(i, 1);
                this.updateScoreUI();
            } else if (!monster.alive) {
                if (monster.ownerIndex === this.playerIndex) {
                    this.myMonsterCount--;
                } else {
                    this.opponentMonsterCount--;
                }
                this.particles.emit(monster.x, monster.y, '#ff6b6b', 20, 150, 0.6, 10);
                this.camera.shake(5, 0.1);
                this.monsterPool.release(monster);
                this.monsters.splice(i, 1);
            }
        }

        for (const tower of this.towers) {
            tower.update(dt, this.spatialGrid, this.projectiles, this.projectilePool);
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.update(dt, this);
            if (!proj.alive) {
                this.projectilePool.release(proj);
                this.projectiles.splice(i, 1);
            }
        }

        this.particles.update(dt, this.particlePool);
        this.camera.update(dt);

        if (!this.ws && this.playerIndex === 0) {
            this.updateAI(dt);
        }

        this.updateTimeUI();
        this.updateMonsterCountUI();
    }

    updateAI(dt) {
        if (this.opponentMonsterCount < this.monstersPerPlayer && Math.random() < 0.03) {
            const offset = this.formation === Formation.SPREAD 
                ? (Math.random() - 0.5) * 60 
                : (Math.random() - 0.5) * 20;
            
            const startPos = this.path[0];
            const spawnX = startPos.x;
            const spawnY = startPos.y + offset;

            this.spawnMonsterOpponent(spawnX, spawnY);
        }

        if (Math.random() < 0.002) {
            for (const monster of this.monsters) {
                if (monster.ownerIndex === 1) {
                    monster.applySpeedBoost(3);
                }
            }
        }

        if (Math.random() < 0.0015) {
            for (const monster of this.monsters) {
                if (monster.ownerIndex === 1) {
                    monster.applyShield(4);
                }
            }
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawBackground(ctx);
        this.drawPath(ctx);

        this.renderBatch.clear();
        for (const tower of this.towers) {
            this.renderBatch.towers.push(tower);
        }
        for (const monster of this.monsters) {
            this.renderBatch.monsters.push(monster);
        }
        for (const proj of this.projectiles) {
            this.renderBatch.projectiles.push(proj);
        }

        this.renderBatch.sort();

        for (const tower of this.renderBatch.towers) {
            tower.draw(ctx, this.camera);
        }
        for (const monster of this.renderBatch.monsters) {
            monster.draw(ctx, this.camera);
        }
        for (const proj of this.renderBatch.projectiles) {
            proj.draw(ctx, this.camera);
        }

        this.particles.draw(ctx, this.camera);
        this.drawSpawnZone(ctx);
        this.drawFPS(ctx);
    }

    drawFPS(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(10, 80, 80, 30);
        ctx.fillStyle = this.fps >= 50 ? '#4ecdc4' : this.fps >= 30 ? '#ffd700' : '#ff6b6b';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`FPS: ${this.fps}`, 20, 100);
    }

    drawBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#1a472a');
        gradient.addColorStop(1, '#0d2818');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const topLeft = this.camera.screenToWorld(0, 0);
        const bottomRight = this.camera.screenToWorld(this.canvas.width, this.canvas.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;

        const gridSize = 50;
        const startX = Math.floor(topLeft.x / gridSize) * gridSize;
        const startY = Math.floor(topLeft.y / gridSize) * gridSize;

        for (let x = startX; x < bottomRight.x; x += gridSize) {
            const screenX = this.camera.worldToScreen(x, 0).x;
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, this.canvas.height);
            ctx.stroke();
        }

        for (let y = startY; y < bottomRight.y; y += gridSize) {
            const screenY = this.camera.worldToScreen(0, y).y;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(this.canvas.width, screenY);
            ctx.stroke();
        }
    }

    drawPath(ctx) {
        if (this.path.length < 2) return;

        ctx.beginPath();
        const firstPoint = this.camera.worldToScreen(this.path[0].x, this.path[0].y);
        ctx.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < this.path.length; i++) {
            const point = this.camera.worldToScreen(this.path[i].x, this.path[i].y);
            ctx.lineTo(point.x, point.y);
        }

        ctx.strokeStyle = 'rgba(139, 90, 43, 0.6)';
        ctx.lineWidth = 50 * this.camera.scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.strokeStyle = 'rgba(194, 154, 108, 0.8)';
        ctx.stroke();

        ctx.strokeStyle = 'rgba(210, 180, 140, 0.9)';
        ctx.lineWidth = 30 * this.camera.scale;
        ctx.setLineDash([10 * this.camera.scale, 10 * this.camera.scale]);
        ctx.stroke();
        ctx.setLineDash([]);

        const endPoint = this.camera.worldToScreen(
            this.path[this.path.length - 1].x,
            this.path[this.path.length - 1].y
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

    drawSpawnZone(ctx) {
        if (this.path.length === 0) return;

        const startPoint = this.camera.worldToScreen(this.path[0].x, this.path[0].y);
        const pulseSize = 40 + Math.sin(Date.now() / 200) * 5;

        ctx.beginPath();
        ctx.arc(startPoint.x, startPoint.y, pulseSize * this.camera.scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(78, 205, 196, ${0.2 + Math.sin(Date.now() / 200) * 0.1})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#4ecdc4';
        ctx.font = `bold ${16 * this.camera.scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('👆 点击召唤', startPoint.x, startPoint.y + 60 * this.camera.scale);
    }

    handleCanvasClick(e) {
        if (this.state !== GameState.PLAYING) return;
        if (this.myMonsterCount >= this.monstersPerPlayer) return;

        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const worldPos = this.camera.screenToWorld(sx, sy);

        const closestPoint = this.findClosestPointOnPath(worldPos.x, worldPos.y);
        if (closestPoint.dist < 80) {
            this.spawnMonster(closestPoint.point.y);
        }
    }

    findClosestPointOnPath(x, y) {
        let closest = null;
        let minDist = Infinity;

        for (const point of this.path) {
            const dist = Math.hypot(point.x - x, point.y - y);
            if (dist < minDist) {
                minDist = dist;
                closest = point;
            }
        }

        return { point: closest, dist: minDist };
    }

    spawnMonster(yOffset) {
        if (this.myMonsterCount >= this.monstersPerPlayer) return;

        const offset = this.formation === Formation.SPREAD 
            ? (Math.random() - 0.5) * 60 
            : (Math.random() - 0.5) * 20;

        const startPos = this.path[0];
        const monster = this.monsterPool.acquire(
            this.monsterIdCounter++,
            startPos.x,
            yOffset + offset,
            this.path,
            this.playerIndex
        );

        this.monsters.push(monster);
        this.myMonsterCount++;
        this.particles.emit(startPos.x, yOffset + offset, '#4ecdc4', 10, 80, 0.4, 6);

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'game_action',
                action: 'spawn_monster',
                data: {
                    id: monster.id,
                    x: startPos.x,
                    y: yOffset + offset,
                    formation: this.formation
                }
            }));
        }
    }

    spawnMonsterOpponent(x, y) {
        const monster = this.monsterPool.acquire(
            this.monsterIdCounter++,
            x,
            y,
            this.path,
            1
        );
        this.monsters.push(monster);
        this.opponentMonsterCount++;
        this.particles.emit(x, y, '#ff6b6b', 10, 80, 0.4, 6);
    }

    toggleFormation() {
        this.formation = this.formation === Formation.SPREAD 
            ? Formation.CONCENTRATED 
            : Formation.SPREAD;

        const btn = document.getElementById('formationBtn');
        const btnText = btn.querySelector('.btn-text');
        btnText.textContent = this.formation === Formation.SPREAD ? '阵型: 分散' : '阵型: 集中';
        btn.classList.toggle('active', this.formation === Formation.CONCENTRATED);

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'game_action',
                action: 'set_formation',
                data: { formation: this.formation }
            }));
        }
    }

    useSpeedSkill() {
        if (this.speedCooldown > 0) return;

        this.speedCooldown = this.speedCooldownMax;

        for (const monster of this.monsters) {
            if (monster.ownerIndex === this.playerIndex) {
                monster.applySpeedBoost(4);
            }
        }

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'game_action',
                action: 'use_speed_skill',
                data: {}
            }));
        }
    }

    useShieldSkill() {
        if (this.shieldCooldown > 0) return;

        this.shieldCooldown = this.shieldCooldownMax;

        for (const monster of this.monsters) {
            if (monster.ownerIndex === this.playerIndex) {
                monster.applyShield(5);
            }
        }

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'game_action',
                action: 'use_shield_skill',
                data: {}
            }));
        }
    }

    handleOpponentAction(action, data) {
        switch (action) {
            case 'spawn_monster':
                const monster = this.monsterPool.acquire(
                    data.id,
                    data.x,
                    data.y,
                    this.path,
                    1 - this.playerIndex
                );
                this.monsters.push(monster);
                this.opponentMonsterCount++;
                this.particles.emit(data.x, data.y, '#ff6b6b', 10, 80, 0.4, 6);
                break;

            case 'set_formation':
                break;

            case 'use_speed_skill':
                for (const m of this.monsters) {
                    if (m.ownerIndex !== this.playerIndex) {
                        m.applySpeedBoost(4);
                    }
                }
                break;

            case 'use_shield_skill':
                for (const m of this.monsters) {
                    if (m.ownerIndex !== this.playerIndex) {
                        m.applyShield(5);
                    }
                }
                break;
        }
    }

    updateSkillUI() {
        const speedBtn = document.getElementById('speedSkillBtn');
        const shieldBtn = document.getElementById('shieldSkillBtn');
        const speedCd = document.getElementById('speedCooldown');
        const shieldCd = document.getElementById('shieldCooldown');

        if (this.speedCooldown > 0) {
            speedBtn.classList.add('on-cooldown');
            speedCd.textContent = Math.ceil(this.speedCooldown);
            speedBtn.disabled = true;
        } else {
            speedBtn.classList.remove('on-cooldown');
            speedBtn.disabled = false;
        }

        if (this.shieldCooldown > 0) {
            shieldBtn.classList.add('on-cooldown');
            shieldCd.textContent = Math.ceil(this.shieldCooldown);
            shieldBtn.disabled = true;
        } else {
            shieldBtn.classList.remove('on-cooldown');
            shieldBtn.disabled = false;
        }
    }

    updateScoreUI() {
        document.getElementById('myScore').textContent = this.myScore;
        document.getElementById('opponentScore').textContent = this.opponentScore;
    }

    updateTimeUI() {
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        document.getElementById('gameTime').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    updateMonsterCountUI() {
        document.getElementById('monsterCount').textContent = this.myMonsterCount;
    }

    sendChat() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;

        this.addChatMessage(this.myName, text);
        input.value = '';

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'chat',
                text: text
            }));
        }
    }

    addChatMessage(from, text) {
        const messages = document.getElementById('chatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        msgDiv.innerHTML = `<span class="from">${from}:</span> ${text}`;
        messages.appendChild(msgDiv);
        messages.scrollTop = messages.scrollHeight;
    }

    async endGame(disconnect) {
        this.state = GameState.ENDED;

        let won = false;
        let resultText = '';

        if (disconnect) {
            resultText = '对手已断开连接，你获胜了！';
            won = true;
        } else if (this.myScore > this.opponentScore) {
            resultText = '恭喜你获胜！';
            won = true;
        } else if (this.myScore < this.opponentScore) {
            resultText = '很遗憾，你输了';
            won = false;
        } else {
            resultText = '平局！';
        }

        const resultTitle = document.getElementById('resultTitle');
        resultTitle.textContent = won ? '🎉 胜利！' : '😢 失败';
        resultTitle.className = won ? 'win' : 'lose';

        document.getElementById('resultText').textContent = resultText;
        document.getElementById('finalMyName').textContent = this.myName;
        document.getElementById('finalOpponentName').textContent = this.opponentName;
        document.getElementById('finalMyScore').textContent = this.myScore;
        document.getElementById('finalOpponentScore').textContent = this.opponentScore;

        await this.recorder.stopRecording({
            my: this.myScore,
            opponent: this.opponentScore
        });

        this.showScreen('end');
    }

    async watchReplay() {
        if (!this.replayPlayer) {
            alert('回放系统未初始化');
            return;
        }

        const loaded = await this.replayPlayer.loadLatestReplay();
        if (!loaded) return;

        this.showScreen('replay');
        this.replayPlayer.play();
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

        switch (screenName) {
            case 'start':
                document.getElementById('startScreen').classList.remove('hidden');
                break;
            case 'waiting':
                document.getElementById('waitingScreen').classList.remove('hidden');
                break;
            case 'game':
                document.getElementById('gameScreen').classList.remove('hidden');
                break;
            case 'end':
                document.getElementById('endScreen').classList.remove('hidden');
                break;
            case 'replay':
                document.getElementById('replayScreen').classList.remove('hidden');
                break;
        }
    }
}

window.addEventListener('load', () => {
    new Game();
});
