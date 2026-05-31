import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Card,
  Tooltip,
  Spin,
  Row,
  Col,
  Modal,
  Descriptions,
  Alert,
} from 'antd'
import {
  ReloadOutlined,
  SafetyOutlined,
  StopOutlined,
  PauseCircleOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { safetyApi, experimentsApi } from '../api/index.js'

const { Title, Text } = Typography

const actionColors = {
  auto_stop: 'red',
  stop: 'volcano',
  pause: 'orange',
  warn: 'blue',
}

const actionIcons = {
  auto_stop: <StopOutlined />,
  stop: <StopOutlined />,
  pause: <PauseCircleOutlined />,
  warn: <InfoCircleOutlined />,
}

const actionLabels = {
  auto_stop: 'AUTO-STOP',
  stop: 'Stopped',
  pause: 'Paused',
  warn: 'Warning',
}

export default function SafetyEvents() {
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await safetyApi.listEvents()
      setEvents(res.data)
    } catch (err) {
      console.error('Failed to load safety events:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [loadData])

  const autoStopCount = events.filter((e) => e.action === 'auto_stop').length
  const warnCount = events.filter((e) => e.action === 'warn').length
  const recentEvents = events.slice(0, 10)

  const columns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (t) => new Date(t).toLocaleString(),
      width: 180,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (action) => (
        <Tag color={actionColors[action]} icon={actionIcons[action]}>
          {actionLabels[action] || action}
        </Tag>
      ),
      width: 120,
    },
    {
      title: 'Experiment',
      dataIndex: 'experiment_name',
      key: 'experiment_name',
    },
    {
      title: 'Service',
      key: 'service',
      render: (_, record) => (
        record.service ? (
          <Text code>{record.service}.{record.namespace}</Text>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason) => (
        <Tooltip title={reason}>
          <Text ellipsis style={{ maxWidth: 300 }}>{reason}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Violations',
      dataIndex: 'violations',
      key: 'violations',
      render: (violations) => (
        violations && violations.length > 0 ? (
          <Tag color="red">{violations.length} SLO breach(es)</Tag>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
    },
    {
      title: 'Details',
      key: 'details',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => setSelectedEvent(record)}
        >
          View
        </Button>
      ),
    },
  ]

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
          <SafetyOutlined style={{ marginRight: 8 }} />
          Safety Events
        </Title>
        <Button icon={<ReloadOutlined />} onClick={loadData}>
          Refresh
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Total Events</Text>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{events.length}</div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Auto-Stopped</Text>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#ff4d4f' }}>
                {autoStopCount}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Warnings</Text>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#faad14' }}>
                {warnCount}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Recent</Text>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{recentEvents.length}</div>
            </div>
          </Card>
        </Col>
      </Row>

      {autoStopCount > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={`${autoStopCount} experiment(s) were auto-stopped by the safety system`}
          description="Experiments are automatically stopped when they cause SLO breaches. Review the events below to understand what triggered the auto-stop."
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading}>
        <Card title="Safety Event Log">
          <Table
            dataSource={events}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            locale={{ emptyText: 'No safety events recorded yet' }}
          />
        </Card>
      </Spin>

      <Modal
        title="Safety Event Details"
        open={!!selectedEvent}
        onCancel={() => setSelectedEvent(null)}
        footer={null}
        width={720}
      >
        {selectedEvent && (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Time">
                {new Date(selectedEvent.timestamp).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Action">
                <Tag color={actionColors[selectedEvent.action]}>
                  {actionLabels[selectedEvent.action] || selectedEvent.action}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Experiment">
                {selectedEvent.experiment_name}
                <Text type="secondary">
                  {' '}(ID: {selectedEvent.experiment_id.substring(0, 8)}...)
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Reason">
                {selectedEvent.reason}
              </Descriptions.Item>
              {selectedEvent.service && (
                <Descriptions.Item label="Service">
                  <Text code>
                    {selectedEvent.service}.{selectedEvent.namespace}
                  </Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedEvent.violations && selectedEvent.violations.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text strong>SLO Violations:</Text>
                <Table
                  dataSource={selectedEvent.violations}
                  rowKey={(r) => `${r.service}-${r.metric}`}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Metric', dataIndex: 'metric', key: 'metric' },
                    {
                      title: 'Threshold',
                      dataIndex: 'threshold',
                      key: 'threshold',
                      render: (val, record) => (
                        <Text>
                          {record.metric.includes('rate') ? `${val}%` : `${val}ms`}
                        </Text>
                      ),
                    },
                    {
                      title: 'Actual',
                      dataIndex: 'actual',
                      key: 'actual',
                      render: (val, record) => (
                        <Text type="danger">
                          {record.metric.includes('rate') ? `${val}%` : `${val.toFixed(0)}ms`}
                        </Text>
                      ),
                    },
                    {
                      title: 'Severity',
                      dataIndex: 'severity',
                      key: 'severity',
                      render: (val) => (
                        <Tag color={val === 'critical' ? 'red' : 'orange'}>
                          {val.toUpperCase()}
                        </Tag>
                      ),
                    },
                  ]}
                  style={{ marginTop: 8 }}
                />
              </div>
            )}

            {selectedEvent.metrics_after && (
              <div style={{ marginTop: 16 }}>
                <Text strong>Metrics at Time of Action:</Text>
                <Descriptions
                  column={2}
                  bordered
                  size="small"
                  style={{ marginTop: 8 }}
                >
                  <Descriptions.Item label="Success Rate">
                    {selectedEvent.metrics_after.success_rate.toFixed(2)}%
                  </Descriptions.Item>
                  <Descriptions.Item label="Error Rate">
                    {selectedEvent.metrics_after.error_rate.toFixed(2)}%
                  </Descriptions.Item>
                  <Descriptions.Item label="Avg Latency">
                    {selectedEvent.metrics_after.avg_latency_ms.toFixed(0)}ms
                  </Descriptions.Item>
                  <Descriptions.Item label="P95 Latency">
                    {selectedEvent.metrics_after.p95_latency_ms.toFixed(0)}ms
                  </Descriptions.Item>
                  <Descriptions.Item label="P99 Latency">
                    {selectedEvent.metrics_after.p99_latency_ms.toFixed(0)}ms
                  </Descriptions.Item>
                  <Descriptions.Item label="QPS">
                    {selectedEvent.metrics_after.qps.toFixed(0)}
                  </Descriptions.Item>
                </Descriptions>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
