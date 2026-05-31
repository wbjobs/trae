import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Select,
  Typography,
  Tag,
  Spin,
  Button,
  Space,
  Tooltip,
} from 'antd'
import {
  ReloadOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { topologyApi, metricsApi } from '../api/index.js'
import Network from 'vis-network/standalone'

const { Title, Text } = Typography
const { Option } = Select

const nodePositions = {
  'api-gateway': { x: 0, y: -200 },
  'user-service': { x: -200, y: 0 },
  'order-service': { x: 200, y: 0 },
  'payment-service': { x: 100, y: 200 },
  'inventory-service': { x: 300, y: 200 },
  'notification-service': { x: 100, y: 350 },
}

export default function Topology() {
  const [loading, setLoading] = useState(false)
  const [topology, setTopology] = useState(null)
  const [selectedService, setSelectedService] = useState('all')
  const [metrics, setMetrics] = useState(null)
  const networkRef = useRef(null)
  const containerRef = useRef(null)

  const loadTopology = useCallback(async () => {
    setLoading(true)
    try {
      const res = await topologyApi.get()
      setTopology(res.data)
    } catch (err) {
      console.error('Failed to load topology:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMetrics = useCallback(async () => {
    try {
      const res = await metricsApi.get(selectedService)
      setMetrics(res.data)
    } catch (err) {
      console.error('Failed to load metrics:', err)
    }
  }, [selectedService])

  useEffect(() => {
    loadTopology()
    loadMetrics()
    const interval = setInterval(() => {
      loadTopology()
      loadMetrics()
    }, 5000)
    return () => clearInterval(interval)
  }, [loadTopology, loadMetrics])

  useEffect(() => {
    if (!topology || !containerRef.current) return

    const nodes = new Map()
    topology.nodes.forEach((node) => {
      const pos = nodePositions[node.service] || { x: 0, y: 0 }
      nodes.set(node.service, {
        id: node.service,
        label: node.service,
        x: pos.x,
        y: pos.y,
        color: node.hasFault
          ? { background: '#ff4d4f', border: '#ff4d4f' }
          : { background: '#1677ff', border: '#1677ff' },
        font: { color: '#fff', size: 14, bold: { color: '#fff' } },
        shape: 'box',
        margin: 12,
        shadow: node.hasFault,
      })
    })

    const edges = topology.edges.map((edge, idx) => ({
      id: idx,
      from: edge.from,
      to: edge.to,
      color: edge.hasFault
        ? { color: '#ff4d4f', highlight: '#ff4d4f' }
        : { color: '#999', highlight: '#1677ff' },
      width: edge.hasFault ? 3 : 2,
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
    }))

    const data = {
      nodes: Array.from(nodes.values()),
      edges,
    }

    const options = {
      nodes: {
        borderWidth: 2,
      },
      edges: {
        smooth: {
          type: 'continuous',
        },
      },
      physics: {
        enabled: false,
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
      },
    }

    if (networkRef.current) {
      networkRef.current.destroy()
    }

    networkRef.current = new Network(containerRef.current, data, options)
  }, [topology])

  const faultyServices = topology?.nodes.filter((n) => n.hasFault) || []
  const healthyServices = topology?.nodes.filter((n) => !n.hasFault) || []

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ marginTop: 0 }}>
          Service Topology
        </Title>
        <Space>
          <Select
            value={selectedService}
            onChange={setSelectedService}
            style={{ width: 200 }}
          >
            <Option value="all">All Services</Option>
            {topology?.nodes.map((n) => (
              <Option key={n.service} value={n.service}>
                {n.service}
              </Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={() => { loadTopology(); loadMetrics() }}>
            Refresh
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Service Graph">
            <Spin spinning={loading}>
              <div
                ref={containerRef}
                style={{ height: 500, background: '#fafafa', borderRadius: 6 }}
              />
            </Spin>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <Tag color="blue">Normal</Tag>
              <Tag color="red">Fault Injected</Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Service Status" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                Healthy: {healthyServices.length}
              </Text>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Text strong>
                <ThunderboltOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                Faulty: {faultyServices.length}
              </Text>
            </div>
            <div>
              {faultyServices.map((n) => (
                <Tag key={n.service} color="red" style={{ marginTop: 4 }}>
                  {n.service} ({n.fault_type === 'compound' ? 'delay+abort' : n.fault_type})
                </Tag>
              ))}
            </div>
          </Card>

          {metrics && (
            <Card title={`Metrics - ${selectedService}`}>
              <Row gutter={[8, 16]}>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Success Rate</Text>
                    <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>
                      {metrics.success_rate.toFixed(2)}%
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Error Rate</Text>
                    <div style={{ fontSize: 24, fontWeight: 600, color: '#ff4d4f' }}>
                      {metrics.error_rate.toFixed(2)}%
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">Avg Latency</Text>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>
                      {metrics.avg_latency_ms.toFixed(0)}ms
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">P95 Latency</Text>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>
                      {metrics.p95_latency_ms.toFixed(0)}ms
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">P99 Latency</Text>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>
                      {metrics.p99_latency_ms.toFixed(0)}ms
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">QPS</Text>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>
                      {metrics.qps.toFixed(0)}
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}
