const socket = io();
const CHUNK_SIZE = 1024 * 1024;
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

const HEARTBEAT_INTERVAL = 3000;
const HEARTBEAT_TIMEOUT = 10000;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;
const FEC_RATIO = 0.25;
const GF_SIZE = 256;
const GF_POLY = 0x11d;

let roomId = null;
let peerConnection = null;
let dataChannel = null;
let selectedFile = null;
let fileMd5 = null;
let isInitiator = false;
let receivedChunks = [];
let fileInfo = null;
let currentChunkIndex = 0;
let isTransmitting = false;
let reconnectAttempts = 0;
let heartbeatTimer = null;
let heartbeatTimeoutTimer = null;
let lastHeartbeatTime = 0;
let isReconnecting = false;
let iceRestartInProgress = false;
let encryptionKey = null;
let enableEncryption = true;
let enableFEC = true;
let qrCodeInstance = null;

const $ = (id) => document.getElementById(id);
const createRoomBtn = $('create-room-btn');
const joinRoomBtn = $('join-room-btn');
const roomIdInput = $('room-id-input');
const roomInfo = $('room-info');
const roomIdDisplay = $('room-id-display');
const connectionStatus = $('connection-status');
const transferSection = $('transfer-section');
const fileInput = $('file-input');
const fileName = $('file-name');
const sendBtn = $('send-btn');
const progressContainer = $('progress-container');
const progressText = $('progress-text');
const progressFill = $('progress-fill');
const fileSize = $('file-size');
const transferStatus = $('transfer-status');
const downloadSection = $('download-section');
const downloadLink = $('download-link');
const statusMessage = $('status-message');
const encryptionSection = $('encryption-section');
const enableEncryptionCheckbox = $('enable-encryption');
const enableFecCheckbox = $('enable-fec');
const encryptionKeyInput = $('encryption-key');
const generateKeyBtn = $('generate-key-btn');
const showQrBtn = $('show-qr-btn');
const qrModal = $('qr-modal');
const qrCodeDiv = $('qr-code');
const qrKeyText = $('qr-key-text');
const closeQrBtn = $('close-qr-btn');

let gfLog = new Uint8Array(GF_SIZE);
let gfExp = new Uint8Array(GF_SIZE * 2);

function initGaloisField() {
    let x = 1;
    for (let i = 0; i < GF_SIZE - 1; i++) {
        gfExp[i] = x;
        gfLog[x] = i;
        x <<= 1;
        if (x & GF_SIZE) {
            x ^= GF_POLY;
        }
    }
    gfExp[GF_SIZE - 1] = gfExp[0];
    for (let i = GF_SIZE - 1; i < GF_SIZE * 2; i++) {
        gfExp[i] = gfExp[i - (GF_SIZE - 1)];
    }
}

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return gfExp[gfLog[a] + gfLog[b]];
}

function gfDiv(a, b) {
    if (a === 0) return 0;
    if (b === 0) throw new Error('Division by zero');
    return gfExp[gfLog[a] + (GF_SIZE - 1) - gfLog[b]];
}

function gfPolyMul(poly1, poly2) {
    const result = new Uint8Array(poly1.length + poly2.length - 1);
    for (let i = 0; i < poly1.length; i++) {
        for (let j = 0; j < poly2.length; j++) {
            result[i + j] ^= gfMul(poly1[i], poly2[j]);
        }
    }
    return result;
}

function rsGeneratorPoly(nsym) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < nsym; i++) {
        g = gfPolyMul(g, new Uint8Array([1, gfExp[i]]));
    }
    return g;
}

function rsEncode(data, nsym) {
    const gen = rsGeneratorPoly(nsym);
    const result = new Uint8Array(data.length + nsym);
    result.set(data);
    
    for (let i = 0; i < data.length; i++) {
        const coef = result[i];
        if (coef !== 0) {
            for (let j = 1; j < gen.length; j++) {
                result[i + j] ^= gfMul(gen[j], coef);
            }
        }
    }
    
    result.set(data);
    return result;
}

