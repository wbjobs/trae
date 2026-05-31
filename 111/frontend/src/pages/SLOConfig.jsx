import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Popconfirm,
  message,
  Tooltip,
  Typography,
  Tag,
  Card,
  Row,
  Col,
  Alert,
  Divider,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SafetyOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { sloApi, servicesApi } from '../api/index.js'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

export default function SLOConfig() {
  const [loading, setLoading] = useState(false)
  const [slos, setSlos] = useState([])
  const [services, setServices] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editSlo, setEditSlo] = useState(null)
  const [form] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [sloRes, svcRes] = await Promise.all([
        sloApi.list(),
        servicesApi.list(),
      ])
      setSlos(sloRes.data)
      setServices(svcRes.data)
    } catch (err) {
      message.error('Failed to load SLOs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = () => {
    setEditSlo(null)
    form.resetFields()
    form.setFieldsValue({
      namespace: 'default',
      is_critical: false,
      max_avg_latency_ms: 500,
      max_p95_latency_ms: 1000,
      max_p99_latency_ms: 2000,
      min_success_rate: 95.0,
      max_error_rate: 5.0,
      min_qps: 1.0,
      auto_stop_enabled: true,
      grace_period_seconds: 30,
    })
    setModalOpen(true)
  }

  const handleEdit = (slo) => {
    setEditSlo(slo)
    form.setFieldsValue({
      service: slo.service,
      namespace: slo.namespace,
      is_critical: slo.is_critical,
      max_avg_latency_ms: slo.max_avg_latency_ms,
      max_p95_latency_ms: slo.max_p95_latency_ms,
      max_p99_latency_ms: slo.max_p99_latency_ms,
      min_success_rate: slo.min_success_rate,
      max_error_rate: slo.max_error_rate,
      min_qps: slo.min_qps,
      auto_stop_enabled: slo.auto_stop_enabled,
      grace_period_seconds: slo.grace_period_seconds,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (editSlo) {
        await sloApi.update(editSlo.id, values)
        message.success('SLO updated')
      } else {
        await sloApi.create(values)
        message.success('SLO created')
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      if (err.response) {
        message.error(err.response.data.error || 'Operation failed')
      }
    }
  }

  const handleDelete = async (id) => {
    try {
      await sloApi.delete(id)
      message.success('SLO deleted')
      loadData()
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete')
    }
  }

  const columns = [
    {
      title: 'Service',
      dataIndex: 'service',
      key: 'service',
      render: (service, record) => (
        <Space>
          {service}
          {record.is_critical && (
            <Tooltip title="Critical service - auto-stop on SLO breach">
              <Tag color="red" icon={<WarningOutlined />}>
                CRITICAL
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Namespace',
      dataIndex: 'namespace',
      key: 'namespace',
    },
    {
      title: 'Success Rate',
      key: 'success_rate',
      render: (_, record) => (
        <Tooltip title={`Minimum success rate: ${record.min_success_rate}%`}>
          <Text>≥ {record.min_success_rate}%</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Max Latency',
      key: 'latency',
      render: (_, record) => (
        <Tooltip title={`Avg: ${record.max_avg_latency_ms}ms / P95: ${record.max_p95_latency_ms}ms / P99: ${record.max_p99_latency_ms}ms`}>
          <Text>
            {record.max_avg_latency_ms} / {record.max_p95_latency_ms} / {record.max_p99_latency_ms}ms
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Max Error',
      dataIndex: 'max_error_rate',
      key: 'max_error_rate',
      render: (val) => <Text>≤ {val}%</Text>,
    },
    {
      title: 'Auto-Stop',
      dataIndex: 'auto_stop_enabled',
      key: 'auto_stop_enabled',
      render: (enabled) => (
        enabled ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>Enabled</Tag>
        ) : (
          <Tag color="default">Disabled</Tag>
        )
      ),
    },
    {
      title: 'Grace',
      dataIndex: 'grace_period_seconds',
      key: 'grace_period_seconds',
      render: (val) => <Text>{val}s</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this SLO?"
            description="Auto-stop will no longer protect this service"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const criticalCount = slos.filter((s) => s.is_critical).length
  const protectedCount = slos.filter((s) => s.auto_stop_enabled).length

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
          SLO Configuration
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            New SLO
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<SafetyOutlined />}
        message="Blast Radius Control"
        description={
          <span>
            Define SLO thresholds for each service. When an experiment causes metrics to breach these
            thresholds, the system will <strong>automatically pause</strong> the experiment after the
            grace period. Critical services are stopped immediately.
          </span>
        }
        style={{ marginBottom: 16 }}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <StatisticMini label="Services with SLO" value={slos.length} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <StatisticMini
              label="Auto-Stop Enabled"
              value={protectedCount}
              valueColor="#52c41a"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <StatisticMini
              label="Critical Services"
              value={criticalCount}
              valueColor="#ff4d4f"
            />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={slos}
        columns={columns}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: 'No SLOs configured. Click "New SLO" to add protection for your services.' }}
      />

      <Modal
        title={editSlo ? 'Edit SLO Threshold' : 'Create SLO Threshold'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={680}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="service"
                label="Service"
                rules={[{ required: true }]}
              >
                <Select>
                  {services.map((s) => (
                    <Option key={s} value={s}>
                      {s}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="namespace"
                label="Namespace"
                rules={[{ required: true }]}
              >
                <Input placeholder="default" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="is_critical"
            label="Critical Service"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="CRITICAL"
              unCheckedChildren="Normal"
            />
          </Form.Item>
          <Paragraph type="secondary" style={{ marginTop: -16, fontSize: 12 }}>
            Critical services trigger immediate auto-stop with no grace period
          </Paragraph>

          <Divider text="SLO Thresholds" />

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="min_success_rate" label="Min Success Rate (%)">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="max_error_rate" label="Max Error Rate (%)">
                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item name="max_avg_latency_ms" label="Max Avg Latency (ms)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="max_p95_latency_ms" label="Max P95 Latency (ms)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="max_p99_latency_ms" label="Max P99 Latency (ms)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="min_qps" label="Min QPS">
            <InputNumber min={0} step={0.1} style={{ width: 200 }} />
          </Form.Item>

          <Divider text="Safety Action" />

          <Form.Item
            name="auto_stop_enabled"
            label="Auto-Stop on SLO Breach"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="Enabled"
              unCheckedChildren="Disabled"
            />
          </Form.Item>

          <Form.Item
            name="grace_period_seconds"
            label="Grace Period (seconds)"
            tooltip="Time to wait before auto-stopping after SLO breach. 0 = stop immediately."
          >
            <InputNumber min={0} max={600} style={{ width: 200 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function StatisticMini({ label, value, valueColor }) {
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <div style={{ fontSize: 22, fontWeight: 600, color: valueColor }}>
        {value}
      </div>
    </div>
  )
}
