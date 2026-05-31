const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'house-config.json');

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            console.error('Error loading config:', e);
            return null;
        }
    }
    return null;
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

app.get('/api/config', (req, res) => {
    const config = loadConfig();
    if (config) {
        res.json({ success: true, data: config });
    } else {
        res.json({ success: true, data: getDefaultConfig() });
    }
});

app.post('/api/config', (req, res) => {
    try {
        const config = req.body;
        saveConfig(config);
        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/furniture', (req, res) => {
    const config = loadConfig();
    if (config && config.furniture) {
        res.json({ success: true, data: config.furniture });
    } else {
        res.json({ success: true, data: getDefaultFurniture() });
    }
});

app.put('/api/furniture/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { position, rotation } = req.body;
        const config = loadConfig() || getDefaultConfig();

        const item = config.furniture.find(f => f.id === id);
        if (item) {
            if (position) item.position = position;
            if (rotation) item.rotation = rotation;
            saveConfig(config);
            res.json({ success: true, data: item });
        } else {
            res.status(404).json({ success: false, error: 'Furniture item not found' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/furniture', (req, res) => {
    try {
        const newItem = req.body;
        const config = loadConfig() || getDefaultConfig();

        if (!newItem.id) {
            newItem.id = `furniture_${Date.now()}`;
        }

        config.furniture.push(newItem);
        saveConfig(config);
        res.json({ success: true, data: newItem });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

function getDefaultFurniture() {
    return [
        {
            id: 'chair_1',
            type: 'chair',
            name: 'Dining Chair',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            color: '#8B4513',
            grabbable: true
        },
        {
            id: 'table_1',
            type: 'table',
            name: 'Dining Table',
            position: { x: 2, y: 0, z: -2 },
            rotation: { x: 0, y: 0, z: 0 },
            color: '#A0522D',
            grabbable: false
        },
        {
            id: 'sofa_1',
            type: 'sofa',
            name: 'Sofa',
            position: { x: -3, y: 0, z: -3 },
            rotation: { x: 0, y: Math.PI / 4, z: 0 },
            color: '#696969',
            grabbable: true
        },
        {
            id: 'lamp_1',
            type: 'lamp',
            name: 'Floor Lamp',
            position: { x: 4, y: 0, z: -1 },
            rotation: { x: 0, y: 0, z: 0 },
            color: '#FFD700',
            grabbable: true
        }
    ];
}

function getDefaultConfig() {
    return {
        house: {
            name: 'Sample House',
            dimensions: { width: 20, depth: 20, height: 3 },
            rooms: [
                {
                    id: 'living_room',
                    name: 'Living Room',
                    bounds: { x: 0, z: 0, width: 10, depth: 10 },
                    color: '#F5F5DC'
                },
                {
                    id: 'kitchen',
                    name: 'Kitchen',
                    bounds: { x: 10, z: 0, width: 10, depth: 10 },
                    color: '#E0FFFF'
                },
                {
                    id: 'bedroom',
                    name: 'Bedroom',
                    bounds: { x: 0, z: 10, width: 10, depth: 10 },
                    color: '#FFE4E1'
                },
                {
                    id: 'bathroom',
                    name: 'Bathroom',
                    bounds: { x: 10, z: 10, width: 10, depth: 10 },
                    color: '#E6E6FA'
                }
            ]
        },
        furniture: getDefaultFurniture(),
        teleportPoints: [
            { x: 0, y: 0, z: 0, name: 'Living Room Center' },
            { x: 5, y: 0, z: -4, name: 'Near Table' },
            { x: -4, y: 0, z: 4, name: 'Near Sofa' },
            { x: 4, y: 0, z: 5, name: 'Kitchen Area' },
            { x: -4, y: 0, z: -4, name: 'Bedroom Area' },
            { x: 4, y: 0, z: -4, name: 'Bathroom Area' }
        ]
    };
}

app.get('/api/house', (req, res) => {
    const config = loadConfig() || getDefaultConfig();
    res.json({ success: true, data: config.house });
});

app.get('/api/teleport-points', (req, res) => {
    const config = loadConfig() || getDefaultConfig();
    res.json({ success: true, data: config.teleportPoints });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const rooms = new Map();

const MAX_PLAYERS_PER_ROOM = 4;

const PLAYER_COLORS = [
    '#ff6b6b',
    '#4ecdc4',
    '#ffe66d',
    '#c084fc'
];

function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            players: new Map(),
            playerColors: new Set()
        });
    }
    return rooms.get(roomId);
}

function getAvailableColor(room) {
    for (const color of PLAYER_COLORS) {
        if (!room.playerColors.has(color)) {
            return color;
        }
    }
    return '#888888';
}

function broadcastToRoom(room, data, excludeId = null) {
    const message = JSON.stringify(data);
    for (const [playerId, player] of room.players) {
        if (playerId !== excludeId && player.ws.readyState === 1) {
            player.ws.send(message);
        }
    }
}

function getPlayerList(room) {
    const list = [];
    for (const [id, player] of room.players) {
        list.push({
            id,
            name: player.name,
            color: player.color,
            position: player.position,
            rotation: player.rotation,
            muted: player.muted
        });
    }
    return list;
}

function assignPlayerName(room) {
    const existingNames = new Set();
    for (const [, player] of room.players) {
        existingNames.add(player.name);
    }
    const baseNames = ['玩家一', '玩家二', '玩家三', '玩家四'];
    for (const name of baseNames) {
        if (!existingNames.has(name)) return name;
    }
    return `玩家${room.players.size + 1}`;
}

wss.on('connection', (ws, req) => {
    let playerId = null;
    let roomId = null;
    let playerRoom = null;

    ws.on('message', (raw) => {
        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch (e) {
            return;
        }

        switch (data.type) {
            case 'join': {
                roomId = data.roomId || 'default-house';
                playerRoom = getOrCreateRoom(roomId);

                if (playerRoom.players.size >= MAX_PLAYERS_PER_ROOM) {
                    ws.send(JSON.stringify({
                        type: 'room-full',
                        message: `房间已满（最多 ${MAX_PLAYERS_PER_ROOM} 人）`
                    }));
                    ws.close();
                    return;
                }

                playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const color = getAvailableColor(playerRoom);
                const name = data.name || assignPlayerName(playerRoom);

                const player = {
                    id: playerId,
                    name,
                    color,
                    position: data.position || { x: 0, y: 0, z: 0 },
                    rotation: data.rotation || { x: 0, y: 0, z: 0 },
                    muted: data.muted || false,
                    ws
                };

                playerRoom.players.set(playerId, player);
                playerRoom.playerColors.add(color);

                ws.send(JSON.stringify({
                    type: 'welcome',
                    id: playerId,
                    name: player.name,
                    color: player.color,
                    roomId,
                    players: getPlayerList(playerRoom),
                    maxPlayers: MAX_PLAYERS_PER_ROOM
                }));

                broadcastToRoom(playerRoom, {
                    type: 'player-joined',
                    player: {
                        id: playerId,
                        name: player.name,
                        color: player.color,
                        position: player.position,
                        rotation: player.rotation,
                        muted: player.muted
                    }
                }, playerId);

                console.log(`[WS] ${player.name} (${playerId}) joined room ${roomId} (${playerRoom.players.size}/${MAX_PLAYERS_PER_ROOM})`);
                break;
            }

            case 'state': {
                if (!playerRoom || !playerId) return;
                const player = playerRoom.players.get(playerId);
                if (player) {
                    player.position = data.position;
                    player.rotation = data.rotation;
                    player.muted = data.muted;

                    broadcastToRoom(playerRoom, {
                        type: 'player-state',
                        id: playerId,
                        position: data.position,
                        rotation: data.rotation,
                        muted: data.muted
                    }, playerId);
                }
                break;
            }

            case 'webrtc-offer': {
                if (!playerRoom || !playerId) return;
                const target = playerRoom.players.get(data.targetId);
                if (target && target.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({
                        type: 'webrtc-offer',
                        fromId: playerId,
                        offer: data.offer
                    }));
                }
                break;
            }

            case 'webrtc-answer': {
                if (!playerRoom || !playerId) return;
                const target = playerRoom.players.get(data.targetId);
                if (target && target.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({
                        type: 'webrtc-answer',
                        fromId: playerId,
                        answer: data.answer
                    }));
                }
                break;
            }

            case 'webrtc-ice': {
                if (!playerRoom || !playerId) return;
                const target = playerRoom.players.get(data.targetId);
                if (target && target.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({
                        type: 'webrtc-ice',
                        fromId: playerId,
                        candidate: data.candidate
                    }));
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        if (playerRoom && playerId) {
            const player = playerRoom.players.get(playerId);
            if (player) {
                playerRoom.playerColors.delete(player.color);
            }
            playerRoom.players.delete(playerId);

            broadcastToRoom(playerRoom, {
                type: 'player-left',
                id: playerId
            });

            console.log(`[WS] Player ${playerId} left room ${roomId} (${playerRoom.players.size}/${MAX_PLAYERS_PER_ROOM})`);

            if (playerRoom.players.size === 0) {
                rooms.delete(roomId);
                console.log(`[WS] Room ${roomId} cleaned up`);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`VR House Tour server running at http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    console.log(`Open this URL in a WebXR-compatible browser for VR mode`);
});
