import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store/useStore';

const sampleRooms = [
  { id: 'sample-1', name: '欢乐颂练习室', users: 3 },
  { id: 'sample-2', name: '小星星创作空间', users: 1 },
  { id: 'sample-3', name: '古典音乐研讨室', users: 5 },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { userName, setUserName } = useStore();
  const [roomName, setRoomName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');

  const createRoom = async () => {
    if (!userName.trim()) {
      alert('请输入您的名字');
      return;
    }
    
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName || '新乐谱' }),
      });
      const data = await response.json();
      navigate(`/room/${data.roomId}`);
    } catch (e) {
      const roomId = uuidv4();
      navigate(`/room/${roomId}`);
    }
  };

  const joinRoom = () => {
    if (!userName.trim()) {
      alert('请输入您的名字');
      return;
    }
    if (!joinRoomId.trim()) {
      alert('请输入房间ID');
      return;
    }
    navigate(`/room/${joinRoomId}`);
  };

  const joinSampleRoom = (roomId: string) => {
    if (!userName.trim()) {
      alert('请输入您的名字');
      return;
    }
    navigate(`/room/${roomId}`);
  };

  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <h1 style={styles.title}>🎵 WebRTC协同乐谱编辑器</h1>
        <p style={styles.subtitle}>多人实时协作编辑ABC记谱法乐谱</p>
      </div>

      <div style={styles.main}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>开始使用</h2>
          
          <div style={styles.inputGroup}>
            <label style={styles.label}>您的名字</label>
            <input
              type="text"
              style={styles.input}
              placeholder="请输入您的名字"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div style={styles.divider} />

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>创建新房间</h3>
            <input
              type="text"
              style={styles.input}
              placeholder="房间名称（可选）"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button style={styles.primaryButton} onClick={createRoom}>
              创建房间
            </button>
          </div>

          <div style={styles.divider} />

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>加入房间</h3>
            <input
              type="text"
              style={styles.input}
              placeholder="输入房间ID"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            <button style={styles.secondaryButton} onClick={joinRoom}>
              加入房间
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>演示房间</h2>
          <div style={styles.roomList}>
            {sampleRooms.map((room) => (
              <div key={room.id} style={styles.roomItem}>
                <div style={styles.roomInfo}>
                  <span style={styles.roomName}>{room.name}</span>
                  <span style={styles.roomUsers}>{room.users} 人在线</span>
                </div>
                <button 
                  style={styles.joinButton} 
                  onClick={() => joinSampleRoom(room.id)}
                >
                  加入
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>功能特性</h2>
          <div style={styles.features}>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>🔄</span>
              <div>
                <h4 style={styles.featureTitle}>实时协同</h4>
                <p style={styles.featureDesc}>基于CRDT算法，多人同时编辑无冲突</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>👁️</span>
              <div>
                <h4 style={styles.featureTitle}>双视图模式</h4>
                <p style={styles.featureDesc}>支持五线谱和简谱两种显示方式</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>🎹</span>
              <div>
                <h4 style={styles.featureTitle}>MIDI播放</h4>
                <p style={styles.featureDesc}>实时预览乐谱音频效果</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>📜</span>
              <div>
                <h4 style={styles.featureTitle}>版本历史</h4>
                <p style={styles.featureDesc}>自动保存，随时回溯历史版本</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer style={styles.footer}>
        <p>WebRTC协同乐谱编辑器 · 支持ABC记谱法</p>
      </footer>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  hero: {
    padding: '60px 20px 40px',
    textAlign: 'center' as const,
    color: 'white',
  },
  title: {
    fontSize: '42px',
    fontWeight: 'bold',
    marginBottom: '12px',
    textShadow: '0 2px 10px rgba(0,0,0,0.2)',
  },
  subtitle: {
    fontSize: '18px',
    opacity: 0.9,
  },
  main: {
    flex: 1,
    maxWidth: '900px',
    width: '100%',
    margin: '0 auto',
    padding: '0 20px 40px',
    display: 'grid',
    gap: '24px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '20px',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#555',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
    marginBottom: '12px',
  },
  primaryButton: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  secondaryButton: {
    width: '100%',
    padding: '14px',
    background: '#f0f0f0',
    color: '#333',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  divider: {
    height: '1px',
    background: '#eee',
    margin: '20px 0',
  },
  section: {
    marginTop: '0',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#444',
    marginBottom: '12px',
  },
  roomList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  roomItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    background: '#f8f9fa',
    borderRadius: '10px',
  },
  roomInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  roomName: {
    fontWeight: '500',
    color: '#333',
  },
  roomUsers: {
    fontSize: '13px',
    color: '#888',
  },
  joinButton: {
    padding: '8px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  features: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  featureIcon: {
    fontSize: '28px',
  },
  featureTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '4px',
  },
  featureDesc: {
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5',
  },
  footer: {
    padding: '24px',
    textAlign: 'center' as const,
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px',
  },
};