function rsSyndrome(data, nsym) {
    const syndrome = new Uint8Array(nsym);
    for (let i = 0; i < nsym; i++) {
        let sum = 0;
        for (let j = 0; j < data.length; j++) {
            sum ^= gfMul(data[j], gfExp[i * j]);
        }
        syndrome[i] = sum;
    }
    return syndrome;
}

function rsFindErrors(syndrome, nmess) {
    let errPoly = new Uint8Array([1]);
    let oldPoly = new Uint8Array([1]);
    let errCount = 0;
    
    for (let i = 0; i < syndrome.length; i++) {
        let delta = syndrome[i];
        for (let j = 1; j < errPoly.length; j++) {
            delta ^= gfMul(errPoly[errPoly.length - 1 - j], syndrome[i - j]);
        }
        
        oldPoly = new Uint8Array([...oldPoly, 0]);
        
        if (delta !== 0) {
            if (oldPoly.length > errPoly.length) {
                const newPoly = new Uint8Array(oldPoly);
                for (let j = 0; j < errPoly.length; j++) {
                    newPoly[newPoly.length - 1 - j] ^= gfMul(delta, errPoly[errPoly.length - 1 - j]);
                }
                errPoly = newPoly;
                errCount++;
            } else {
                for (let j = 0; j < errPoly.length; j++) {
                    errPoly[errPoly.length - 1 - j] ^= gfMul(delta, oldPoly[oldPoly.length - 1 - j]);
                }
            }
        }
    }
    
    const errorPositions = [];
    for (let i = 0; i < nmess; i++) {
        let evalResult = 0;
        for (let j = 0; j < errPoly.length; j++) {
            evalResult ^= gfMul(errPoly[errPoly.length - 1 - j], gfExp[j * i]);
        }
        if (evalResult === 0) {
            errorPositions.push(nmess - 1 - i);
        }
    }
    
    return errorPositions;
}

function rsCorrectErrors(data, syndrome, errorPositions) {
    const result = new Uint8Array(data);
    
    for (const pos of errorPositions) {
        if (pos < result.length) {
            let xInverse = gfExp[(GF_SIZE - 1) - (result.length - 1 - pos)];
            let numerator = 0;
            let denominator = 1;
            
            for (const otherPos of errorPositions) {
                if (otherPos !== pos) {
                    const otherXInverse = gfExp[(GF_SIZE - 1) - (result.length - 1 - otherPos)];
                    denominator = gfMul(denominator, xInverse ^ otherXInverse);
                }
            }
            
            for (let i = 0; i < syndrome.length; i++) {
                numerator ^= gfMul(syndrome[i], gfExp[i * (result.length - 1 - pos)]);
            }
            numerator = gfMul(numerator, xInverse);
            
            result[pos] ^= gfDiv(numerator, denominator);
        }
    }
    
    return result;
}

function rsDecode(encoded, nsym, erasures = []) {
    const data = new Uint8Array(encoded);
    const nmess = data.length - nsym;
    
    for (const pos of erasures) {
        if (pos < data.length) {
            data[pos] = 0;
        }
    }
    
    const syndrome = rsSyndrome(data, nsym);
    const hasErrors = syndrome.some(s => s !== 0);
    
    if (!hasErrors) {
        return data.slice(0, nmess);
    }
    
    const errorPositions = rsFindErrors(syndrome, data.length);
    if (errorPositions.length + erasures.length > nsym / 2) {
        throw new Error('Too many errors to correct');
    }
    
    const corrected = rsCorrectErrors(data, syndrome, [...errorPositions, ...erasures]);
    return corrected.slice(0, nmess);
}

initGaloisField();

