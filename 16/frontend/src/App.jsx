import React, { useState, useEffect, useCallback } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Slider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  LinearProgress,
  Drawer,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  PlayArrow,
  Refresh,
  BarChart,
  Layers,
  Settings,
  Close,
  DataObject,
} from '@mui/icons-material'

import SpatioTemporalMap from './components/SpatioTemporalMap.jsx'
import ParallelCoordinatesChart from './components/ParallelCoordinatesChart.jsx'
import TopKSubgraphPanel from './components/TopKSubgraphPanel.jsx'
import { warehousesAPI, anomaliesAPI } from './api.js'

function generateMockData() {
  const cities = [
    { id: 1, name: '北京', lat: 39.9042, lon: 116.4074, region: 'North' },
    { id: 2, name: '上海', lat: 31.2304, lon: 121.4737, region: 'East' },
    { id: 3, name: '广州', lat: 23.1291, lon: 113.2644, region: 'South' },
    { id: 4, name: '深圳', lat: 22.5431, lon: 114.0579, region: 'South' },
    { id: 5, name: '成都', lat: 30.5728, lon: 104.0668, region: 'West' },
    { id: 6, name: '武汉', lat: 30.5928, lon: 114.3055, region: 'Central' },
    { id: 7, name: '杭州', lat: 30.2741, lon: 120.1551, region: 'East' },
    { id: 8, name: '西安', lat: 34.3416, lon: 108.9398, region: 'Northwest' },
    { id: 9, name: '重庆', lat: 29.4316, lon: 106.9123, region: 'West' },
    { id: 10, name: '南京', lat: 32.0603, lon: 118.7969, region: 'East' },
  ]

  const flows = []
  const levels = ['low', 'medium', 'high', 'critical']
  const types = ['delay', 'early', 'extreme_weight', 'route_anomaly']

  for (let i = 0; i < 200; i++) {
    const originIdx = Math.floor(Math.random() * cities.length)
    let destIdx = Math.floor(Math.random() * cities.length)
    while (destIdx === originIdx) {
      destIdx = Math.floor(Math.random() * cities.length)
    }

    const levelIdx = Math.floor(Math.random() * 4)
    const origin = cities[originIdx]
    const dest = cities[destIdx]

    flows.push({
      order_id: i + 1,
      order_number: `ORD-MOCK-${10000 + i}`,
      origin_id: origin.id,
      destination_id: dest.id,
      origin_name: origin.name + ' Distribution Center',
      destination_name: dest.name + ' Distribution Center',
      origin_coords: [origin.lon, origin.lat],
      destination_coords: [dest.lon, dest.lat],
      origin_region: origin.region,
      destination_region: dest.region,
      weight: Math.random() * 40 + 1,
      anomaly_score: levelIdx * 1.2 + Math.random() * 0.5,
      anomaly_level: levels[levelIdx],
      anomaly_type: types[Math.floor(Math.random() * types.length)],
    })
  }

  const parallelData = flows.slice(0, 100).map(f => ({
    order_id: f.order_id,
    weight: f.weight,
    transit_hours: Math.random() * 48 + 6,
    expected_transit_hours: Math.random() * 30 + 4,
    anomaly_score: f.anomaly_score,
    distance_km: Math.random() * 2000 + 200,
    origin_region: f.origin_region,
    destination_region: f.destination_region,
    anomaly_level: f.anomaly_level,
  }))

  const subgraphs = [
    {
      rank: 1,
      nodes: [1, 2, 6, 10],
      edges: [
        { source: 1, target: 6 },
        { source: 6, target: 2 },
        { source: 2, target: 10 },
        { source: 10, target: 1 },
      ],
      anomaly_score: 3.8,
      size: 4,
      density: 0.33,
      dominant_anomaly: 'critical',
      distribution: { critical: 156, warning: 89, normal: 23 },
    },
    {
      rank: 2,
      nodes: [3, 4, 9],
      edges: [
        { source: 3, target: 4 },
        { source: 4, target: 9 },
        { source: 9, target: 3 },
      ],
      anomaly_score: 2.5,
      size: 3,
      density: 0.5,
      dominant_anomaly: 'warning',
      distribution: { critical: 45, warning: 178, normal: 67 },
    },
    {
      rank: 3,
      nodes: [5, 8, 6],
      edges: [
        { source: 5, target: 8 },
        { source: 8, target: 6 },
      ],
      anomaly_score: 1.8,
      size: 3,
      density: 0.33,
      dominant_anomaly: 'warning',
      distribution: { critical: 23, warning: 98, normal: 145 },
    },
  ]

  return { flows, parallelData, subgraphs, warehouses: cities }
}

