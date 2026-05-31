import React, { useState, useEffect } from 'react';
import socket from '../services/socket';
import StatsPanel from './StatsPanel';

const ControlPanel = ({ containerId, isRunning, onContainerChange, onStatusChange }) => {
  const [image, setImage] = useState('alpine:latest');
  const [command, setCommand] = useState('/bin/sh');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!image.trim()) {
      setError('请输入镜像名称');
      return;
    }

    setIsCreating(true);
    setError('');

    const cmd = command.trim() ? command.trim().split(' ') : ['/bin/sh'];
    socket.send('create', { image: image.trim(), cmd });
  };

  const handleDestroy = () => {
    socket.send('destroy', {});
  };

  useEffect(() => {
    const handleCreated = (message) => {
      setIsCreating(false);
      onContainerChange(message.containerId);
      onStatusChange(true);
    };

    const handleDestroyed = () => {
      onContainerChange(null);
      onStatusChange(false);
    };

    const handleError = (message) => {
      setIsCreating(false);
      setError(message.message || '发生错误');
      onStatusChange(false);
    };

    socket.on('created', handleCreated);
    socket.on('destroyed', handleDestroyed);
    socket.on('error', handleError);

    return () => {
      socket.off('created', handleCreated);
      socket.off('destroyed', handleDestroyed);
      socket.off('error', handleError);
    };
  }, [onContainerChange, onStatusChange]);

  const quickImages = [
    'alpine:latest',
    'ubuntu:22.04',
    'node:18-alpine',
    'python:3.11-slim',
    'redis:7-alpine',
    'nginx:alpine',
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3>容器配置</h3>

        <div className="form-group">
          <label>Docker 镜像</label>
          <input
            type="text"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="例如: alpine:latest"
            disabled={isRunning || isCreating}
          />
        </div>

        <div className="form-group">
          <label>启动命令</label>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="例如: /bin/sh"
            disabled={isRunning || isCreating}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          {!isRunning ? (
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? '创建中...' : '启动容器'}
            </button>
          ) : (
            <button
              className="btn btn-danger"
              onClick={handleDestroy}
            >
              销毁容器
            </button>
          )}
        </div>

        {error && (
          <div className="error-message" style={{ marginTop: '12px' }}>
            {error}
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <h3>快速选择</h3>
        <div className="quick-actions" style={{ flexWrap: 'wrap' }}>
          {quickImages.map((img) => (
            <button
              key={img}
              className="quick-btn"
              onClick={() => setImage(img)}
              disabled={isRunning || isCreating}
            >
              {img}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>容器信息</h3>
        <div className="container-info">
          {containerId ? (
            <>
              <div><strong>容器 ID:</strong> {containerId.substring(0, 8)}...</div>
              <div><strong>状态:</strong> <span style={{ color: '#4ec9b0' }}>运行中</span></div>
              <div><strong>超时:</strong> 闲置 10 分钟后自动销毁</div>
            </>
          ) : (
            <div style={{ color: '#888' }}>暂无运行中的容器</div>
          )}
        </div>
      </div>

      <StatsPanel containerId={containerId} />
    </div>
  );
};

export default ControlPanel;
