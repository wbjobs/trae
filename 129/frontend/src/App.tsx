import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { H3HexagonLayer, TextLayer } from '@deck.gl/geo-layers';
import { StaticMap } from 'react-map-gl';
import * as h3 from 'h3-js';

import {
  fetchAggregation,
  fetchDrillDown,
  fetchStats,
  fetch24hAggregation,
  clearCache,
  reloadData
} from './api';
import {
  HexagonData,
  AggregationResponse,
  StatsResponse,
  ColorMode,
  ViewState,
  Batch24hResponse,
  HourlyData
} from './types';
import { getCountColor, getSpeedColor, formatNumber } from './utils';

const MAPBOX_ACCESS_TOKEN = '';

const INITIAL_VIEW_STATE: ViewState = {
  longitude: 121.4737,
  latitude: 31.2304,
  zoom: 11,
  pitch: 30,
  bearing: 0,
};

const MIN_RESOLUTION = 6;
const MAX_RESOLUTION = 10;
const DEFAULT_RESOLUTION = 8;

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

const HOURS_PER_DAY = 24;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const smootherstep = (t: number): number => smoothstep(smoothstep(smoothstep(t)));

const App: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW_STATE);
  const [hexagons, setHexagons] = useState<HexagonData[]>([]);
  const [resolution, setResolution] = useState<number>(DEFAULT_RESOLUTION);
  const [colorMode, setColorMode] = useState<ColorMode>('count');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [aggInfo, setAggInfo] = useState<{
    processingTime: number;
    cacheHit: boolean;
    totalPoints: number;
  } | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexagonData | null>(null);
  const [drillHistory, setDrillHistory] = useState<HexagonData[]>([]);
  const [elevationScale, setElevationScale] = useState<number>(10);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(8);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [hourlyData, setHourlyData] = useState<Record<number, HourlyData> | null>(null);
  const [animationMode, setAnimationMode] = useState<boolean>(false);
  const [hourlyStats, setHourlyStats] = useState<Record<number, {
    minCount: number;
    maxCount: number;
    minSpeed: number;
    maxSpeed: number;
  }>>({});

  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(8);
  const hourlyDataRef = useRef<Record<number, HourlyData> | null>(null);
  const playbackSpeedRef = useRef<number>(1);
  const isPlayingRef = useRef<boolean>(false);
  const resolutionRef = useRef<number>(DEFAULT_RESOLUTION);

  const MIN_RENDER_INTERVAL = 33;

  useEffect(() => {
    loadStats();
    loadHexagons(DEFAULT_RESOLUTION);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { hourlyDataRef.current = hourlyData; }, [hourlyData]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { resolutionRef.current = resolution; }, [resolution]);

  const loadStats = async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const getBbox = useCallback((): number[] | undefined => {
    if (viewState.zoom < 3) return undefined;

    const centerLng = viewState.longitude;
    const centerLat = viewState.latitude;
    const zoom = viewState.zoom;

    const degreesPerPixel = Math.cos(centerLat * Math.PI / 180) * 360 / (256 * Math.pow(2, zoom));
    const halfWidth = (window.innerWidth / 2) * degreesPerPixel * 1.5;
    const halfHeight = (window.innerHeight / 2) * degreesPerPixel * 1.5;

    return [
      centerLng - halfWidth,
      centerLat - halfHeight,
      centerLng + halfWidth,
      centerLat + halfHeight,
    ];
  }, [viewState]);

  const loadHexagons = useCallback(async (
    targetResolution: number,
    parentHex?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const bbox = getBbox();
      const response: AggregationResponse = parentHex
        ? await fetchDrillDown(parentHex, targetResolution, bbox)
        : await fetchAggregation(targetResolution, bbox, parentHex);

      setHexagons(response.hexagons);
      setAggInfo({
        processingTime: response.processing_time_ms,
        cacheHit: response.cache_hit,
        totalPoints: response.total_points,
      });
      setResolution(targetResolution);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Failed to load hexagons:', err);
    } finally {
      setLoading(false);
    }
  }, [getBbox]);

  const renderTimeFrame = useCallback((time: number, force: boolean = false) => {
    const data = hourlyDataRef.current;
    if (!data) return;

    if (!force) {
      const now = performance.now();
      if (now - lastRenderTimeRef.current < MIN_RENDER_INTERVAL) return;
      lastRenderTimeRef.current = now;
    }

    const hour = Math.floor(time);
    const minute = (time - hour) * 60;
    const nextHour = (hour + 1) % HOURS_PER_DAY;
    const rawFraction = minute / 60;
    const smoothFrac = smootherstep(rawFraction);

    const currentHourData = data[hour]?.hexagons || [];
    const nextHourData = data[nextHour]?.hexagons || [];

    const res = resolutionRef.current;

    if (smoothFrac === 0 || currentHourData.length === 0 || nextHourData.length === 0) {
      setHexagons(currentHourData);
      setAggInfo(prev => prev ? {
        ...prev,
        totalPoints: data[hour]?.total_points || 0,
      } : {
        processingTime: 0,
        cacheHit: false,
        totalPoints: data[hour]?.total_points || 0,
      });
      return;
    }

    const startMap = new Map(currentHourData.map(h => [h.hex_id, h]));
    const endMap = new Map(nextHourData.map(h => [h.hex_id, h]));

    const allHexIds = new Set([...startMap.keys(), ...endMap.keys()]);

    const interpolated: HexagonData[] = [];
    let totalPoints = 0;
    const oneMinusFrac = 1 - smoothFrac;

    for (const hexId of allHexIds) {
      const startData = startMap.get(hexId);
      const endData = endMap.get(hexId);

      const startCount = startData?.count || 0;
      const endCount = endData?.count || 0;
      const count = Math.round(startCount * oneMinusFrac + endCount * smoothFrac);

      if (count === 0) continue;

      let avgSpeed: number;
      if (startData && endData) {
        avgSpeed = startData.avg_speed * oneMinusFrac + endData.avg_speed * smoothFrac;
      } else if (startData) {
        avgSpeed = startData.avg_speed;
      } else {
        avgSpeed = endData!.avg_speed;
      }

      interpolated.push({
        hex_id: hexId,
        count,
        avg_speed: Math.round(avgSpeed * 100) / 100,
        resolution: res,
      });

      totalPoints += count;
    }

    setHexagons(interpolated);
    setAggInfo(prev => prev ? {
      ...prev,
      totalPoints,
    } : {
      processingTime: 0,
      cacheHit: false,
      totalPoints,
    });
  }, []);

  const animationLoop = useCallback((now: number) => {
    if (!isPlayingRef.current) return;

    const delta = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    const speed = playbackSpeedRef.current;
    const timeIncrement = delta * speed * 2;

    let newTime = currentTimeRef.current + timeIncrement;
    if (newTime >= HOURS_PER_DAY) newTime -= HOURS_PER_DAY;
    if (newTime < 0) newTime += HOURS_PER_DAY;

    currentTimeRef.current = newTime;

    setCurrentTime(newTime);
    renderTimeFrame(newTime);

    rafRef.current = requestAnimationFrame(animationLoop);
  }, [renderTimeFrame]);

  const load24hData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const bbox = getBbox();
      const response: Batch24hResponse = await fetch24hAggregation(resolution, bbox);

      setHourlyData(response.hourly_data);
      hourlyDataRef.current = response.hourly_data;

      const newHourlyStats: Record<number, {
        minCount: number;
        maxCount: number;
        minSpeed: number;
        maxSpeed: number;
      }> = {};

      Object.entries(response.hourly_data).forEach(([hour, data]) => {
        if (data.hexagons.length > 0) {
          const counts = data.hexagons.map(h => h.count);
          const speeds = data.hexagons.map(h => h.avg_speed);
          newHourlyStats[parseInt(hour)] = {
            minCount: Math.min(...counts),
            maxCount: Math.max(...counts),
            minSpeed: Math.min(...speeds),
            maxSpeed: Math.max(...speeds),
          };
        }
      });

      setHourlyStats(newHourlyStats);

      lastRenderTimeRef.current = 0;
      renderTimeFrame(currentTimeRef.current, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load 24h data');
      console.error('Failed to load 24h data:', err);
    } finally {
      setLoading(false);
    }
  }, [getBbox, resolution, renderTimeFrame]);

  const handleTimeChange = useCallback((time: number) => {
    currentTimeRef.current = time;
    setCurrentTime(time);
    lastRenderTimeRef.current = 0;
    renderTimeFrame(time, true);
  }, [renderTimeFrame]);

  const startPlayback = useCallback(() => {
    if (rafRef.current !== null) return;
    lastFrameTimeRef.current = performance.now();
    isPlayingRef.current = true;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(animationLoop);
  }, [animationLoop]);

  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [startPlayback, stopPlayback]);

  const handleResolutionChange = useCallback((newResolution: number) => {
    if (newResolution >= MIN_RESOLUTION && newResolution <= MAX_RESOLUTION) {
      if (animationMode) {
        setResolution(newResolution);
        resolutionRef.current = newResolution;
        lastRenderTimeRef.current = 0;
        load24hData();
      } else {
        if (newResolution > resolution && selectedHex) {
          loadHexagons(newResolution, selectedHex.hex_id);
        } else {
          setSelectedHex(null);
          setDrillHistory([]);
          loadHexagons(newResolution);
        }
      }
    }
  }, [resolution, selectedHex, loadHexagons, load24hData, animationMode]);

  const handleDrillDown = useCallback((hex: HexagonData) => {
    if (animationMode) return;

    if (resolution < MAX_RESOLUTION) {
      setDrillHistory(prev => [...prev, hex]);
      setSelectedHex(hex);
      loadHexagons(resolution + 1, hex.hex_id);

      const center = h3.h3ToGeo(hex.hex_id);
      setViewState(prev => ({
        ...prev,
        longitude: center[1],
        latitude: center[0],
        zoom: prev.zoom + 1.5,
      }));
    }
  }, [resolution, loadHexagons, animationMode]);

  const handleRollUp = useCallback(() => {
    if (animationMode) return;

    if (drillHistory.length > 0) {
      const newHistory = [...drillHistory];
      const previousHex = newHistory.pop();
      setDrillHistory(newHistory);
      setSelectedHex(newHistory.length > 0 ? newHistory[newHistory.length - 1] : null);

      if (resolution > MIN_RESOLUTION) {
        if (previousHex) {
          const center = h3.h3ToGeo(previousHex.hex_id);
          setViewState(prev => ({
            ...prev,
            longitude: center[1],
            latitude: center[0],
            zoom: prev.zoom - 1.5,
          }));
        }
        loadHexagons(resolution - 1, newHistory.length > 0 ? newHistory[newHistory.length - 1].hex_id : undefined);
      }
    } else if (resolution > MIN_RESOLUTION) {
      loadHexagons(resolution - 1);
    }
  }, [drillHistory, resolution, loadHexagons, animationMode]);

  const handleHexClick = useCallback((info: any) => {
    if (info.object && !animationMode) {
      handleDrillDown(info.object);
    }
  }, [handleDrillDown, animationMode]);

  const toggleAnimationMode = useCallback(async () => {
    if (animationMode) {
      stopPlayback();
      setAnimationMode(false);
      setHourlyData(null);
      hourlyDataRef.current = null;
      loadHexagons(resolution);
    } else {
      setAnimationMode(true);
      setSelectedHex(null);
      setDrillHistory([]);
      await load24hData();
    }
  }, [animationMode, resolution, loadHexagons, load24hData, stopPlayback]);

  const handleClearCache = async () => {
    try {
      await clearCache();
      alert('缓存已清除');
      if (animationMode) {
        load24hData();
      } else {
        loadHexagons(resolution);
      }
    } catch (err) {
      alert('清除缓存失败');
    }
  };

  const handleReloadData = async () => {
    try {
      await reloadData();
      alert('数据已重新加载');
      loadStats();
      if (animationMode) {
        load24hData();
      } else {
        loadHexagons(resolution);
      }
    } catch (err) {
      alert('重新加载数据失败');
    }
  };

  const { minCount, maxCount, minSpeed, maxSpeed } = useMemo(() => {
    if (animationMode && hourlyStats) {
      let globalMinCount = Infinity;
      let globalMaxCount = 0;
      let globalMinSpeed = Infinity;
      let globalMaxSpeed = 0;

      Object.values(hourlyStats).forEach(s => {
        if (s.minCount < globalMinCount) globalMinCount = s.minCount;
        if (s.maxCount > globalMaxCount) globalMaxCount = s.maxCount;
        if (s.minSpeed < globalMinSpeed) globalMinSpeed = s.minSpeed;
        if (s.maxSpeed > globalMaxSpeed) globalMaxSpeed = s.maxSpeed;
      });

      return {
        minCount: globalMinCount === Infinity ? 0 : globalMinCount,
        maxCount: globalMaxCount === 0 ? 1 : globalMaxCount,
        minSpeed: globalMinSpeed === Infinity ? 0 : globalMinSpeed,
        maxSpeed: globalMaxSpeed === 0 ? 1 : globalMaxSpeed,
      };
    }

    if (hexagons.length === 0) {
      return { minCount: 0, maxCount: 1, minSpeed: 0, maxSpeed: 1 };
    }

    const counts = hexagons.map(h => h.count);
    const speeds = hexagons.map(h => h.avg_speed);

    return {
      minCount: Math.min(...counts),
      maxCount: Math.max(...counts),
      minSpeed: Math.min(...speeds),
      maxSpeed: Math.max(...speeds),
    };
  }, [hexagons, animationMode, hourlyStats]);

  const layers = useMemo(() => {
    const hexLayer = new H3HexagonLayer<HexagonData>({
      id: 'h3-hexagons',
      data: hexagons,
      pickable: !animationMode,
      extruded: true,
      wireframe: false,
      filled: true,
      stroked: true,
      lineWidthMinPixels: 1,
      lineColor: [255, 255, 255, 100],
      getHexagon: d => d.hex_id,
      getFillColor: d => colorMode === 'count'
        ? getCountColor(d.count, minCount, maxCount)
        : getSpeedColor(d.avg_speed, minSpeed, maxSpeed),
      getElevation: d => Math.sqrt(d.count) * elevationScale,
      elevationScale: 1,
      updateTriggers: {
        getFillColor: [colorMode, minCount, maxCount, minSpeed, maxSpeed],
        getElevation: [elevationScale],
      },
      onClick: handleHexClick,
      autoHighlight: !animationMode,
      highlightColor: [255, 255, 0, 200],
      opacity: animationMode ? 0.9 : 1,
      transitions: animationMode ? {
        getFillColor: 150,
        getElevation: 150,
      } : {
        getFillColor: 300,
        getElevation: 300,
      },
    });

    const textLayer = showLabels && hexagons.length > 0 && hexagons.length < 500 && !animationMode
      ? new TextLayer<HexagonData>({
          id: 'hex-labels',
          data: hexagons,
          getPosition: d => {
            const [lat, lng] = h3.h3ToGeo(d.hex_id);
            return [lng, lat, Math.sqrt(d.count) * elevationScale + 10];
          },
          getText: d => `${formatNumber(d.count)}\n${d.avg_speed.toFixed(1)}km/h`,
          getSize: 12,
          getColor: [0, 0, 0, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          getPixelOffset: [0, 0],
          sizeScale: 1,
          sizeUnits: 'meters',
          sizeMinPixels: 10,
          sizeMaxPixels: 24,
          updateTriggers: {
            getPosition: [elevationScale],
          },
        })
      : null;

    return textLayer ? [hexLayer, textLayer] : [hexLayer];
  }, [hexagons, colorMode, minCount, maxCount, minSpeed, maxSpeed, elevationScale, showLabels, handleHexClick, animationMode]);

  const formatTime = (time: number) => {
    const hour = Math.floor(time);
    const minute = Math.floor((time - hour) * 60);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const getTimeLabel = (time: number) => {
    const hour = Math.floor(time);
    if (hour >= 6 && hour < 12) return '🌅 上午';
    if (hour >= 12 && hour < 14) return '☀️ 中午';
    if (hour >= 14 && hour < 18) return '🌇 下午';
    if (hour >= 18 && hour < 22) return '🌆 傍晚';
    if (hour >= 22 || hour < 6) return '🌙 夜间';
    return '🌅 清晨';
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        initialViewState={viewState}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState }) => setViewState(viewState as ViewState)}
      >
        {MAPBOX_ACCESS_TOKEN ? (
          <StaticMap
            mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
            mapStyle="mapbox://styles/mapbox/dark-v10"
          />
        ) : (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          }} />
        )}
      </DeckGL>

      {animationMode && (
        <div style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '16px 24px',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          minWidth: 500,
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>
                {currentTime >= 6 && currentTime < 18 ? '☀️' : '🌙'}
              </span>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>
                  {formatTime(currentTime)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {getTimeLabel(currentTime)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {SPEED_OPTIONS.map(speed => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  style={{
                    padding: '6px 12px',
                    background: playbackSpeed === speed ? '#339af0' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: playbackSpeed === speed ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={togglePlay}
              style={{
                padding: '10px 20px',
                background: isPlaying ? '#ff6b6b' : '#51cf66',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {isPlaying ? '⏸ 暂停' : '▶ 播放'}
            </button>

            <div style={{ flex: 1 }}>
              <input
                type="range"
                min={0}
                max={23.99}
                step={0.01}
                value={currentTime}
                onChange={(e) => handleTimeChange(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.5, marginTop: 4 }}>
                {[0, 6, 8, 12, 17, 18, 22].map(h => (
                  <span key={h}>{h}:00</span>
                ))}
              </div>
            </div>

            <button
              onClick={toggleAnimationMode}
              style={{
                padding: '10px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                transition: 'all 0.2s',
              }}
            >
              退出动画
            </button>
          </div>

          {hourlyData && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(24, 1fr)',
              gap: 2,
              marginTop: 12,
              height: 24,
            }}>
              {Array.from({ length: 24 }, (_, h) => {
                const data = hourlyData[h];
                const intensity = data ? Math.min(1, data.total_points / (stats?.total_points || 1) * 24) : 0;
                return (
                  <div
                    key={h}
                    onClick={() => handleTimeChange(h)}
                    style={{
                      background: `rgba(77, 171, 247, ${0.1 + intensity * 0.9})`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: h === Math.floor(currentTime) ? '2px solid white' : 'none',
                      transition: 'all 0.2s',
                    }}
                    title={`${h}:00 - ${data?.total_points || 0} points`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: animationMode ? 150 : 16,
        left: 16,
        background: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        padding: '20px 24px',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        minWidth: 320,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 50,
      }}>
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
          🚕 H3 地理空间聚类可视化
        </h2>

        {!animationMode && (
          <button
            onClick={toggleAnimationMode}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: loading ? '#495057' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              transition: 'all 0.2s',
            }}
          >
            🎬 开启时空动画模式
          </button>
        )}

        {stats && (
          <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.9 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <span>总数据点:</span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatNumber(stats.total_points)}</span>
              <span>速度范围:</span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>
                {stats.speed_min.toFixed(1)} - {stats.speed_max.toFixed(1)} km/h
              </span>
              <span>平均速度:</span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>{stats.speed_avg.toFixed(1)} km/h</span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>H3 分辨率</label>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#4dabf7' }}>
              Res {resolution}
            </span>
          </div>
          <input
            type="range"
            min={MIN_RESOLUTION}
            max={MAX_RESOLUTION}
            value={resolution}
            onChange={(e) => handleResolutionChange(parseInt(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            <span>Res 6 (粗)</span>
            <span>Res 10 (细)</span>
          </div>
        </div>

        {!animationMode && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={handleRollUp}
                disabled={resolution <= MIN_RESOLUTION && drillHistory.length === 0}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: resolution > MIN_RESOLUTION || drillHistory.length > 0 ? '#339af0' : '#495057',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: resolution > MIN_RESOLUTION || drillHistory.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                ↑ 上卷 (Res {resolution - 1})
              </button>
              <button
                onClick={() => selectedHex && handleDrillDown(selectedHex)}
                disabled={resolution >= MAX_RESOLUTION || !selectedHex}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: resolution < MAX_RESOLUTION && selectedHex ? '#339af0' : '#495057',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: resolution < MAX_RESOLUTION && selectedHex ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                ↓ 下钻 (Res {resolution + 1})
              </button>
            </div>

            {drillHistory.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(77, 171, 247, 0.1)', borderRadius: 8, border: '1px solid rgba(77, 171, 247, 0.3)' }}>
                <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.8 }}>下钻路径:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                  <span
                    onClick={() => {
                      setDrillHistory([]);
                      setSelectedHex(null);
                      loadHexagons(DEFAULT_RESOLUTION);
                    }}
                    style={{
                      padding: '4px 8px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    全局
                  </span>
                  {drillHistory.map((h, i) => (
                    <span
                      key={h.hex_id}
                      onClick={() => {
                        const newHistory = drillHistory.slice(0, i + 1);
                        setDrillHistory(newHistory);
                        setSelectedHex(h);
                        loadHexagons(h.resolution, i > 0 ? drillHistory[i - 1].hex_id : undefined);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: i === drillHistory.length - 1 ? '#339af0' : 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      Res {h.resolution}: {formatNumber(h.count)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>着色模式</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setColorMode('count')}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: colorMode === 'count' ? '#339af0' : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              📊 点数量
            </button>
            <button
              onClick={() => setColorMode('speed')}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: colorMode === 'speed' ? '#339af0' : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              🚀 平均速度
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>高度缩放</label>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{elevationScale}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={elevationScale}
            onChange={(e) => setElevationScale(parseInt(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>显示标签</label>
          <button
            onClick={() => setShowLabels(!showLabels)}
            style={{
              width: 48,
              height: 24,
              background: showLabels ? '#339af0' : '#495057',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.2s',
            }}
          >
            <div style={{
              position: 'absolute',
              top: 2,
              left: showLabels ? 26 : 2,
              width: 20,
              height: 20,
              background: 'white',
              borderRadius: 10,
              transition: 'all 0.2s',
            }} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleClearCache}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              transition: 'all 0.2s',
            }}
          >
            清除缓存
          </button>
          <button
            onClick={handleReloadData}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              transition: 'all 0.2s',
            }}
          >
            重新加载
          </button>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        top: animationMode ? 150 : 16,
        right: 16,
        background: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        padding: '16px 20px',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        minWidth: 280,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 50,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {animationMode ? '⏱ 时空动画' : '📊 聚合信息'}
        </div>

        {animationMode ? (
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>当前时间:</span>
              <span style={{ fontWeight: 600, color: '#4dabf7' }}>{formatTime(currentTime)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>时段:</span>
              <span style={{ fontWeight: 600 }}>{getTimeLabel(currentTime)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>播放速度:</span>
              <span style={{ fontWeight: 600 }}>{playbackSpeed}x</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>播放状态:</span>
              <span style={{ fontWeight: 600, color: isPlaying ? '#51cf66' : '#ff6b6b' }}>
                {isPlaying ? '播放中' : '已暂停'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>数据小时:</span>
              <span style={{ fontWeight: 600 }}>
                {hourlyData ? Object.keys(hourlyData).length : 0}/24
              </span>
            </div>
          </div>
        ) : (
          aggInfo ? (
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>六边形数量:</span>
                <span style={{ fontWeight: 600 }}>{hexagons.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>总数据点:</span>
                <span style={{ fontWeight: 600 }}>{formatNumber(aggInfo.totalPoints)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>当前分辨率:</span>
                <span style={{ fontWeight: 600, color: '#4dabf7' }}>H3 Res {resolution}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>处理时间:</span>
                <span style={{ fontWeight: 600 }}>{aggInfo.processingTime.toFixed(1)} ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>缓存命中:</span>
                <span style={{
                  fontWeight: 600,
                  color: aggInfo.cacheHit ? '#51cf66' : '#ff922b'
                }}>
                  {aggInfo.cacheHit ? '是 ✓' : '否 ✗'}
                </span>
              </div>
              {loading && (
                <div style={{ marginTop: 8, color: '#4dabf7', textAlign: 'center' }}>
                  ⏳ 加载中...
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center' }}>
              加载中...
            </div>
          )
        )}

        {selectedHex && !animationMode && (
          <div style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#4dabf7' }}>
              选中六边形
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
              {selectedHex.hex_id}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>点数量:</span>
                <span style={{ fontWeight: 600 }}>{formatNumber(selectedHex.count)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7 }}>平均速度:</span>
                <span style={{ fontWeight: 600 }}>{selectedHex.avg_speed.toFixed(1)} km/h</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 12,
            padding: 10,
            background: 'rgba(255, 77, 79, 0.1)',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            borderRadius: 6,
            fontSize: 11,
            color: '#ff6b6b',
          }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        padding: '16px 20px',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 50,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
          {colorMode === 'count' ? '📊 点数量图例' : '🚀 平均速度图例 (km/h)'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(colorMode === 'count' ? [
            [158, 1, 66], [213, 62, 79], [244, 109, 67], [253, 174, 97],
            [254, 224, 139], [230, 245, 152], [171, 221, 164], [102, 194, 165],
            [50, 136, 189], [94, 79, 162],
          ] : [
            [215, 25, 28], [253, 174, 97], [255, 255, 191], [171, 221, 164], [43, 131, 186],
          ]).map((color, i) => (
            <div
              key={i}
              style={{
                width: 28,
                height: 16,
                background: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.7, marginTop: 6 }}>
          <span>{colorMode === 'count' ? formatNumber(minCount) : minSpeed.toFixed(0)}</span>
          <span>{colorMode === 'count' ? formatNumber(maxCount) : maxSpeed.toFixed(0)}</span>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px 14px',
        borderRadius: 8,
        fontSize: 11,
        opacity: 0.8,
        maxWidth: 280,
        zIndex: 50,
      }}>
        {animationMode ? (
          <>💡 <strong>动画提示:</strong> 拖动时间轴或点击小时条跳转到指定时间，播放按钮控制动画播放</>
        ) : (
          <>💡 <strong>操作提示:</strong> 点击六边形进行下钻，使用滑块或按钮调整分辨率，或开启时空动画模式</>
        )}
      </div>
    </div>
  );
};

export default App;
