import { useMemo } from 'react'
import {
  LineChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div style={{
        background: 'rgba(30, 30, 50, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '12px',
        color: '#e4e4e7',
        fontSize: '12px'
      }}>
        <div style={{ marginBottom: '4px', color: '#a1a1aa' }}>时间: {data.time}</div>
        <div style={{ marginBottom: '4px' }}>价格: <span style={{ color: '#60a5fa', fontWeight: 600 }}>${data.price.toFixed(2)}</span></div>
        <div>成交量: <span style={{ color: '#a78bfa' }}>{data.volume.toLocaleString()}</span></div>
        {data.isAnomaly && (
          <div style={{ marginTop: '4px', color: '#ef4444', fontWeight: 600 }}>⚠️ 异常检测</div>
        )}
      </div>
    )
  }
  return null
}

export default function StockChart({ data }) {
  const { chartData, anomalyData } = useMemo(() => {
    const anomalies = []
    data.forEach((point, index) => {
      if (point.isAnomaly) {
        anomalies.push({
          ...point,
          index
        })
      }
    })
    return { chartData: data, anomalyData: anomalies }
  }, [data])

  const priceDomain = useMemo(() => {
    if (chartData.length === 0) return [90, 110]
    const prices = chartData.map(d => d.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const padding = (max - min) * 0.1 || 5
    return [Math.floor(min - padding), Math.ceil(max + padding)]
  }, [chartData])

  return (
    <div style={{ width: '100%', height: 500 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="time"
            stroke="#71717a"
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={priceDomain}
            stroke="#71717a"
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickFormatter={(value) => `$${value}`}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="url(#lineGradient)"
            strokeWidth={2}
            dot={false}
            name="价格"
            activeDot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Scatter
            data={anomalyData}
            dataKey="price"
            fill="#ef4444"
            name="异常点"
            line={false}
            shape={(props) => {
              const { cx, cy } = props
              return (
                <g>
                  <circle cx={cx} cy={cy} r={8} fill="rgba(239, 68, 68, 0.3)" />
                  <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fca5a5" strokeWidth={1} />
                </g>
              )
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
