import React, { useState, useMemo, useCallback } from 'react'
import DeckGL from '@deck.gl/react'
import { Map } from 'react-map-gl/maplibre'
import { ArcLayer, ScatterplotLayer } from '@deck.gl/layers'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const CHINA_CENTER = [104.0, 35.0]
const CHINA_ZOOM = 4

const ANOMALY_COLORS = {
  critical: [255, 0, 0],
  high: [255, 140, 0],
  medium: [255, 220, 0],
  low: [0, 200, 255],
  normal: [100, 150, 200],
}

function getAnomalyColor(level, alpha = 255) {
  const base = ANOMALY_COLORS[level] || ANOMALY_COLORS.normal
  return [...base, alpha]
}

function SpatioTemporalMap({ 
  flows = [], 
  warehouses = [],
  onLassoSelect,
  showNormalFlows = false,
  minAnomalyScore = 0.5,
}) {
  const [viewState, setViewState] = useState({
    longitude: CHINA_CENTER[0],
    latitude: CHINA_CENTER[1],
    zoom: CHINA_ZOOM,
    pitch: 30,
    bearing: 0,
  })

  const [selectedRegion, setSelectedRegion] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [lassoPoints, setLassoPoints] = useState([])

  const filteredFlows = useMemo(() => {
    return flows.filter(f => 
      f.anomaly_score >= minAnomalyScore || (showNormalFlows && f.anomaly_score === 0)
    )
  }, [flows, minAnomalyScore, showNormalFlows])

  const flowData = useMemo(() => {
    return filteredFlows.map(flow => ({
      ...flow,
      sourcePosition: flow.origin_coords,
      targetPosition: flow.destination_coords,
      width: Math.max(0.5, Math.min(10, flow.weight / 5 + flow.anomaly_score * 2)),
    }))
  }, [filteredFlows])

  const warehouseData = useMemo(() => {
    const whMap = new Map()
    filteredFlows.forEach(f => {
      if (!whMap.has(f.origin_id)) {
        whMap.set(f.origin_id, {
          position: f.origin_coords,
          name: f.origin_name,
          anomalyCount: 0,
          totalScore: 0,
        })
      }
      const origin = whMap.get(f.origin_id)
      origin.anomalyCount++
      origin.totalScore += f.anomaly_score

      if (!whMap.has(f.destination_id)) {
        whMap.set(f.destination_id, {
          position: f.destination_coords,
          name: f.destination_name,
          anomalyCount: 0,
          totalScore: 0,
        })
      }
      const dest = whMap.get(f.destination_id)
      dest.anomalyCount++
      dest.totalScore += f.anomaly_score
    })
    
    return Array.from(whMap.values()).map(wh => ({
      ...wh,
      avgScore: wh.anomalyCount > 0 ? wh.totalScore / wh.anomalyCount : 0,
    }))
  }, [filteredFlows])

  const layers = [
    new ArcLayer({
      id: 'anomaly-arcs',
      data: flowData,
      getSourcePosition: d => d.sourcePosition,
      getTargetPosition: d => d.targetPosition,
      getSourceColor: d => getAnomalyColor(d.anomaly_level, 200),
      getTargetColor: d => getAnomalyColor(d.anomaly_level, 180),
      getWidth: d => d.width,
      getHeight: 0.5,
      getTilt: 0,
      opacity: 0.8,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 0, 200],
    }),

    new ScatterplotLayer({
      id: 'warehouse-nodes',
      data: warehouseData,
      getPosition: d => d.position,
      getRadius: d => Math.max(5000, Math.min(50000, d.anomalyCount * 500)),
      getFillColor: d => {
        if (d.avgScore >= 3.0) return [255, 0, 0, 200]
        if (d.avgScore >= 1.5) return [255, 140, 0, 180]
        if (d.avgScore >= 0.8) return [255, 220, 0, 160]
        return [0, 200, 255, 120]
      },
      getLineColor: [255, 255, 255, 200],
      getLineWidth: 2,
      opacity: 0.9,
      pickable: true,
      radiusMinPixels: 8,
      radiusMaxPixels: 60,
      lineWidthMinPixels: 2,
    }),

    new ScatterplotLayer({
      id: 'warehouse-outer',
      data: warehouseData,
      getPosition: d => d.position,
      getRadius: d => Math.max(3000, d.anomalyCount * 200),
      getFillColor: [255, 255, 255, 50],
      opacity: 0.5,
      pickable: false,
      radiusMinPixels: 15,
      radiusMaxPixels: 80,
    }),
  ]

  const handlePointerMove = useCallback((event) => {
    if (isDrawing) {
      setLassoPoints(prev => [...prev, event.coordinate])
    }
  }, [isDrawing])

  const handleClick = useCallback((event) => {
    if (!isDrawing && lassoPoints.length === 0) return
    
    if (isDrawing) {
      setIsDrawing(false)
      
      if (lassoPoints.length > 2) {
        const xs = lassoPoints.map(p => p[0])
        const ys = lassoPoints.map(p => p[1])
        const bbox = {
          min_lng: Math.min(...xs),
          max_lng: Math.max(...xs),
          min_lat: Math.min(...ys),
          max_lat: Math.max(...ys),
        }
        setSelectedRegion(bbox)
        
        if (onLassoSelect) {
          onLassoSelect({
            bbox,
            polygon: lassoPoints,
          })
        }
      }
      setLassoPoints([])
    }
  }, [isDrawing, lassoPoints, onLassoSelect])

  const handleDoubleClick = useCallback((event) => {
    event.stopPropagation()
    setIsDrawing(true)
    setLassoPoints([])
  }, [])

  const handleContextMenu = useCallback((event) => {
    event.preventDefault()
    setIsDrawing(false)
    setLassoPoints([])
    setSelectedRegion(null)
  }, [])

  const tooltip = ({ object }) => {
    if (!object) return null
    
    if (object.sourcePosition) {
      return (
        <div style={{
          background: 'rgba(0, 0, 0, 0.85)',
          padding: '12px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '12px',
          maxWidth: '300px',
        }}>
          <div><strong>订单号:</strong> {object.order_number}</div>
          <div><strong>起点:</strong> {object.origin_name}</div>
          <div><strong>终点:</strong> {object.destination_name}</div>
          <div><strong>重量:</strong> {object.weight?.toFixed(1)} 吨</div>
          <div><strong>异常评分:</strong> {object.anomaly_score?.toFixed(2)}</div>
          <div><strong>等级:</strong> {object.anomaly_level}</div>
          {object.anomaly_type && <div><strong>类型:</strong> {object.anomaly_type}</div>}
        </div>
      )
    }
    
    return (
      <div style={{
        background: 'rgba(0, 0, 0, 0.85)',
        padding: '12px',
        borderRadius: '8px',
        color: 'white',
        fontSize: '12px',
      }}>
        <div><strong>{object.name}</strong></div>
        <div>异常订单数: {object.anomalyCount}</div>
        <div>平均异常分: {object.avgScore?.toFixed(2)}</div>
      </div>
    )
  }

  const mapStyle = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0a1628' },
      },
    ],
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        initialViewState={viewState}
        controller={{
          type: 'map',
          doubleClickZoom: false,
        }}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        layers={layers}
        getTooltip={tooltip}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <Map
          mapLibre={maplibregl}
          mapStyle={mapStyle}
          reuseMaps
        />
      </DeckGL>
      
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(10, 22, 40, 0.95)',
        padding: '16px',
        borderRadius: '12px',
        color: 'white',
        fontSize: '13px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
          异常等级
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { level: 'critical', label: '严重', color: '#ff0000' },
            { level: 'high', label: '高', color: '#ff8c00' },
            { level: 'medium', label: '中', color: '#ffdc00' },
            { level: 'low', label: '低', color: '#00c8ff' },
          ].map(item => (
            <div key={item.level} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '16px',
                height: '4px',
                background: item.color,
                borderRadius: '2px',
              }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ 
          marginTop: '12px', 
          paddingTop: '12px', 
          borderTop: '1px solid rgba(255,255,255,0.2)',
          fontSize: '11px',
          color: '#aaa',
        }}>
          <div>双击开始框选 / 单击结束</div>
          <div>右键取消选择</div>
        </div>
      </div>

      {isDrawing && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 140, 0, 0.9)',
          padding: '10px 20px',
          borderRadius: '8px',
          color: 'white',
          fontWeight: 'bold',
        }}>
          正在进行 Lasso 选择... 单击结束
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(10, 22, 40, 0.95)',
        padding: '12px 16px',
        borderRadius: '8px',
        color: 'white',
        fontSize: '13px',
      }}>
        <div>异常流: <strong>{filteredFlows.length}</strong></div>
        <div>异常节点: <strong>{warehouseData.length}</strong></div>
      </div>
    </div>
  )
}

export default SpatioTemporalMap
