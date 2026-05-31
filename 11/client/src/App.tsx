import React, { useEffect, useRef, useState, useCallback } from 'react';
import VideoWorker from './video.worker?worker';
import { StreamClient } from './streamClient';
import { SubtitleAligner, SubtitleEntry } from './subtitleAligner';
import { VideoChunk, SubtitleChunk, DriftDetectionResult } from './protocol';
import { ReliableReceiverStats } from './reliableReceiver';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const MIN_OFFSET_MS = -500;
const MAX_OFFSET_MS = 500;
const OFFSET_STEP_MS = 10;

interface Stats {
  framesDecoded: number;
  framesDropped: number;
  framesRendered: number;
  videoBytesReceived: number;
  subtitlesReceived: number;
}

interface ReliableStats {
  packetsReceived: number;
  packetsOrdered: number;
  packetsOutOfOrder: number;
  duplicatePackets: number;
  gapsDetected: number;
  sacksSent: number;
  reorderBufferSize: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoWorkerRef = useRef<VideoWorker | null>(null);
  const streamClientRef = useRef<StreamClient | null>(null);
  const alignerRef = useRef<SubtitleAligner>(new SubtitleAligner());
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [videos, setVideos] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPts, setCurrentPts] = useState(0);
  const [activeSubtitle, setActiveSubtitle] = useState<SubtitleEntry | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [savedOffset, setSavedOffset] = useState(0);

  const [stats, setStats] = useState<Stats>({
    framesDecoded: 0,
    framesDropped: 0,
    framesRendered: 0,
    videoBytesReceived: 0,
    subtitlesReceived: 0
  });

  const statsRef = useRef<Stats>({
    framesDecoded: 0,
    framesDropped: 0,
    framesRendered: 0,
    videoBytesReceived: 0,
    subtitlesReceived: 0
  });

  const [reliableStats, setReliableStats] = useState<ReliableStats>({
    packetsReceived: 0,
    packetsOrdered: 0,
    packetsOutOfOrder: 0,
    duplicatePackets: 0,
    gapsDetected: 0,
    sacksSent: 0,
    reorderBufferSize: 0
  });

  const [showDriftModal, setShowDriftModal] = useState(false);
  const [pendingDrift, setPendingDrift] = useState<DriftDetectionResult | null>(null);
  const [isApplyingDrift, setIsApplyingDrift] = useState(false);

  const initializeWorker = useCallback(() => {
    if (videoWorkerRef.current) return;

    const worker = new VideoWorker();
    videoWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'frame-transfer':
          handleVideoFrame(message.frame, message.pts);
          break;

        case 'stats':
          statsRef.current.framesDecoded = message.framesDecoded;
          statsRef.current.framesDropped = message.framesDropped;
          setStats({ ...statsRef.current });
          break;

        case 'error':
          console.error('[App] Worker error:', message.message);
          break;

        default:
          break;
      }
    };

    worker.postMessage({ type: 'init' });
  }, []);

  const handleVideoFrame = (frame: VideoFrame, pts: number) => {
    if (!canvasRef.current || !ctxRef.current) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
    }

    ctx.drawImage(frame, 0, 0);
    frame.close();

    statsRef.current.framesRendered++;
    setCurrentPts(pts);

    const subtitle = alignerRef.current.updateVideoPts(pts);
    setActiveSubtitle(subtitle);

    setStats({ ...statsRef.current });
  };

  const handleVideoChunk = (chunk: VideoChunk) => {
    if (!videoWorkerRef.current) return;

    statsRef.current.videoBytesReceived += chunk.data.length;
    if (statsRef.current.videoBytesReceived % 100000 < chunk.data.length) {
      setStats({ ...statsRef.current });
    }

    videoWorkerRef.current.postMessage({
      type: 'video-data',
      data: chunk.data,
      pts: chunk.pts,
      isKeyFrame: chunk.isKeyFrame
    });
  };

  const handleSubtitleChunk = (chunk: SubtitleChunk) => {
    statsRef.current.subtitlesReceived++;
    setStats({ ...statsRef.current });
    alignerRef.current.addSubtitle(chunk);
  };

  const loadVideos = useCallback(async () => {
    const client = streamClientRef.current;
    if (!client) return;

    try {
      const videoList = await client.listVideos();
      setVideos(videoList);
      if (videoList.length > 0 && !selectedVideo) {
        setSelectedVideo(videoList[0]);
      }
    } catch (error) {
      console.error('Failed to load videos:', error);
    }
  }, [selectedVideo]);

  const loadOffset = useCallback(async (videoId: string) => {
    const client = streamClientRef.current;
    if (!client) return;

    const offset = await client.getOffset(videoId);
    setSubtitleOffset(offset);
    setSavedOffset(offset);
    alignerRef.current.setOffset(offset);
  }, []);

  const connectToStream = async () => {
    if (!selectedVideo) return;

    setIsLoading(true);

    try {
      const client = streamClientRef.current!;
      await client.connect(selectedVideo);
      await loadOffset(selectedVideo);
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect:', error);
      alert('连接失败，请检查后端服务是否已启动');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectFromStream = async () => {
    const client = streamClientRef.current;
    if (client) {
      await client.disconnect();
    }

    if (videoWorkerRef.current) {
      videoWorkerRef.current.postMessage({ type: 'reset' });
    }

    alignerRef.current.clear();
    setIsConnected(false);
    setActiveSubtitle(null);
    setCurrentPts(0);
  };

  const handleOffsetChange = (value: number) => {
    const clampedValue = Math.max(MIN_OFFSET_MS, Math.min(MAX_OFFSET_MS, value));
    setSubtitleOffset(clampedValue);
    alignerRef.current.setOffset(clampedValue);
  };

  const saveOffset = async () => {
    const client = streamClientRef.current;
    if (!client || !selectedVideo) return;

    try {
      await client.saveOffset(selectedVideo, subtitleOffset);
      setSavedOffset(subtitleOffset);
      alert('字幕偏移已保存');
    } catch (error) {
      console.error('Failed to save offset:', error);
      alert('保存失败');
    }
  };

  const resetOffset = () => {
    setSubtitleOffset(0);
    alignerRef.current.setOffset(0);
  };

  const revertOffset = () => {
    setSubtitleOffset(savedOffset);
    alignerRef.current.setOffset(savedOffset);
  };

  const handleDriftEvent = (result: DriftDetectionResult) => {
    if (Math.abs(result.driftMs) > 80 && result.confidence > 0.5) {
      setPendingDrift(result);
      setShowDriftModal(true);
    }
  };

  const applyDriftCorrection = async () => {
    if (!pendingDrift || !selectedVideo) return;

    setIsApplyingDrift(true);

    try {
      const client = streamClientRef.current!;
      const currentOffset = alignerRef.current.getOffset();
      const newOffset = currentOffset + pendingDrift.driftMs;
      const clampedOffset = Math.max(MIN_OFFSET_MS, Math.min(MAX_OFFSET_MS, newOffset));

      await client.saveOffset(selectedVideo, clampedOffset);

      handleOffsetChange(clampedOffset);
      setSavedOffset(clampedOffset);
      setShowDriftModal(false);
      setPendingDrift(null);

      console.log(`[App] Applied drift correction: ${pendingDrift.driftMs}ms -> new offset: ${clampedOffset}ms`);
    } catch (error) {
      console.error('Failed to apply drift correction:', error);
      alert('应用漂移校正失败');
    } finally {
      setIsApplyingDrift(false);
    }
  };

  const dismissDriftModal = () => {
    setShowDriftModal(false);
    setPendingDrift(null);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    streamClientRef.current = new StreamClient({
      apiBaseUrl: API_BASE_URL
    });

    const client = streamClientRef.current;

    const handleReliableStats = (stats: ReliableReceiverStats) => {
      setReliableStats({
        packetsReceived: stats.packetsReceived,
        packetsOrdered: stats.packetsOrdered,
        packetsOutOfOrder: stats.packetsOutOfOrder,
        duplicatePackets: stats.duplicatePackets,
        gapsDetected: stats.gapsDetected,
        sacksSent: stats.sacksSent,
        reorderBufferSize: stats.reorderBufferSize
      });
    };

    client.on('video', handleVideoChunk);
    client.on('subtitle', handleSubtitleChunk);
    client.on('drift', handleDriftEvent);
    client.on('reliable-stats', handleReliableStats);
    client.on('connected', () => {
      console.log('[App] Stream connected');
    });
    client.on('disconnected', () => {
      console.log('[App] Stream disconnected');
      setIsConnected(false);
    });
    client.on('error', (error) => {
      console.error('[App] Stream error:', error);
    });

    initializeWorker();
    loadVideos();

    if (canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d');
    }

    return () => {
      client.off('video', handleVideoChunk);
      client.off('subtitle', handleSubtitleChunk);
      client.off('drift', handleDriftEvent);
      client.off('reliable-stats', handleReliableStats);
      disconnectFromStream();

      if (videoWorkerRef.current) {
        videoWorkerRef.current.terminate();
        videoWorkerRef.current = null;
      }
    };
  }, [initializeWorker, loadVideos]);

  useEffect(() => {
    if (selectedVideo && !isConnected) {
      loadOffset(selectedVideo);
    }
  }, [selectedVideo, isConnected, loadOffset]);

  const hasUnsavedChanges = subtitleOffset !== savedOffset;

  return (
    <div className="app">
      <header className="header">
        <h1>WebTransport H.264 视频流播放器</h1>
        <p>
          实时视频流播放 · WebCodecs 硬解码 · 字幕时间戳校准（精度 ±10ms）
        </p>
      </header>

      <div className="video-container">
        <canvas ref={canvasRef} className="video-canvas" />

        {activeSubtitle && (
          <div className="subtitle-overlay">{activeSubtitle.text}</div>
        )}

        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>正在连接...</span>
          </div>
        )}

        {!isConnected && !isLoading && videos.length === 0 && (
          <div className="no-video">
            <div className="no-video-icon">📼</div>
            <div className="no-video-text">
              请将 MP4 视频文件放入后端 videos 目录
            </div>
          </div>
        )}

        {isConnected && (
          <div className="video-controls">
            <div className="time-display">{formatTime(currentPts)}</div>
          </div>
        )}
      </div>

      <div className="controls-panel">
        <h2>播放控制</h2>

        <div className="video-selector">
          <select
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            disabled={isConnected || isLoading}
          >
            {videos.length === 0 ? (
              <option value="">无可用视频</option>
            ) : (
              videos.map((video) => (
                <option key={video} value={video}>
                  {video}
                </option>
              ))
            )}
          </select>

          {!isConnected ? (
            <button
              onClick={connectToStream}
              disabled={!selectedVideo || isLoading}
            >
              开始播放
            </button>
          ) : (
            <button onClick={disconnectFromStream}>停止播放</button>
          )}
        </div>

        <div className="status-bar">
          <div className="status-item">
            <div
              className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}
            />
            <span className="status-text">
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>

          <div className="status-item">
            <span className="status-text">
              当前 PTS: {formatTime(currentPts)}
            </span>
          </div>
        </div>

        <div className="offset-controls">
          <div className="offset-header">
            <h3>字幕时间戳校准</h3>
            <div className="offset-value">
              {subtitleOffset > 0 ? '+' : ''}
              {subtitleOffset} ms
            </div>
          </div>

          <div className="slider-container">
            <input
              type="range"
              min={MIN_OFFSET_MS}
              max={MAX_OFFSET_MS}
              step={OFFSET_STEP_MS}
              value={subtitleOffset}
              onChange={(e) => handleOffsetChange(parseInt(e.target.value, 10))}
              disabled={!isConnected}
            />
            <div className="slider-labels">
              <span>{MIN_OFFSET_MS}ms (字幕更早)</span>
              <span>0ms</span>
              <span>{MAX_OFFSET_MS}ms (字幕更晚)</span>
            </div>
          </div>

          <div className="offset-actions">
            <button onClick={resetOffset} disabled={subtitleOffset === 0}>
              归零
            </button>
            <button
              onClick={revertOffset}
              disabled={!hasUnsavedChanges}
            >
              撤销
            </button>
            <button
              onClick={saveOffset}
              disabled={!hasUnsavedChanges || !isConnected}
              className="primary"
            >
              保存到数据库
            </button>
          </div>
        </div>
      </div>

      <div className="stats-panel">
        <h2>视频统计</h2>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">已解码帧数</div>
            <div className="stat-value">{stats.framesDecoded}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">已渲染帧数</div>
            <div className="stat-value">{stats.framesRendered}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">丢弃帧数</div>
            <div className="stat-value">{stats.framesDropped}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">接收视频数据</div>
            <div className="stat-value">
              {(stats.videoBytesReceived / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">接收字幕数</div>
            <div className="stat-value">{stats.subtitlesReceived}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">字幕偏移</div>
            <div className="stat-value">
              {subtitleOffset > 0 ? '+' : ''}{subtitleOffset}ms
            </div>
          </div>
        </div>
      </div>

      {isConnected && (
        <div className="stats-panel">
          <h2>可靠传输统计 (SACK + 重传)</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">接收字幕包</div>
              <div className="stat-value">{reliableStats.packetsReceived}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">有序交付</div>
              <div className="stat-value">{reliableStats.packetsOrdered}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">乱序到达</div>
              <div className="stat-value" style={{ color: '#f59e0b' }}>
                {reliableStats.packetsOutOfOrder}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">重复包</div>
              <div className="stat-value" style={{ color: '#3b82f6' }}>
                {reliableStats.duplicatePackets}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">检测丢包</div>
              <div className="stat-value" style={{ color: '#ef4444' }}>
                {reliableStats.gapsDetected}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">发送 SACK</div>
              <div className="stat-value" style={{ color: '#10b981' }}>
                {reliableStats.sacksSent}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">重排序缓冲区</div>
              <div className="stat-value">
                {reliableStats.reorderBufferSize}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
