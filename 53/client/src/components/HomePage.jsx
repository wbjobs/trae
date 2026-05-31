import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function HomePage({ webRTC }) {
  const navigate = useNavigate();
  const { roomId: urlRoomId } = useParams();
  const [joinRoomId, setJoinRoomId] = useState('');

  useEffect(() => {
    if (urlRoomId && webRTC.wsConnected) {
      webRTC.joinRoom(urlRoomId);
    }
  }, [urlRoomId, webRTC.wsConnected, webRTC]);

  useEffect(() => {
    if (webRTC.roomId) {
      navigate(`/room/${webRTC.roomId}`);
    }
  }, [webRTC.roomId, navigate]);

  const handleCreateRoom = () => {
    webRTC.createRoom();
  };

  const handleJoinRoom = () => {
    if (joinRoomId.trim()) {
      webRTC.joinRoom(joinRoomId.trim().toUpperCase());
    }
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>🎨 WebRTC 实时画板</h1>
        <p className="subtitle">通过P2P连接，与好友实时同步绘画</p>

        {webRTC.error && (
          <div className="error-message">
            {webRTC.error}
          </div>
        )}

        <div className="action-section">
          <button className="btn btn-primary" onClick={handleCreateRoom}>
            创建新房间
          </button>

          <div className="divider">或</div>

          <div className="join-section">
            <input
              type="text"
              placeholder="输入房间号"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              maxLength={6}
              className="room-input"
            />
            <button className="btn btn-secondary" onClick={handleJoinRoom}>
              加入房间
            </button>
          </div>
        </div>

        <div className="connection-status">
          <span className={`status-dot ${webRTC.wsConnected ? 'connected' : 'disconnected'}`} />
          <span>{webRTC.wsConnected ? '已连接到服务器' : '正在连接服务器...'}</span>
        </div>

        <div className="features">
          <h3>功能特点</h3>
          <ul>
            <li>✏️ 实时同步绘制内容</li>
            <li>🎨 多种颜色和笔刷大小</li>
            <li>🔒 P2P加密传输</li>
            <li>📱 支持触摸设备</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
