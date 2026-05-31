import { useState, useEffect, useCallback } from 'react';
import { Upload, Download, Copy, Check, AlertCircle, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useSignaling } from './hooks/useSignaling';
import { useWebRTC } from './hooks/useWebRTC';
import { useFileTransfer } from './hooks/useFileTransfer';
import { CHUNK_SIZE } from './utils/constants';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export default function App() {
  const [role, setRole] = useState(null);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [copied, setCopied] = useState(false);
  const [encryptionReady, setEncryptionReady] = useState(false);
  
  const signaling = useSignaling();
  const webrtc = useWebRTC(signaling.sendSignal, signaling.onSignal);
  const fileTransfer = useFileTransfer(webrtc);

  useEffect(() => {
    const cleanup = webrtc.setupSignalHandlers();
    return cleanup;
  }, [webrtc]);

  const handleEncryptionReady = useCallback(() => {
    setEncryptionReady(true);
  }, []);

  useEffect(() => {
    if (webrtc.isConnected) {
      webrtc.setEncryptionReadyHandler(handleEncryptionReady);
      
      if (role === 'sender' && !webrtc.isEncryptionReady()) {
        webrtc.initiateKeyExchange();
      }
    } else {
      setEncryptionReady(false);
    }
  }, [webrtc.isConnected, role, webrtc, handleEncryptionReady]);

  useEffect(() => {
    if (role === 'receiver') {
      fileTransfer.setupReceiveHandlers();
    }
  }, [role, fileTransfer]);

  const handleCreateRoom = async () => {
    try {
      await signaling.createRoom('sender');
    } catch (err) {
      console.error('创建房间失败:', err);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) return;
    try {
      await signaling.joinRoom(joinRoomId.trim().toUpperCase(), 'receiver');
    } catch (err) {
      console.error('加入房间失败:', err);
    }
  };

  const handleConnect = async () => {
    if (role === 'sender') {
      await webrtc.createOffer();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      fileTransfer.selectFile(file);
    }
  };

  const copyRoomId = () => {
    if (signaling.roomId) {
      navigator.clipboard.writeText(signaling.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusText = () => {
    if (!signaling.isConnected) return { text: '未连接', class: 'error' };
    if (signaling.roomId && !signaling.peerConnected) return { text: '等待对方加入...', class: 'connecting' };
    if (signaling.peerConnected && !webrtc.isConnected) return { text: '建立 P2P 连接中...', class: 'connecting' };
    if (webrtc.isConnected && !encryptionReady) return { text: '密钥协商中...', class: 'connecting' };
    if (webrtc.isConnected && encryptionReady) return { text: 'P2P 已连接 · 端到端加密', class: 'connected' };
    return { text: '未连接', class: 'error' };
  };

  const status = getStatusText();

  const renderSenderView = () => (
    <div className="card">
      <div className="role-selector">
        <button
          className={`role-btn ${role === 'sender' ? 'active' : ''}`}
          onClick={() => { setRole('sender'); }}
        >
          <Upload size={32} />
          <div style={{ marginTop: '10px' }}>发送文件</div>
        </button>
        <button
          className={`role-btn ${role === 'receiver' ? 'active' : ''}`}
          onClick={() => { setRole('receiver'); fileTransfer.resetTransfer(); }}
        >
          <Download size={32} />
          <div style={{ marginTop: '10px' }}>接收文件</div>
        </button>
      </div>

      {role === 'sender' && (
        <>
          {!signaling.roomId ? (
            <button className="btn" onClick={handleCreateRoom} style={{ width: '100%' }}>
              创建房间
            </button>
          ) : (
             
            <>
              <div className="room-info">
                <div>房间号：<strong>{signaling.roomId}</strong></div>
                <button
                  className="btn btn-secondary" onClick={copyRoomId}
                  style={{ marginTop: '10px' }}
                >
                  {copied ? <Check size={16} style={{ display: 'inline', marginRight: '5px' }} /> : <Copy size={16} style={{ display: 'inline', marginRight: '5px' }} />}
                  {copied ? '已复制' : '复制房间号'}
                </button>
              </div>

              {!signaling.peerConnected ? (
                <div className="status connecting">等待接收方加入...</div>
              ) : !webrtc.isConnected ? (
                <button className="btn" onClick={handleConnect} style={{ width: '100%' }}>
                  建立连接
                </button>
              ) : (
                <>
                  <div className="status connected">P2P 连接已建立</div>
                  
                  {!fileTransfer.file && !fileTransfer.isTransferring && (
                    <label className="file-input-wrapper">
                      <input type="file" onChange={handleFileChange} />
                      <Upload size={48} style={{ margin: '0 auto 10px', opacity: 0.7 }} />
                      <div>点击选择文件</div>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '5px' }}>
                        支持任意大小文件，自动分片传输
                      </div>
                    </label>
                  )}

                  {fileTransfer.file && !fileTransfer.isTransferring && !fileTransfer.isPreparing && (
                    <>
                      <div className="file-info">
                        <h3>{fileTransfer.file.name}</h3>
                        <div>大小：{formatFileSize(fileTransfer.file.size)}</div>
                        <div>分片数：{Math.ceil(fileTransfer.file.size / CHUNK_SIZE)}</div>
                        <div>每片大小：{formatFileSize(CHUNK_SIZE)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                          {encryptionReady ? (
                            <><Lock size={16} style={{ color: '#48bb78' }} /><span style={{ color: '#48bb78' }}>端到端加密已就绪</span></>
                          ) : (
                            <><Unlock size={16} style={{ color: '#ed8936' }} /><span style={{ color: '#ed8936' }}>正在协商密钥...</span></>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn"
                        onClick={fileTransfer.prepareAndSendFile}
                        style={{ width: '100%' }}
                        disabled={!encryptionReady}
                      >
                        {encryptionReady ? '开始传输' : '等待密钥协商...'}
                      </button>
                    </>
                  )}

                  {fileTransfer.isPreparing && (
                    <div className="progress-container">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${fileTransfer.progress}%` }} />
                      </div>
                      <div className="progress-text">
                        <span>正在准备文件...</span>
                        <span>{fileTransfer.progress}%</span>
                      </div>
                    </div>
                  )}

                  {(fileTransfer.isTransferring || fileTransfer.sentChunks > 0) && (
                    <>
                      <div className="stats">
                        <div className="stat-item">
                          <div className="value">{fileTransfer.progress}%</div>
                          <div className="label">传输进度</div>
                        </div>
                        <div className="stat-item">
                          <div className="value">{fileTransfer.sentChunks}</div>
                          <div className="label">已发送分片</div>
                        </div>
                        <div className="stat-item">
                          <div className="value">{fileTransfer.totalChunks}</div>
                          <div className="label">总分片</div>
                        </div>
                        <div className="stat-item">
                          <div className="value" style={{ color: '#f56565' }}>
                            {fileTransfer.retransmitCount}
                          </div>
                          <div className="label">重传次数</div>
                        </div>
                      </div>

                      <div className="progress-container">
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${fileTransfer.progress}%` }} />
                        </div>
                        <div className="progress-text">
                          <span>发送中...</span>
                          <span>{fileTransfer.sentChunks} / {fileTransfer.totalChunks}</span>
                        </div>
                      </div>

                      {fileTransfer.chunkStatus.length > 0 && (
                        <div className="chunks-health">
                          <h4>分片健康度</h4>
                          <div className="chunks-grid">
                            {fileTransfer.chunkStatus.map((chunk, idx) => (
                              <div
                                key={idx}
                                className={`chunk ${chunk.retransmitted ? 'retransmitted' : chunk.status === 'success' ? 'success' : 'pending'}`}
                                title={`分片 ${idx}: ${chunk.status}${chunk.retransmitted ? ' (重传)' : ''}`}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {fileTransfer.progress === 100 && (
                        <div className="status connected" style={{ marginTop: '20px' }}>
                          <Check size={20} style={{ display: 'inline', marginRight: '5px' }} />
                          文件传输完成！
                        </div>
                      )}
                    </>
                  )}

                  {fileTransfer.sentChunks > 0 && fileTransfer.progress === 100 && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        fileTransfer.resetTransfer();
                      }}
                      style={{ width: '100%', marginTop: '10px' }}
                    >
                      <RefreshCw size={16} style={{ display: 'inline', marginRight: '5px' }} />
                      发送新文件
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {role === 'receiver' && renderReceiverView()}
    </div>
  );

  const renderReceiverView = () => (
    <>
      {!signaling.roomId ? (
        <>
          <div className="input-group">
          <input
            type="text"
            placeholder="输入房间号"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button className="btn" onClick={handleJoinRoom}>
            加入房间
          </button>
        </div>
          {signaling.error && (
          <div className="status error">
            <AlertCircle size={16} style={{ display: 'inline', marginRight: '5px' }} />
            {signaling.error}
          </div>
        )}
        </>
      ) : (
        <>
          <div className="room-info">
            已加入房间：<strong>{signaling.roomId}</strong>
          </div>

          {!webrtc.isConnected ? (
            <div className="status connecting">等待发送方建立连接...</div>
          ) : (
             
            <>
              <div className="status connected">
                {encryptionReady ? (
                  <><Lock size={16} style={{ display: 'inline', marginRight: '5px' }} />P2P 已连接 · 端到端加密</>
                ) : (
                  <><Unlock size={16} style={{ display: 'inline', marginRight: '5px' }} />密钥协商中...</>
                )}
              </div>

              {fileTransfer.incomingFile && !fileTransfer.receivedFile && (
                <>
                  <div className="file-info">
                    <h3>{fileTransfer.incomingFile.name}</h3>
                    <div>大小：{formatFileSize(fileTransfer.incomingFile.size)}</div>
                    <div>分片数：{fileTransfer.incomingFile.chunkCount}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                      <Lock size={16} style={{ color: '#48bb78' }} />
                      <span style={{ color: '#48bb78' }}>端到端加密传输</span>
                    </div>
                  </div>

                  <div className="stats">
                    <div className="stat-item">
                      <div className="value">{fileTransfer.progress}%</div>
                      <div className="label">接收进度</div>
                    </div>
                    <div className="stat-item">
                      <div className="value">{fileTransfer.receivedChunks}</div>
                      <div className="label">已接收分片</div>
                    </div>
                    <div className="stat-item">
                      <div className="value">{fileTransfer.totalChunks}</div>
                      <div className="label">总分片</div>
                    </div>
                    <div className="stat-item">
                      <div className="value" style={{ color: '#f56565' }}>
                        {fileTransfer.retransmitCount}
                      </div>
                      <div className="label">重传次数</div>
                    </div>
                  </div>

                  <div className="progress-container">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${fileTransfer.progress}%` }} />
                    </div>
                    <div className="progress-text">
                      <span>接收中...</span>
                      <span>{fileTransfer.receivedChunks} / {fileTransfer.totalChunks}</span>
                    </div>
                  </div>

                  {fileTransfer.chunkStatus.length > 0 && (
                    <div className="chunks-health">
                      <h4>分片健康度</h4>
                      <div className="chunks-grid">
                        {fileTransfer.chunkStatus.map((chunk, idx) => (
                          <div
                            key={idx}
                            className={`chunk ${chunk.retransmitted ? 'retransmitted' : chunk.status === 'success' ? 'success' : 'pending'}`}
                            title={`分片 ${idx}: ${chunk.status}${chunk.retransmitted ? ' (重传)' : ''}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {fileTransfer.receivedFile && (
                <>
                  <div className="status connected" style={{ marginBottom: '20px' }}>
                    <Check size={20} style={{ display: 'inline', marginRight: '5px' }} />
                    文件接收完成！
                  </div>
                  <div className="file-info">
                    <h3>{fileTransfer.receivedFile.metadata.name}</h3>
                    <div>大小：{formatFileSize(fileTransfer.receivedFile.metadata.size)}</div>
                    <div>类型：{fileTransfer.receivedFile.metadata.type || '未知'}</div>
                  </div>
                  <button className="btn" onClick={fileTransfer.downloadFile} style={{ width: '100%' }}>
                    <Download size={16} style={{ display: 'inline', marginRight: '5px' }} />
                    下载文件
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      fileTransfer.resetTransfer();
                    }}
                    style={{ width: '100%', marginTop: '10px' }}
                  >
                    <RefreshCw size={16} style={{ display: 'inline', marginRight: '5px' }} />
                    接收新文件
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="app">
      <div className="header">
        <h1>WebRTC 文件传输</h1>
        <p>安全、快速的点对点文件传输 · 分片校验 · 自动重传</p>
      </div>

      {role && (
        <div className={`status ${status.class}`}>
          {status.text}
        </div>
      )}

      {!role ? (
        <div className="card">
          <div className="role-selector">
            <button className="role-btn" onClick={() => setRole('sender')}>
              <Upload size={48} />
              <div style={{ marginTop: '15px', fontSize: '1.1rem', fontWeight: '600' }}>发送文件</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '5px' }}>
                创建房间，发送文件给对方
              </div>
            </button>
            <button className="role-btn" onClick={() => setRole('receiver')}>
              <Download size={48} />
              <div style={{ marginTop: '15px', fontSize: '1.1rem', fontWeight: '600' }}>接收文件</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '5px' }}>
                输入房间号，接收对方文件
              </div>
            </button>
          </div>
        </div>
      ) : (
        renderSenderView()
      )}

      {role && (
        <button
          className="btn btn-secondary"
          onClick={() => {
            setRole(null);
            signaling.disconnect();
            webrtc.closeConnection();
            fileTransfer.resetTransfer();
            setJoinRoomId('');
          }}
          style={{ width: '100%' }}
        >
          返回首页
        </button>
      )}
    </div>
  );
}
