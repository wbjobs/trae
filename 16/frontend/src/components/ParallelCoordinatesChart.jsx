import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

function ParallelCoordinatesChart({ data = [], title = '异常特征分布' }) {
  const chartData = useMemo(() => {
    const regionMap = {
      'North': 0, 'Northeast': 1, 'East': 2,
      'Central': 3, 'South': 4, 'West': 5, 'Northwest': 6,
      'Unknown': 7,
    }
    
    const levelMap = {
      'low': 0,
      'medium': 1,
      'high': 2,
      'critical': 3,
    }

    return data.map(d => [
      d.weight || 0,
      d.transit_hours || 0,
      d.expected_transit_hours || 0,
      d.anomaly_score || 0,
      d.distance_km || 0,
      regionMap[d.origin_region] ?? 7,
      regionMap[d.destination_region] ?? 7,
      levelMap[d.anomaly_level] ?? 0,
    ])
  }, [data])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    title: {
      text: title,
      textStyle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'normal',
      },
      left: 'center',
      top: 10,
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10, 22, 40, 0.95)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        if (!params.data) return ''
        const d = data[params.dataIndex]
        if (!d) return ''
        return `
          <div style="padding: 8px;">
            <div style="margin-bottom: 4px;"><strong>订单 #${d.order_id}</strong></div>
            <div>重量: ${(d.weight || 0).toFixed(1)} 吨</div>
            <div>实际运输: ${(d.transit_hours || 0).toFixed(1)} 小时</div>
            <div>预期运输: ${(d.expected_transit_hours || 0).toFixed(1)} 小时</div>
            <div>异常评分: ${(d.anomaly_score || 0).toFixed(2)}</div>
            <div>距离: ${(d.distance_km || 0).toFixed(0)} km</div>
            <div>起点: ${d.origin_region}</div>
            <div>终点: ${d.destination_region}</div>
            <div>等级: ${d.anomaly_level}</div>
          </div>
        `
      },
    },
    parallelAxis: [
      {
        dim: 0,
        name: '重量 (吨)',
        type: 'value',
        min: 0,
        max: 50,
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 1,
        name: '实际运输 (h)',
        type: 'value',
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 2,
        name: '预期运输 (h)',
        type: 'value',
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 3,
        name: '异常评分',
        type: 'value',
        min: 0,
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 4,
        name: '距离 (km)',
        type: 'value',
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 5,
        name: '起点区域',
        type: 'category',
        data: ['华北', '东北', '华东', '华中', '华南', '西南', '西北', '未知'],
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 6,
        name: '终点区域',
        type: 'category',
        data: ['华北', '东北', '华东', '华中', '华南', '西南', '西北', '未知'],
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
      {
        dim: 7,
        name: '异常等级',
        type: 'category',
        data: ['低', '中', '高', '严重'],
        nameTextStyle: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        axisLabel: { color: '#888' },
      },
    ],
    series: [
      {
        type: 'parallel',
        lineStyle: {
          width: 1.5,
          opacity: 0.4,
          color: function(params) {
            const level = data[params.dataIndex]?.anomaly_level
            switch(level) {
              case 'critical': return '#ff0000'
              case 'high': return '#ff8c00'
              case 'medium': return '#ffdc00'
              case 'low': return '#00c8ff'
              default: return '#6496c8'
            }
          },
        },
        emphasis: {
          lineStyle: {
            width: 3,
            opacity: 1,
          },
        },
        data: chartData,
        blendMode: 'lighter',
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'empty',
      },
    ],
  }), [chartData, data, title])

  if (data.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        background: 'rgba(10, 22, 40, 0.5)',
        borderRadius: '12px',
      }}>
        暂无数据，请先运行异常检测或选择地图区域
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '20px',
        fontSize: '11px',
        color: '#888',
      }}>
        共 {data.length} 条记录 | 支持拖拽筛选
      </div>
    </div>
  )
}

export default ParallelCoordinatesChart
