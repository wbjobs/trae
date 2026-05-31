const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;

const games = new Map();
const waitingPlayers = [];

wss.on('connection', (ws) => {
    console.log('新玩家连接');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, message);
        } catch (e) {
            console.error('消息解析错误:', e);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleMessage(ws, message) {
    switch (message.type) {
        case 'find_match':
            findMatch(ws, message.playerName);
            break;
        case 'game_action':
            forwardGameAction(ws, message);
            break;
        case 'game_state':
            forwardGameState(ws, message);
            break;
        case 'chat':
            forwardChat(ws, message);
            break;
    }
}

function findMatch(ws, playerName) {
    ws.playerName = playerName || '匿名玩家';
    
    if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.pop();
        const gameId = generateGameId();
        
        const game = {
            id: gameId,
            players: [opponent, ws],
            playerNames: [opponent.playerName, ws.playerName],
            ready: [false, false]
        };
        
        games.set(gameId, game);
        
        ws.gameId = gameId;
        ws.playerIndex = 1;
        opponent.gameId = gameId;
        opponent.playerIndex = 0;
        
        sendToClient(opponent, {
            type: 'match_found',
            gameId: gameId,
            playerIndex: 0,
            opponentName: ws.playerName
        });
        
        sendToClient(ws, {
            type: 'match_found',
            gameId: gameId,
            playerIndex: 1,
            opponentName: opponent.playerName
        });
        
        console.log(`游戏 ${gameId} 开始: ${opponent.playerName} vs ${ws.playerName}`);
    } else {
        waitingPlayers.push(ws);
        sendToClient(ws, { type: 'waiting' });
        console.log(`玩家 ${playerName} 等待匹配...`);
    }
}

function forwardGameAction(ws, message) {
    const game = games.get(ws.gameId);
    if (!game) return;
    
    const receiver = game.players[1 - ws.playerIndex];
    if (receiver && receiver.readyState === WebSocket.OPEN) {
        sendToClient(receiver, {
            type: 'game_action',
            playerIndex: ws.playerIndex,
            action: message.action,
            data: message.data
        });
    }
}

function forwardGameState(ws, message) {
    const game = games.get(ws.gameId);
    if (!game) return;
    
    const receiver = game.players[1 - ws.playerIndex];
    if (receiver && receiver.readyState === WebSocket.OPEN) {
        sendToClient(receiver, {
            type: 'game_state',
            state: message.state
        });
    }
}

function forwardChat(ws, message) {
    const game = games.get(ws.gameId);
    if (!game) return;
    
    const receiver = game.players[1 - ws.playerIndex];
    if (receiver && receiver.readyState === WebSocket.OPEN) {
        sendToClient(receiver, {
            type: 'chat',
            from: ws.playerName,
            text: message.text
        });
    }
}

function handleDisconnect(ws) {
    const idx = waitingPlayers.indexOf(ws);
    if (idx !== -1) {
        waitingPlayers.splice(idx, 1);
        console.log(`玩家 ${ws.playerName} 取消等待`);
    }
    
    if (ws.gameId) {
        const game = games.get(ws.gameId);
        if (game) {
            const opponent = game.players[1 - ws.playerIndex];
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                sendToClient(opponent, { type: 'opponent_disconnected' });
            }
            games.delete(ws.gameId);
            console.log(`游戏 ${ws.gameId} 结束`);
        }
    }
}

function sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function generateGameId() {
    return Math.random().toString(36).substring(2, 10);
}

server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('等待玩家连接...');
});
