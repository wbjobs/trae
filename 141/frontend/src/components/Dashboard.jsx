import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Button, Space, message } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { metricsApi } from '../services/api.js'

const Dashboard = () => {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const response = await metricsApi.get()
      if (response.data.success) {
        setMetrics(response.data.data)
      }
    } catch (error) {
      message.error('获取指标失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchMetrics()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleReset = async () => {
    try {
      await metricsApi.reset()
      message.success('指标已重置')
      fetchMetrics()
    } catch (error) {
      message.error('重置指标失败: ' + error.message)
    }
  }

  const getLatencyChartData = () => {
    if (!metrics) return []

    const operations = ['get', 'set', 'delete', 'bulk_get', 'bulk_set', 'bulk_delete']
    return operations.map((op) => ({
      name: op,
      平均: metrics.avg_latency?.[op] || 0,
      P50: metrics.p50_latency?.[op] || 0,
      P99: metrics.p99_latency?.[op] || 0,
    }))
  }

  const getOperationCountsData = () => {
    if (!metrics || !metrics.operation_counts) return []
    return Object.entries(metrics.operation_counts).map(([name, count]) => ({
      name,
      count,
    }))
  }

  const getRecentLatencyData = () => {
    if (!metrics || !metrics.recent_latencies) return []

    const getLatencies = metrics.recent_latencies.get || []
    const setLatencies = metrics.recent_latencies.set || []

    const maxLen = Math.max(getLatencies.length, setLatencies.length)
    const data = []

    for (let i = 0; i < maxLen; i++) {
      data.push({
        index: i + 1,
        GET: getLatencies[i] || 0,
        SET: setLatencies[i] || 0,
      })
    }

    return data.slice(-20)
  }

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总请求数"
              value={metrics?.total_requests || 0}
              prefix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="QPS"
              value={metrics?.qps?.toFixed(2) || 0}
              suffix="req/s"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="成功率"
              value={metrics?.success_rate?.toFixed(2) || 0}
              suffix="%"
              valueStyle={{ color: metrics?.success_rate > 95 ? '#3f8600' : '#cf1322' }}
              prefix={
                metrics?.success_rate > 95 ? (
                  <CheckCircleOutlined />
                ) : (
                  <CloseCircleOutlined />
                )
              }
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="运行时间"
              value={metrics?.uptime || '0s'}
              prefix={<ArrowDownOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card
            title="延迟统计 (ms)"
            extra={
              <Space>
                <Button
                  size="small"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  {autoRefresh ? '停止刷新' : '自动刷新'}
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={fetchMetrics}
                  loading={loading}
                >
                  刷新
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={handleReset}
                >
                  重置
                </Button>
              </Space>
            }
          >
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={getLatencyChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="平均" fill="#8884d8" />
                <Bar dataKey="P50" fill="#82ca9d" />
                <Bar dataKey="P99" fill="#ffc658" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="操作次数统计">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={getOperationCountsData()}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#413ea0" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="最近延迟趋势 (GET/SET)">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={getRecentLatencyData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="GET"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="SET"
                  stroke="#82ca9d"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="成功/失败统计">
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="成功"
                  value={metrics?.total_success || 0}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="失败"
                  value={metrics?.total_errors || 0}
                  valueStyle={{ color: '#cf1322' }}
                  prefix={<CloseCircleOutlined />}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="操作详情">
            <Table
              size="small"
              pagination={false}
              dataSource={Object.entries(metrics?.operation_counts || {}).map(([name, count]) => ({
                key: name,
                name,
                count,
              }))}
              columns={[
                { title: '操作', dataIndex: 'name', key: 'name' },
                {
                  title: '次数',
                  dataIndex: 'count',
                  key: 'count',
                  render: (value) => <Tag color="blue">{value}</Tag>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