function showMessage(text, type = 'info') {
    statusMessage.textContent = text;
    statusMessage.className = `status-message show ${type}`;
    setTimeout(() => statusMessage.classList.remove('show'), 3000);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function calculateMD5(file) {
    return new Promise((resolve, reject) => {
        const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
        const chunks = Math.ceil(file.size / CHUNK_SIZE);
        let currentChunk = 0;
        const spark = new SparkMD5.ArrayBuffer();
        const fileReader = new FileReader();

        fileReader.onload = (e) => {
            spark.append(e.target.result);
            currentChunk++;
            if (currentChunk < chunks) {
                loadNext();
            } else {
                resolve(spark.end());
            }
        };

        fileReader.onerror = () => {
            reject(new Error('MD5 calculation error'));
        };

        function loadNext() {
            const start = currentChunk * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
        }

        loadNext();
    });
}

function generateRandomKey(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

async function deriveKey(password) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const salt = encoder.encode('webrtc-file-transfer-salt');
    
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptData(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
    );
    
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    return result.buffer;
}

async function decryptData(key, encryptedData) {
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        data
    );
    
    return decrypted;
}

function applyFEC(data) {
    const dataArray = new Uint8Array(data);
    const nsym = Math.max(4, Math.ceil(dataArray.length * FEC_RATIO));
    const encoded = rsEncode(dataArray, nsym);
    return {
        data: encoded.buffer,
        nsym: nsym
    };
}

function removeFEC(encodedData, nsym) {
    const encodedArray = new Uint8Array(encodedData);
    try {
        const decoded = rsDecode(encodedArray, nsym);
        return decoded.buffer;
    } catch (e) {
        console.warn('FEC decoding failed, returning data without correction:', e);
        return encodedArray.slice(0, encodedArray.length - nsym).buffer;
    }
}

generateKeyBtn.addEventListener('click', () => {
    const key = generateRandomKey(32);
    encryptionKeyInput.value = key;
    encryptionKey = key;
    showMessage('随机密码已生成', 'success');
});

showQrBtn.addEventListener('click', () => {
    if (!encryptionKeyInput.value) {
        showMessage('请先生成或输入密码', 'error');
        return;
    }
    
    qrCodeDiv.innerHTML = '';
    qrKeyText.textContent = encryptionKeyInput.value;
    
    qrCodeInstance = new QRCode(qrCodeDiv, {
        text: encryptionKeyInput.value,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    
    qrModal.classList.remove('hidden');
});

closeQrBtn.addEventListener('click', () => {
    qrModal.classList.add('hidden');
    if (qrCodeInstance) {
        qrCodeDiv.innerHTML = '';
        qrCodeInstance = null;
    }
});

qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        closeQrBtn.click();
    }
});

enableEncryptionCheckbox.addEventListener('change', (e) => {
    enableEncryption = e.target.checked;
    encryptionKeyInput.disabled = !enableEncryption;
    generateKeyBtn.disabled = !enableEncryption;
    showQrBtn.disabled = !enableEncryption;
});

enableFecCheckbox.addEventListener('change', (e) => {
    enableFEC = e.target.checked;
});

encryptionKeyInput.addEventListener('input', (e) => {
    encryptionKey = e.target.value;
});

createRoomBtn.addEventListener('click', () => {
    socket.emit('create-room', (response) => {
        if (response.success) {
            roomId = response.roomId;
            isInitiator = true;
            roomIdDisplay.textContent = roomId;
            roomInfo.classList.remove('hidden');
            encryptionSection.classList.remove('hidden');
            createRoomBtn.disabled = true;
            joinRoomBtn.disabled = true;
            roomIdInput.disabled = true;
            showMessage('房间创建成功，分享房间号和密码给对方', 'success');
        }
    });
});

