import React, { useState, useEffect, useCallback } from 'react';
import Terminal from './components/Terminal';
import ControlPanel from './components/ControlPanel';
import socket from './services/socket';

function App() {
  const [containerId, setContainerId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:3001/ws`;

    socket.connect(wsUrl).catch((err) => {
      console.error('Failed to connect:', err);
    });

    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => {
      setIsConnected(false);
      setIsRunning(false);
      setContainerId(null);
    };

    socket.on('connected', handleConnected);
    socket.on('disconnected', handleDisconnected);

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleContainerChange = useCallback((id) => {
    setContainerId(id);
  }, []);

  const handleStatusChange = useCallback((status) => {
    setIsRunning(status);
  }, []);

  return (
    <div className="app">
      <div className="header">
        <h1>🐳 在线容器终端</h1>
        <div className="status">
          <span>WebSocket:</span>
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span>{isConnected ? '已连接' : '未连接'}</span>
        </div>
      </div>

      <div className="main-content">
        <ControlPanel
          containerId={containerId}
          isRunning={isRunning}
          onContainerChange={handleContainerChange}
          onStatusChange={handleStatusChange}
        />

        <div className="terminal-container">
          {!isRunning && (
            <div className="welcome-screen">
              <h2>欢迎使用在线容器终端</h2>
              <p>选择一个 Docker 镜像并启动容器，即可开始使用交互式终端</p>
              <p>支持任意 Docker 镜像，包括 Alpine、Ubuntu、Node.js、Python 等</p>
              <p>容器将在闲置 10 分钟后自动销毁</p>
            </div>
          )}

          <Terminal
            containerId={containerId}
            isRunning={isRunning}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
