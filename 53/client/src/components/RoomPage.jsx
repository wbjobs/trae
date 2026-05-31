import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Whiteboard from './Whiteboard';
import AudioControls from './AudioControls';

export default function RoomPage({ webRTC }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const whiteboardRef = useRef(null);
  const setOnMessageRef = useRef(null);
  const syncRequestedRef = useRef(false);

  useEffect(() => {
    if (!webRTC.roomId && roomId && webRTC.wsConnected) {
      webRTC.joinRoom(roomId);
    }
  }, [roomId, webRTC]);

  useEffect(() => {
    if (webRTC.connected && !syncRequestedRef.current) {
      syncRequestedRef.current = true;
      if (whiteboardRef.current) {
        setTimeout(() => {
          whiteboardRef.current.requestSync?.();
        }, 500);
      }
    }
    if (!webRTC.connected) {
      syncRequestedRef.current = false;
    }
  }, [webRTC.connected]);

  const inviteLink = `${window.location.origin}/room/${roomId}`;

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const handleRemoteDraw = useCallback((callback) => {
    setOnMessageRef.current = callback;
  }, []);

  useEffect(() => {
    if (setOnMessageRef.current) {
      webRTC.setOnMessage(setOnMessageRef.current);
    }
  }, [webRTC, handleRemoteDraw]);

  const handleConnected = useCallback((callback) => {
    webRTC.setOnReconnectSuccess(callback);
  }, [webRTC]);

  const goHome = () => {
    navigate('/');
    window.location.reload();
  };

  return (
    <div className="room-container">
      <div className="room-header">
        <button className="back-btn" onClick={goHome}>
          ← 返回首页
        </button>
        <div className="room-info">
          <h2>房间号: {roomId}</h2>
          <div className="connection-status-group">
            <div className={`connection-badge ${webRTC.connected ? 'connected' : 'disconnected'}`}>
              {webRTC.connected ? '🟢 P2P已连接' : webRTC.isReconnecting ? '🟡 重连中...' : '🔴 等待对方加入...'}
            </div>
            {webRTC.isReconnecting && (
              <div className="reconnect-info">
                正在重连 ({webRTC.reconnectAttempts}/10)...
              </div>
            )}
          </div>
        </div>
        <div className="invite-section">
          <input
            type="text"
            value={inviteLink}
            readOnly
            className="invite-link"
          />
          <button className="copy-btn" onClick={copyInviteLink}>
            {copied ? '✓ 已复制' : '复制邀请链接'}
          </button>
        </div>
      </div>

      {webRTC.isReconnecting && (
        <div className="reconnect-banner">
          <div className="spinner-small" />
          <span>网络波动，正在尝试重连... ({webRTC.reconnectAttempts}/10)</span>
        </div>
      )}

      {webRTC.connected && (
        <button 
          className="audio-panel-toggle"
          onClick={() => setShowAudioPanel(!showAudioPanel)}
        >
          {webRTC.audioEnabled ? '🎙️ 语音聊天已开启' : '🎤 点击开启语音聊天'}
          <span className="toggle-arrow">{showAudioPanel ? '▲' : '▼'}</span>
        </button>
      )}

      {showAudioPanel && webRTC.connected && (
        <div className="audio-panel">
          <AudioControls
            audioEnabled={webRTC.audioEnabled}
            remoteAudioEnabled={webRTC.remoteAudioEnabled}
            onToggleAudio={webRTC.toggleAudio}
            setRemoteAudioElement={webRTC.setRemoteAudioElement}
          />
        </div>
      )}

      {!webRTC.connected && !webRTC.isReconnecting && (
        <div className="waiting-overlay">
          <div className="waiting-card">
            <div className="spinner" />
            <h3>等待对方加入...</h3>
            <p>分享邀请链接给好友开始协作</p>
            <div className="invite-share">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="invite-link-large"
              />
              <button className="copy-btn-large" onClick={copyInviteLink}>
                {copied ? '✓ 已复制' : '复制链接'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Whiteboard
        ref={whiteboardRef}
        sendMessage={webRTC.sendMessage}
        onRemoteDraw={handleRemoteDraw}
        onConnected={handleConnected}
      />
    </div>
  );
}