joinRoomBtn.addEventListener('click', () => {
    const id = roomIdInput.value.trim().toUpperCase();
    if (!id) {
        showMessage('请输入房间号', 'error');
        return;
    }
    socket.emit('join-room', { roomId: id }, (response) => {
        if (response.success) {
            roomId = id;
            isInitiator = false;
            roomIdDisplay.textContent = roomId;
            roomInfo.classList.remove('hidden');
            encryptionSection.classList.remove('hidden');
            createRoomBtn.disabled = true;
            joinRoomBtn.disabled = true;
            roomIdInput.disabled = true;
            createPeerConnection();
            showMessage('已加入房间，正在建立连接...', 'success');
        } else {
            showMessage(response.error, 'error');
        }
    });
});

socket.on('peer-joined', () => {
    connectionStatus.textContent = '对方已加入，正在建立连接...';
    createPeerConnection();
});

socket.on('signal', async ({ data }) => {
    try {
        if (!peerConnection) return;

        if (data.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignal({ type: 'answer', sdp: answer.sdp });
        } else if (data.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.ice) {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.ice));
            }
        } else if (data.type === 'ice-restart-request') {
            if (isInitiator) {
                restartICE();
            }
        }
    } catch (err) {
        console.error('Signal error:', err);
    }
});

function sendSignal(data) {
    socket.emit('signal', { roomId, data });
}

function createPeerConnection() {
    if (peerConnection) {
        cleanupPeerConnection();
    }

    peerConnection = new RTCPeerConnection(ICE_CONFIG);

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            sendSignal({ ice: e.candidate });
        }
    };

    peerConnection.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', peerConnection.iceGatheringState);
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        handleICEConnectionStateChange();
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        handleConnectionStateChange();
    };

    peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
    };

    peerConnection.ondatachannel = (e) => {
        setupDataChannel(e.channel);
    };

    if (isInitiator) {
        dataChannel = peerConnection.createDataChannel('fileTransfer', {
            ordered: true,
            maxRetransmits: 3
        });
        setupDataChannel(dataChannel);
        createOffer();
    }
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer({
            iceRestart: iceRestartInProgress
        });
        await peerConnection.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer.sdp });
        iceRestartInProgress = false;
    } catch (err) {
        console.error('Create offer error:', err);
    }
}

function setupDataChannel(channel) {
    if (dataChannel) {
        dataChannel.onopen = null;
        dataChannel.onmessage = null;
        dataChannel.onclose = null;
        dataChannel.onerror = null;
    }

    dataChannel = channel;
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
        console.log('Data channel opened');
        onConnectionStable();
    };

    dataChannel.onmessage = handleDataChannelMessage;

    dataChannel.onclose = () => {
        console.log('Data channel closed');
        stopHeartbeat();
    };

    dataChannel.onerror = (err) => {
        console.error('Data channel error:', err);
    };
}

function onConnectionStable() {
    reconnectAttempts = 0;
    isReconnecting = false;
    connectionStatus.textContent = '连接已建立！';
    transferSection.classList.remove('hidden');
    showMessage('连接成功，可以发送文件了', 'success');
    startHeartbeat();

    if (fileInfo && receivedChunks.length > 0) {
        const receivedCount = receivedChunks.filter(c => c !== null).length;
        if (receivedCount < fileInfo.totalChunks) {
            showMessage('检测到未完成的传输，将从断点续传', 'info');
            transferStatus.textContent = `断点续传中...已完成 ${Math.round((receivedCount / fileInfo.totalChunks) * 100)}%`;
            const nextIndex = receivedChunks.findIndex(c => c === null);
            if (nextIndex !== -1) {
                dataChannel.send(JSON.stringify({ type: 'chunk-request', index: nextIndex }));
            }
        }
    }

    if (isTransmitting && selectedFile) {
        showMessage('恢复文件传输...', 'info');
        dataChannel.send(JSON.stringify({
            type: 'resume-notification',
            currentIndex: currentChunkIndex
        }));
    }
}

function handleICEConnectionStateChange() {
    const state = peerConnection.iceConnectionState;
    
    if (state === 'connected' || state === 'completed') {
    } else if (state === 'disconnected') {
        console.log('ICE disconnected, attempting ICE restart');
        scheduleICERestart();
    } else if (state === 'failed') {
        console.log('ICE failed, attempting full reconnection');
        handleDisconnection();
    } else if (state === 'checking') {
        connectionStatus.textContent = '正在连接...';
    }
}