function App() {
  const [flows, setFlows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [parallelData, setParallelData] = useState([])
  const [topKSubgraphs, setTopKSubgraphs] = useState([])
  const [minAnomalyScore, setMinAnomalyScore] = useState(0.5)
  const [showNormalFlows, setShowNormalFlows] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [selectedBbox, setSelectedBbox] = useState(null)
  const [useMockData, setUseMockData] = useState(true)
  const [error, setError] = useState(null)

  const loadInitialData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      if (useMockData) {
        const mock = generateMockData()
        setFlows(mock.flows)
        setWarehouses(mock.warehouses)
        setParallelData(mock.parallelData)
        setTopKSubgraphs(mock.subgraphs)
        setIsLoading(false)
        return
      }

      const [whResponse, flowResponse, subgraphResponse] = await Promise.all([
        warehousesAPI.getAll(),
        anomaliesAPI.getSpatioTemporalFlows({
          min_score: minAnomalyScore,
          limit: 3000,
          days: 30,
        }),
        anomaliesAPI.getTopKSubgraphs({ k: 5, days: 90 }),
      ])
      
      setWarehouses(whResponse.data || [])
      setFlows(flowResponse.data?.flows || [])
      setTopKSubgraphs(subgraphResponse.data?.subgraphs || [])

      if (flowResponse.data?.flows?.length > 0) {
        const pcResponse = await anomaliesAPI.getParallelCoords({ limit: 1000 })
        setParallelData(pcResponse.data?.data || [])
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('API连接失败，已切换到模拟数据')
      const mock = generateMockData()
      setFlows(mock.flows)
      setWarehouses(mock.warehouses)
      setParallelData(mock.parallelData)
      setTopKSubgraphs(mock.subgraphs)
      setUseMockData(true)
    } finally {
      setIsLoading(false)
    }
  }, [minAnomalyScore, useMockData])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const handleLassoSelect = useCallback(async (selection) => {
    setSelectedBbox(selection.bbox)
    
    if (useMockData) {
      const bbox = selection.bbox
      const filtered = parallelData.filter(d => {
        const cities = {
          'North': { lat: 39.9, lon: 116.4 },
          'Northeast': { lat: 41.8, lon: 123.4 },
          'East': { lat: 31.2, lon: 121.5 },
          'Central': { lat: 30.6, lon: 114.3 },
          'South': { lat: 23.1, lon: 113.3 },
          'West': { lat: 30.6, lon: 104.1 },
          'Northwest': { lat: 34.3, lon: 108.9 },
          'Unknown': { lat: 35.0, lon: 105.0 },
        }
        
        const originCoords = cities[d.origin_region] || cities['Unknown']
        const destCoords = cities[d.destination_region] || cities['Unknown']
        
        const inOrigin = originCoords.lat >= bbox.min_lat && originCoords.lat <= bbox.max_lat &&
                        originCoords.lon >= bbox.min_lng && originCoords.lon <= bbox.max_lng
        const inDest = destCoords.lat >= bbox.min_lat && destCoords.lat <= bbox.max_lat &&
                      destCoords.lon >= bbox.min_lng && destCoords.lon <= bbox.max_lng
        
        return inOrigin || inDest
      })
      
      if (filtered.length > 0) {
        setParallelData(filtered)
      }
      return
    }

    try {
      const response = await anomaliesAPI.getParallelCoordsByBbox({
        min_lat: selection.bbox.min_lat,
        max_lat: selection.bbox.max_lat,
        min_lng: selection.bbox.min_lng,
        max_lng: selection.bbox.max_lng,
        min_anomaly_score: minAnomalyScore,
      })
      
      if (response.data?.data?.length > 0) {
        setParallelData(response.data.data)
      }
    } catch (err) {
      console.error('Failed to fetch parallel coords by bbox:', err)
    }
  }, [useMockData, parallelData, minAnomalyScore])

  const handleRunDetection = async () => {
    setIsDetecting(true)
    
    try {
      if (useMockData) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        const mock = generateMockData()
        setFlows(mock.flows)
        setParallelData(mock.parallelData)
        setTopKSubgraphs(mock.subgraphs)
      } else {
        const response = await anomaliesAPI.runDetection({
          days: 90,
          k: 5,
        })
        
        const [flowResponse, pcResponse] = await Promise.all([
          anomaliesAPI.getSpatioTemporalFlows({
            min_score: minAnomalyScore,
            limit: 3000,
            days: 30,
          }),
          anomaliesAPI.getParallelCoords({ limit: 1000 }),
        ])
        
        setFlows(flowResponse.data?.flows || [])
        setParallelData(pcResponse.data?.data || [])
        
        if (response.data?.top_k_subgraphs) {
          setTopKSubgraphs(response.data.top_k_subgraphs)
        }
      }
    } catch (err) {
      console.error('Detection failed:', err)
      setError('检测运行失败')
    } finally {
      setIsDetecting(false)
    }
  }

  const handleRefreshFlows = async () => {
    if (useMockData) {
      const mock = generateMockData()
      setFlows(mock.flows)
      return
    }

    try {
      const response = await anomaliesAPI.getSpatioTemporalFlows({
        min_score: minAnomalyScore,
        limit: 3000,
        days: 30,
      })
      setFlows(response.data?.flows || [])
    } catch (err) {
      console.error('Failed to refresh flows:', err)
    }
  }

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#050a14' }}>
      <AppBar 
        position="static" 
        sx={{ 
          background: 'linear-gradient(90deg, rgba(10,22,40,0.98) 0%, rgba(20,40,70,0.98) 100%)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
        elevation={0}
      >
        <Toolbar sx={{ minHeight: 56, gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <DataObject sx={{ color: '#00c8ff', fontSize: 28 }} />
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
              物流异常检测分析平台
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {error && (
            <Chip 
              label={error} 
              color="warning" 
              size="small"
              variant="outlined"
              onDelete={() => setError(null)}
            />
          )}

          <Chip 
            label={useMockData ? '模拟数据模式' : '实时数据模式'} 
            sx={{ 
              background: useMockData ? 'rgba(255,140,0,0.2)' : 'rgba(0,200,255,0.2)',
              color: useMockData ? '#ff8c00' : '#00c8ff',
              border: useMockData ? '1px solid rgba(255,140,0,0.5)' : '1px solid rgba(0,200,255,0.5)',
            }}
          />

          <Tooltip title="运行完整异常检测">
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={handleRunDetection}
              disabled={isDetecting}
              sx={{
                background: isDetecting ? '#555' : 'linear-gradient(45deg, #ff6b00, #ff8c00)',
                '&:hover': { background: 'linear-gradient(45deg, #ff5500, #ff7a00)' },
                color: 'white',
                textTransform: 'none',
                fontWeight: 'bold',
                minWidth: 160,
              }}
            >
              {isDetecting ? '检测中...' : '运行检测'}
            </Button>
          </Tooltip>

          <Tooltip title="刷新数据">
            <IconButton onClick={handleRefreshFlows} disabled={isLoading} sx={{ color: '#aaa' }}>
              <Refresh />
            </IconButton>
          </Tooltip>

          <Tooltip title={showSidebar ? '隐藏侧栏' : '显示侧栏'}>
            <IconButton onClick={() => setShowSidebar(!showSidebar)} sx={{ color: '#aaa' }}>
              <Layers />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {isDetecting && (
        <LinearProgress 
          sx={{ 
            background: 'rgba(255,140,0,0.2)',
            '& .MuiLinearProgress-bar': {
              background: 'linear-gradient(90deg, #ff6b00, #ff8c00)',
            },
          }}
        />
      )}

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          position: 'relative',
        }}>
          <Box sx={{ 
            position: 'absolute', 
            top: 16, 
            left: 80, 
            zIndex: 1,
            display: 'flex',
            gap: 3,
            alignItems: 'center',
            background: 'rgba(10, 22, 40, 0.9)',
            padding: '12px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <Box sx={{ width: 200 }}>
              <Typography sx={{ color: '#aaa', fontSize: 11, mb: 0.5 }}>
                最低异常评分: {minAnomalyScore.toFixed(1)}
              </Typography>
              <Slider
                value={minAnomalyScore}
                onChange={(e, v) => setMinAnomalyScore(v)}
                min={0}
                max={5}
                step={0.1}
                sx={{
                  color: '#ff8c00',
                  '& .MuiSlider-thumb': { background: '#ff8c00' },
                  '& .MuiSlider-rail': { background: 'rgba(255,255,255,0.2)' },
                }}
              />
            </Box>
          </Box>

          <Box sx={{ flex: 1 }}>
            {isLoading ? (
              <Box sx={{ 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#888',
                flexDirection: 'column',
                gap: 2,
              }}>
                <LinearProgress sx={{ width: 200 }} />
                <Typography>加载数据中...</Typography>
              </Box>
            ) : (
              <SpatioTemporalMap
                flows={flows}
                warehouses={warehouses}
                onLassoSelect={handleLassoSelect}
                showNormalFlows={showNormalFlows}
                minAnomalyScore={minAnomalyScore}
              />
            )}
          </Box>
        </Box>

        <Drawer
          variant="persistent"
          anchor="right"
          open={showSidebar}
          sx={{
            width: 380,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: 380,
              background: 'rgba(10, 22, 40, 0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              padding: 2,
              boxSizing: 'border-box',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
              分析面板
            </Typography>
            <IconButton onClick={() => setShowSidebar(false)} sx={{ color: '#888' }}>
              <Close />
            </IconButton>
          </Box>

          {selectedBbox && (
            <Box sx={{ mb: 2 }}>
              <Chip
                label="已选择区域 - 点击刷新查看全部"
                onDelete={() => {
                  setSelectedBbox(null)
                  if (useMockData) {
                    const mock = generateMockData()
                    setParallelData(mock.parallelData)
                  } else {
                    loadInitialData()
                  }
                }}
                sx={{
                  background: 'rgba(0,200,255,0.2)',
                  color: '#00c8ff',
                  border: '1px solid rgba(0,200,255,0.5)',
                }}
              />
            </Box>
          )}

          <Box sx={{ 
            height: 300, 
            mb: 2,
            background: 'rgba(10, 22, 40, 0.5)',
            borderRadius: 2,
            padding: 1,
            position: 'relative',
          }}>
            <ParallelCoordinatesChart
              data={parallelData}
              title={selectedBbox ? '选中区域异常特征' : '全局异常特征分布'}
            />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <TopKSubgraphPanel 
              subgraphs={topKSubgraphs} 
              loading={isDetecting}
            />
          </Box>
        </Drawer>
      </Box>
    </Box>
  )
}

export default App
