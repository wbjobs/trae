import React, { useState, useEffect, useCallback } from 'react'
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Space,
  Typography,
  Spin,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { experimentsApi, metricsApi, topologyApi } from '../api/index.js'

const { Title } = Typography

const statusColors = {
  pending: 'default',
  running: 'processing',
  paused: 'warning',
  completed: 'success',
  failed: 'error',
}

const faultTypeColors = {
  delay: 'blue',
  abort: 'red',
  interrupt: 'orange',
  compound: 'geekblue',
}

const faultTypeLabels = {
  delay: 'DELAY',
  abort: 'ABORT',
  interrupt: 'INTERRUPT',
  compound: 'DELAY+ABORT',
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [experiments, setExperiments] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [activeFaults, setActiveFaults] = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, metricsRes, topologyRes] = await Promise.all([
        experimentsApi.list(),
        metricsApi.get('all'),
        topologyApi.get(),
      ])
      setExperiments(expRes.data)
      setMetrics(metricsRes.data)
      const activeCount = expRes.data.filter(
        (e) => e.status === 'running' || e.status === 'paused'
      ).length
      setActiveFaults(activeCount)
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      dataIndex: 'fault_type',
      key: 'fault_type',
      render: (type) => (
        <Tag color={faultTypeColors[type]}>{faultTypeLabels[type] || type.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={statusColors[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Targets',
      dataIndex: 'targets',
      key: 'targets',
      render: (targets) => (
        <Space size={[4, 4]} wrap>
          {targets.map((t) => (
            <Tag key={t.service}>{t.service}.{t.namespace}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t) => new Date(t).toLocaleString(),
    },
  ]

  return (
    <Spin spinning={loading}>
      <div>
        <Title level={3} style={{ marginTop: 0 }}>
          Dashboard
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Experiments"
                value={experiments.length}
                prefix={<ExperimentOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Active Faults"
                value={activeFaults}
                valueStyle={{ color: activeFaults > 0 ? '#cf1322' : '#3f8600' }}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Success Rate"
                value={metrics?.success_rate ?? 0}
                precision={2}
                suffix="%"
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Avg Latency"
                value={metrics?.avg_latency_ms ?? 0}
                precision={0}
                suffix="ms"
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="P95 Latency"
                value={metrics?.p95_latency_ms ?? 0}
                precision={0}
                suffix="ms"
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="P99 Latency"
                value={metrics?.p99_latency_ms ?? 0}
                precision={0}
                suffix="ms"
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="QPS"
                value={metrics?.qps ?? 0}
                precision={0}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Error Rate"
                value={metrics?.error_rate ?? 0}
                precision={2}
                suffix="%"
                valueStyle={{ color: '#cf1322' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Card title="Recent Experiments" style={{ marginTop: 24 }}>
          <Table
            dataSource={experiments.slice(-5).reverse()}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={false}
          />
        </Card>
      </div>
    </Spin>
  )
}