function handleConnectionStateChange() {
    const state = peerConnection.connectionState;
    
    if (state === 'connected') {
    } else if (state === 'disconnected' || state === 'failed') {
        handleDisconnection();
    } else if (state === 'closed') {
        connectionStatus.textContent = '连接已关闭';
        stopHeartbeat();
    }
}

function scheduleICERestart() {
    if (iceRestartInProgress || isReconnecting) return;
    
    iceRestartInProgress = true;
    connectionStatus.textContent = '网络变化，正在重新连接...';
    
    if (isInitiator) {
        setTimeout(() => {
            restartICE();
        }, 1000);
    } else {
        sendSignal({ type: 'ice-restart-request' });
    }
}

async function restartICE() {
    if (!peerConnection || !isInitiator) return;
    
    console.log('Restarting ICE');
    try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer.sdp });
    } catch (err) {
        console.error('ICE restart error:', err);
        handleDisconnection();
    }
}

function handleDisconnection() {
    if (isReconnecting) return;
    
    isReconnecting = true;
    stopHeartbeat();
    connectionStatus.textContent = '连接断开，正在尝试重连...';
    transferSection.classList.add('hidden');
    showMessage('连接断开，正在尝试重连...', 'info');

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(() => {
            if (peerConnection) {
                cleanupPeerConnection();
            }
            createPeerConnection();
        }, RECONNECT_DELAY);
    } else {
        connectionStatus.textContent = '重连失败，请刷新页面重试';
        showMessage('重连失败，请刷新页面重试', 'error');
        isReconnecting = false;
    }
}

function cleanupPeerConnection() {
    stopHeartbeat();
    if (dataChannel) {
        try {
            dataChannel.close();
        } catch (e) {}
        dataChannel = null;
    }
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (e) {}
        peerConnection = null;
    }
}

function startHeartbeat() {
    stopHeartbeat();
    lastHeartbeatTime = Date.now();
    
    heartbeatTimer = setInterval(() => {
        if (dataChannel && dataChannel.readyState === 'open') {
            try {
                dataChannel.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            } catch (e) {
                console.error('Heartbeat send error:', e);
            }
        }
    }, HEARTBEAT_INTERVAL);

    heartbeatTimeoutTimer = setInterval(() => {
        if (Date.now() - lastHeartbeatTime > HEARTBEAT_TIMEOUT) {
            console.log('Heartbeat timeout');
            handleDisconnection();
        }
    }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (heartbeatTimeoutTimer) {
        clearInterval(heartbeatTimeoutTimer);
        heartbeatTimeoutTimer = null;
    }
}

async function handleDataChannelMessage(e) {
    if (typeof e.data === 'string') {
        const message = JSON.parse(e.data);
        handleControlMessage(message);
    } else {
        await handleChunkData(e.data);
    }
}

function handleControlMessage(message) {
    switch (message.type) {
        case 'heartbeat':
            lastHeartbeatTime = Date.now();
            break;
        case 'file-info':
            handleFileInfo(message);
            break;
        case 'chunk-request':
            handleChunkRequest(message);
            break;
        case 'transfer-complete':
            handleTransferComplete(message);
            break;
        case 'resume-notification':
            handleResumeNotification(message);
            break;
    }
}

function handleFileInfo(message) {
    const savedState = getTransferState();
    
    if (savedState && savedState.fileInfo && 
        savedState.fileInfo.md5 === message.md5 && 
        savedState.fileInfo.size === message.size) {
        
        fileInfo = savedState.fileInfo;
        receivedChunks = new Array(message.totalChunks).fill(null);
        
        savedState.receivedChunkIndices.forEach(index => {
            if (index < receivedChunks.length) {
                receivedChunks[index] = true;
            }
        });
        
        progressContainer.classList.remove('hidden');
        downloadSection.classList.add('hidden');
        fileSize.textContent = formatFileSize(message.size);
        transferStatus.textContent = `继续接收: ${message.name}`;
        
        const receivedCount = receivedChunks.filter(c => c !== null).length;
        const progress = Math.round((receivedCount / message.totalChunks) * 100);
        progressFill.style.width = progress + '%';
        progressText.textContent = progress + '%';
        
        showMessage('检测到未完成的传输，从断点续传', 'info');
        
        const nextIndex = receivedChunks.findIndex(c => c === null);
        if (nextIndex !== -1) {
            loadReceivedChunksFromStorage(message.md5);
            setTimeout(() => {
                dataChannel.send(JSON.stringify({ type: 'chunk-request', index: nextIndex }));
            }, 500);
        } else {
            assembleAndVerifyFile();
        }
    } else {
        clearTransferState();
        fileInfo = message;
        receivedChunks = new Array(message.totalChunks).fill(null);
        progressContainer.classList.remove('hidden');
        downloadSection.classList.add('hidden');
        fileSize.textContent = formatFileSize(message.size);
        transferStatus.textContent = `接收文件: ${message.name}`;
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        
        saveTransferState();
        dataChannel.send(JSON.stringify({ type: 'chunk-request', index: 0 }));
    }
}

function handleChunkRequest(message) {
    currentChunkIndex = message.index;
    if (currentChunkIndex === 0) {
        isTransmitting = true;
    }
    sendNextChunk();
}

async function handleChunkData(data) {
    const view = new DataView(data);
    const chunkIndex = view.getUint32(0, true);
    const flags = view.getUint8(4);
    const encrypted = (flags & 1) === 1;
    const hasFEC = (flags & 2) === 2;
    let nsym = 0;
    let headerSize = 5;
    
    if (hasFEC) {
        nsym = view.getUint16(headerSize, true);
        headerSize += 2;
    }
    
    let chunkData = data.slice(headerSize);
    
    if (hasFEC) {
        try {
            chunkData = removeFEC(chunkData, nsym);
        } catch (e) {
            console.warn('FEC decode failed for chunk', chunkIndex, e);
        }
    }
    
    if (encrypted) {
        if (!encryptionKey) {
            showMessage('需要加密密码才能解密文件', 'error');
            return;
        }
        try {
            const key = await deriveKey(encryptionKey);
            chunkData = await decryptData(key, chunkData);
        } catch (e) {
            console.error('Decryption failed:', e);
            showMessage('解密失败，请检查密码是否正确', 'error');
            return;
        }
    }
    
    receivedChunks[chunkIndex] = new Uint8Array(chunkData);
    saveChunkToStorage(fileInfo.md5, chunkIndex, new Uint8Array(chunkData));

    const receivedCount = receivedChunks.filter(c => c !== null).length;
    const progress = Math.round((receivedCount / fileInfo.totalChunks) * 100);
    progressFill.style.width = progress + '%';
    progressText.textContent = progress + '%';
    transferStatus.textContent = `已接收 ${receivedCount}/${fileInfo.totalChunks} 块`;

    saveTransferState();

    if (receivedCount < fileInfo.totalChunks) {
        const nextIndex = receivedChunks.findIndex(c => c === null);
        if (nextIndex !== -1) {
            dataChannel.send(JSON.stringify({ type: 'chunk-request', index: nextIndex }));
        }
    } else {
        assembleAndVerifyFile();
    }
}

async function assembleAndVerifyFile() {
    transferStatus.textContent = '正在校验文件完整性...';
    const fullBuffer = new Uint8Array(fileInfo.size);
    let offset = 0;

    for (let i = 0; i < receivedChunks.length; i++) {
        fullBuffer.set(new Uint8Array(receivedChunks[i]), offset);
        offset += receivedChunks[i].byteLength;
    }

    const blob = new Blob([fullBuffer], { type: fileInfo.type });
    const computedMd5 = await calculateMD5(blob);

    if (computedMd5 === fileInfo.md5) {
        transferStatus.textContent = '文件校验通过！';
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = fileInfo.name;
        downloadSection.classList.remove('hidden');
        showMessage('文件接收成功！', 'success');
        clearTransferState();
        clearChunksFromStorage(fileInfo.md5);
        isTransmitting = false;
    } else {
        transferStatus.textContent = '文件校验失败，请重新传输';
        showMessage('文件校验失败，请重新传输', 'error');
        clearTransferState();
        clearChunksFromStorage(fileInfo.md5);
    }
}

function handleTransferComplete(message) {
    console.log('Transfer complete confirmed');
    isTransmitting = false;
}

function handleResumeNotification(message) {
    if (fileInfo && receivedChunks.length > 0) {
        const receivedCount = receivedChunks.filter(c => c !== null).length;
        if (receivedCount < fileInfo.totalChunks) {
            showMessage('对方恢复传输，继续接收...', 'info');
        }
    }
}

function saveChunkToStorage(fileMd5, index, data) {
    try {
        const key = `chunk_${fileMd5}_${index}`;
        const base64 = arrayBufferToBase64(data);
        localStorage.setItem(key, base64);
    } catch (e) {
        console.warn('Failed to save chunk to storage:', e);
    }
}

function loadChunkFromStorage(fileMd5, index) {
    try {
        const key = `chunk_${fileMd5}_${index}`;
        const base64 = localStorage.getItem(key);
        if (base64) {
            return base64ToArrayBuffer(base64);
        }
    } catch (e) {
        console.warn('Failed to load chunk from storage:', e);
    }
    return null;
}

function loadReceivedChunksFromStorage(fileMd5) {
    for (let i = 0; i < receivedChunks.length; i++) {
        if (receivedChunks[i] === true) {
            const data = loadChunkFromStorage(fileMd5, i);
            if (data) {
                receivedChunks[i] = new Uint8Array(data);
            } else {
                receivedChunks[i] = null;
            }
        }
    }
}

function clearChunksFromStorage(fileMd5) {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`chunk_${fileMd5}_`)) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
    } catch (e) {
        console.warn('Failed to clear chunks from storage:', e);
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function saveTransferState() {
    if (!fileInfo) return;
    try {
        const state = {
            fileInfo: fileInfo,
            receivedChunkIndices: receivedChunks
                .map((c, i) => c !== null ? i : -1)
                .filter(i => i !== -1),
            totalChunks: fileInfo.totalChunks,
            currentChunkIndex: currentChunkIndex,
            timestamp: Date.now()
        };
        localStorage.setItem(`transfer_${roomId}`, JSON.stringify(state));
        socket.emit('save-transfer-state', { roomId, state });
    } catch (e) {
        console.warn('Failed to save transfer state:', e);
    }
}

function getTransferState() {
    try {
        const localState = JSON.parse(localStorage.getItem(`transfer_${roomId}`) || 'null');
        if (localState) {
            return localState;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function clearTransferState() {
    try {
        localStorage.removeItem(`transfer_${roomId}`);
    } catch (e) {}
}

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
        showMessage('文件大小不能超过 2GB', 'error');
        fileInput.value = '';
        return;
    }

    selectedFile = file;
    fileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
    sendBtn.disabled = false;
    showMessage('正在计算文件 MD5...', 'info');

    try {
        fileMd5 = await calculateMD5(file);
        showMessage('MD5 计算完成', 'success');
    } catch (err) {
        showMessage('MD5 计算失败', 'error');
    }
});

sendBtn.addEventListener('click', async () => {
    if (!selectedFile || !dataChannel || dataChannel.readyState !== 'open') {
        showMessage('请先建立连接并选择文件', 'error');
        return;
    }

    if (enableEncryption && !encryptionKey) {
        showMessage('请输入加密密码', 'error');
        return;
    }

    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
    const fileInfoMsg = {
        type: 'file-info',
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        md5: fileMd5,
        totalChunks: totalChunks,
        encrypted: enableEncryption,
        fec: enableFEC
    };

    progressContainer.classList.remove('hidden');
    downloadSection.classList.add('hidden');
    fileSize.textContent = formatFileSize(selectedFile.size);
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    transferStatus.textContent = '正在发送文件信息...';

    dataChannel.send(JSON.stringify(fileInfoMsg));
    sendBtn.disabled = true;
});

async function processChunk(chunkData) {
    let processedData = chunkData;
    let flags = 0;
    let nsym = 0;

    if (enableEncryption) {
        if (!encryptionKey) {
            throw new Error('Encryption key not provided');
        }
        const key = await deriveKey(encryptionKey);
        processedData = await encryptData(key, processedData);
        flags |= 1;
    }

    if (enableFEC) {
        const fecResult = applyFEC(processedData);
        processedData = fecResult.data;
        nsym = fecResult.nsym;
        flags |= 2;
    }

    return { data: processedData, flags, nsym };
}

async function sendNextChunk() {
    if (!isTransmitting || !selectedFile || currentChunkIndex >= Math.ceil(selectedFile.size / CHUNK_SIZE)) {
        return;
    }

    if (!dataChannel || dataChannel.readyState !== 'open') {
        console.warn('Data channel not ready, waiting for reconnection');
        return;
    }

    const start = currentChunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
    const chunk = selectedFile.slice(start, end);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const chunkData = e.target.result;
            const { data: processedData, flags, nsym } = await processChunk(chunkData);
            
            const headerSize = 5 + (enableFEC ? 2 : 0);
            const buffer = new ArrayBuffer(headerSize + processedData.byteLength);
            const view = new DataView(buffer);
            
            view.setUint32(0, currentChunkIndex, true);
            view.setUint8(4, flags);
            let offset = 5;
            
            if (enableFEC) {
                view.setUint16(offset, nsym, true);
                offset += 2;
            }
            
            new Uint8Array(buffer, offset).set(new Uint8Array(processedData));

            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(buffer);

                const progress = Math.round(((currentChunkIndex + 1) / Math.ceil(selectedFile.size / CHUNK_SIZE)) * 100);
                progressFill.style.width = progress + '%';
                progressText.textContent = progress + '%';
                transferStatus.textContent = `已发送 ${currentChunkIndex + 1}/${Math.ceil(selectedFile.size / CHUNK_SIZE)} 块`;

                currentChunkIndex++;
                if (currentChunkIndex < Math.ceil(selectedFile.size / CHUNK_SIZE)) {
                    setTimeout(sendNextChunk, 0);
                } else {
                    isTransmitting = false;
                    transferStatus.textContent = '文件发送完成！';
                    dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
                    showMessage('文件发送完成！', 'success');
                    sendBtn.disabled = false;
                }
            }
        } catch (err) {
            console.error('Send chunk error:', err);
            isTransmitting = false;
            showMessage('传输出错: ' + err.message, 'error');
            sendBtn.disabled = false;
        }
    };

    reader.readAsArrayBuffer(chunk);
}

window.addEventListener('online', () => {
    console.log('Network online');
    showMessage('网络已连接', 'info');
    if (peerConnection && (peerConnection.iceConnectionState === 'disconnected' || 
        peerConnection.iceConnectionState === 'failed')) {
        if (isInitiator) {
            restartICE();
        }
    }
});

window.addEventListener('offline', () => {
    console.log('Network offline');
    showMessage('网络已断开', 'error');
    connectionStatus.textContent = '网络断开，等待重连...';
});

socket.on('peer-disconnected', () => {
    connectionStatus.textContent = '对方已断开连接';
    transferSection.classList.add('hidden');
    showMessage('对方已断开连接', 'error');
    stopHeartbeat();
});

window.addEventListener('beforeunload', () => {
    cleanupPeerConnection();
});
