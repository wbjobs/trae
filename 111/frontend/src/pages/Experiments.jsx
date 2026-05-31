import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Popconfirm,
  message,
  Tooltip,
  Typography,
  Collapse,
  Descriptions,
  Alert,
  Row,
  Col,
  Statistic,
  Progress,
} from 'antd'
import {
  PlusOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  WarningOutlined,
  SafetyOutlined,
} from '@ant-design/icons'
import { experimentsApi, servicesApi } from '../api/index.js'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input
const { Panel } = Collapse

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

const statusActions = {
  pending: ['start', 'edit', 'delete'],
  running: ['pause', 'stop'],
  paused: ['resume', 'stop'],
  completed: ['delete'],
  failed: ['delete'],
}

export default function Experiments() {
  const [loading, setLoading] = useState(false)
  const [experiments, setExperiments] = useState([])
  const [services, setServices] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editExp, setEditExp] = useState(null)
  const [detailExp, setDetailExp] = useState(null)
  const [yamlModalOpen, setYamlModalOpen] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const [conflictWarning, setConflictWarning] = useState(null)
  const [blastRadiusModal, setBlastRadiusModal] = useState(null)
  const [form] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, svcRes] = await Promise.all([
        experimentsApi.list(),
        servicesApi.list(),
      ])
      setExperiments(expRes.data)
      setServices(svcRes.data)
    } catch (err) {
      message.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = () => {
    setEditExp(null)
    setConflictWarning(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (exp) => {
    setEditExp(exp)
    setConflictWarning(null)
    form.setFieldsValue({
      name: exp.name,
      description: exp.description,
      fault_type: exp.fault_type,
      duration: exp.duration,
      delay: exp.delay,
      abort: exp.abort,
      interrupt: exp.interrupt,
      targets: exp.targets,
      labels: exp.labels,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      const targets = values.targets || []
      if (targets.length === 0) {
        message.error('At least one target is required')
        return
      }

      if (editExp) {
        await experimentsApi.update(editExp.id, values)
        message.success('Experiment updated')
      } else {
        await experimentsApi.create(values)
        message.success('Experiment created')
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      if (err.response) {
        message.error(err.response.data.error || 'Operation failed')
      }
    }
  }

  const handleStart = async (exp) => {
    setConflictWarning(null)
    try {
      const blastRes = await experimentsApi.getBlastRadius(exp.id)
      const blastData = blastRes.data

      if (blastData.has_high_risk || blastData.has_critical_svc) {
        setBlastRadiusModal({
          experiment: exp,
          ...blastData,
        })
        return
      }

      await doStartExperiment(exp)
    } catch (err) {
      if (err.response?.status === 409) {
        const data = err.response.data
        setConflictWarning({
          experiment: exp,
          ...data,
        })
        message.error({
          content: (
            <div>
              <div><strong>Conflict detected!</strong></div>
              <div style={{ marginTop: 4 }}>
                Target <Text code>{data.target}</Text> already has an active{' '}
                <Tag color={faultTypeColors[data.existing_type]}>
                  {faultTypeLabels[data.existing_type] || data.existing_type}
                </Tag>{' '}
                fault.
              </div>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  Use <Text strong>fault_type="compound"</Text> to combine delay+abort in a single rule.
                </Text>
              </div>
            </div>
          ),
          duration: 8,
        })
      } else {
        message.error(err.response?.data?.error || 'Failed to start')
      }
    }
  }

  const doStartExperiment = async (exp) => {
    try {
      await experimentsApi.start(exp.id)
      message.success('Experiment started')
      setBlastRadiusModal(null)
      loadData()
    } catch (err) {
      if (err.response?.status === 409) {
        const data = err.response.data
        setConflictWarning({
          experiment: exp,
          ...data,
        })
      } else {
        message.error(err.response?.data?.error || 'Failed to start')
      }
    }
  }

  const handlePause = async (id) => {
    try {
      await experimentsApi.pause(id)
      message.success('Experiment paused')
      loadData()
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to pause')
    }
  }

  const handleResume = async (id) => {
    try {
      await experimentsApi.resume(id)
      message.success('Experiment resumed')
      loadData()
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to resume')
    }
  }

  const handleStop = async (id) => {
    try {
      await experimentsApi.stop(id)
      message.success('Experiment stopped')
      loadData()
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to stop')
    }
  }

  const handleDelete = async (id) => {
    try {
      await experimentsApi.delete(id)
      message.success('Experiment deleted')
      loadData()
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete')
    }
  }

  const handleViewYAML = async (exp) => {
    try {
      const res = await experimentsApi.getVSYAML(exp.id)
      setYamlContent(res.data)
      setYamlModalOpen(true)
    } catch (err) {
      message.error('Failed to get YAML')
    }
  }

  const renderFaultTypeTag = (type) => {
    const label = faultTypeLabels[type] || type.toUpperCase()
    return <Tag color={faultTypeColors[type]}>{label}</Tag>
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <a onClick={() => setDetailExp(record)}>{name}</a>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'fault_type',
      key: 'fault_type',
      render: (type) => renderFaultTypeTag(type),
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
            <Tag key={`${t.service}-${t.namespace}`}>
              {t.service}.{t.namespace}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t) => new Date(t).toLocaleString(),
      width: 160,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_, record) => {
        const actions = statusActions[record.status] || []
        return (
          <Space size={4}>
            {actions.includes('start') && (
              <Tooltip title="Start">
                <Button
                  type="link"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleStart(record)}
                />
              </Tooltip>
            )}
            {actions.includes('pause') && (
              <Tooltip title="Pause">
                <Button
                  type="link"
                  icon={<PauseCircleOutlined />}
                  onClick={() => handlePause(record.id)}
                />
              </Tooltip>
            )}
            {actions.includes('resume') && (
              <Tooltip title="Resume">
                <Button
                  type="link"
                  icon={<ReloadOutlined />}
                  onClick={() => handleResume(record.id)}
                />
              </Tooltip>
            )}
            {actions.includes('stop') && (
              <Tooltip title="Stop">
                <Button
                  type="link"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => handleStop(record.id)}
                />
              </Tooltip>
            )}
            {actions.includes('edit') && (
              <Tooltip title="Edit">
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(record)}
                />
              </Tooltip>
            )}
            {actions.includes('delete') && (
              <Popconfirm
                title="Delete this experiment?"
                onConfirm={() => handleDelete(record.id)}
              >
                <Button type="link" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
            <Tooltip title="View Istio YAML">
              <Button
                type="link"
                icon={<FileTextOutlined />}
                onClick={() => handleViewYAML(record)}
              />
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  const renderFaultConfigPanel = (faultType) => {
    if (faultType === 'delay') {
      return (
        <Collapse defaultActiveKey={['1']} style={{ marginBottom: 16 }}>
          <Panel header="Delay Configuration" key="1">
            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item
                  name={['delay', 'min_ms']}
                  label="Min Delay (ms)"
                  rules={[
                    { required: true },
                    { type: 'number', min: 50, max: 2000 },
                  ]}
                >
                  <InputNumber min={50} max={2000} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  name={['delay', 'max_ms']}
                  label="Max Delay (ms)"
                  rules={[
                    { required: true },
                    { type: 'number', min: 50, max: 2000 },
                  ]}
                >
                  <InputNumber min={50} max={2000} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  name={['delay', 'percent']}
                  label="Affected %"
                  rules={[
                    { required: true },
                    { type: 'number', min: 1, max: 100 },
                  ]}
                >
                  <InputNumber min={1} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>
        </Collapse>
      )
    }
    if (faultType === 'abort') {
      return (
        <Collapse defaultActiveKey={['1']} style={{ marginBottom: 16 }}>
          <Panel header="Abort Configuration" key="1">
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name={['abort', 'http_status']}
                  label="HTTP Status Code"
                  rules={[
                    { required: true },
                    { type: 'number', min: 400, max: 599 },
                  ]}
                >
                  <Select>
                    <Option value={500}>500 - Internal Server Error</Option>
                    <Option value={502}>502 - Bad Gateway</Option>
                    <Option value={503}>503 - Service Unavailable</Option>
                    <Option value={504}>504 - Gateway Timeout</Option>
                    <Option value={429}>429 - Too Many Requests</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name={['abort', 'percent']}
                  label="Affected %"
                  rules={[
                    { required: true },
                    { type: 'number', min: 1, max: 100 },
                  ]}
                >
                  <InputNumber min={1} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>
        </Collapse>
      )
    }
    if (faultType === 'interrupt') {
      return (
        <Collapse defaultActiveKey={['1']} style={{ marginBottom: 16 }}>
          <Panel header="Interrupt Configuration" key="1">
            <Form.Item
              name={['interrupt', 'percent']}
              label="Affected %"
              rules={[
                { required: true },
                { type: 'number', min: 1, max: 100 },
              ]}
            >
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Panel>
        </Collapse>
      )
    }
    if (faultType === 'compound') {
      return (
        <>
          <Alert
            message="Compound Fault"
            description={
              <span>
                Both <strong>delay</strong> and <strong>abort</strong> will be injected in a single
                Istio VirtualService rule. This avoids the Envoy configuration conflict that occurs when
                two separate experiments target the same service.
              </span>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Collapse defaultActiveKey={['1', '2']} style={{ marginBottom: 16 }}>
            <Panel header="Delay Configuration" key="1">
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name={['delay', 'min_ms']}
                    label="Min Delay (ms)"
                    rules={[
                      { type: 'number', min: 50, max: 2000 },
                    ]}
                  >
                    <InputNumber min={50} max={2000} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name={['delay', 'max_ms']}
                    label="Max Delay (ms)"
                    rules={[
                      { type: 'number', min: 50, max: 2000 },
                    ]}
                  >
                    <InputNumber min={50} max={2000} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name={['delay', 'percent']}
                    label="Affected %"
                    rules={[
                      { type: 'number', min: 0, max: 100 },
                    ]}
                  >
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Leave delay fields empty to skip delay injection
              </Text>
            </Panel>
            <Panel header="Abort Configuration" key="2">
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name={['abort', 'http_status']}
                    label="HTTP Status Code"
                    rules={[
                      { type: 'number', min: 400, max: 599 },
                    ]}
                  >
                    <Select allowClear>
                      <Option value={500}>500 - Internal Server Error</Option>
                      <Option value={502}>502 - Bad Gateway</Option>
                      <Option value={503}>503 - Service Unavailable</Option>
                      <Option value={504}>504 - Gateway Timeout</Option>
                      <Option value={429}>429 - Too Many Requests</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name={['abort', 'percent']}
                    label="Affected %"
                    rules={[
                      { type: 'number', min: 0, max: 100 },
                    ]}
                  >
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Leave abort fields empty to skip abort injection
              </Text>
            </Panel>
          </Collapse>
        </>
      )
    }
    return null
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ marginTop: 0 }}>
          Experiments
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            New Experiment
          </Button>
        </Space>
      </div>

      {conflictWarning && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message={
            <Space>
              <span>
                <strong>Conflict:</strong> Cannot start experiment "{conflictWarning.experiment?.name}"
              </span>
              <Button
                size="small"
                type="link"
                onClick={() => setConflictWarning(null)}
              >
                Dismiss
              </Button>
            </Space>
          }
          description={
            <div>
              <Paragraph style={{ marginBottom: 8 }}>
                Target <Text code>{conflictWarning.target}</Text> already has an active{' '}
                <Tag color={faultTypeColors[conflictWarning.existing_type]}>
                  {faultTypeLabels[conflictWarning.existing_type] || conflictWarning.existing_type}
                </Tag>{' '}
                fault (experiment: <Text code>{conflictWarning.experiment_id?.substring(0, 8)}...</Text>).
              </Paragraph>
              <Paragraph style={{ marginBottom: 0 }}>
                <Text type="secondary">
                  Solutions:
                </Text>
                <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                  <li>Stop the conflicting experiment first, then retry</li>
                  <li>
                    Use <Text strong>fault_type="compound"</Text> to combine delay + abort in a
                    single VirtualService rule (no conflict)
                  </li>
                  <li>Interrupt faults cannot be combined with other fault types</li>
                </ul>
              </Paragraph>
            </div>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        dataSource={experiments}
        columns={columns}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title={editExp ? 'Edit Experiment' : 'Create Experiment'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={760}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter experiment name' }]}
          >
            <Input placeholder="Experiment name" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Experiment description" />
          </Form.Item>

          <Form.Item
            name="fault_type"
            label="Fault Type"
            rules={[{ required: true, message: 'Please select fault type' }]}
          >
            <Select>
              <Option value="delay">Delay (50-2000ms)</Option>
              <Option value="abort">Abort (HTTP Error)</Option>
              <Option value="interrupt">Interrupt (Connection Reset)</Option>
              <Option value="compound">
                Compound (Delay + Abort in single rule) — Recommended
              </Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.fault_type !== cur.fault_type}>
            {({ getFieldValue }) => {
              const faultType = getFieldValue('fault_type')
              return renderFaultConfigPanel(faultType)
            }}
          </Form.Item>

          <Form.Item
            name="targets"
            label="Target Services"
            rules={[{ required: true, message: 'Please add at least one target' }]}
          >
            <Form.List name="targets">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'service']}
                        rules={[{ required: true }]}
                        noStyle
                      >
                        <Select placeholder="Service" style={{ width: 160 }}>
                          {services.map((s) => (
                            <Option key={s} value={s}>
                              {s}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'namespace']}
                        rules={[{ required: true }]}
                        noStyle
                      >
                        <Input placeholder="Namespace" style={{ width: 120 }} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'subset']}
                        noStyle
                      >
                        <Input placeholder="Subset" style={{ width: 100 }} />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(name)}>
                        Remove
                      </Button>
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Add Target
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item
            name="duration"
            label="Duration"
            rules={[{ required: true, message: 'Please enter duration' }]}
          >
            <Select placeholder="Select duration">
              <Option value="30s">30 seconds</Option>
              <Option value="1m">1 minute</Option>
              <Option value="3m">3 minutes</Option>
              <Option value="5m">5 minutes</Option>
              <Option value="10m">10 minutes</Option>
              <Option value="30m">30 minutes</Option>
              <Option value="1h">1 hour</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Experiment Details"
        open={!!detailExp}
        onCancel={() => setDetailExp(null)}
        footer={null}
        width={680}
      >
        {detailExp && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="ID">
              <Text code>{detailExp.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Name">{detailExp.name}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusColors[detailExp.status]}>
                {detailExp.status.toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              {renderFaultTypeTag(detailExp.fault_type)}
            </Descriptions.Item>
            <Descriptions.Item label="Duration">{detailExp.duration}</Descriptions.Item>
            <Descriptions.Item label="Created">
              {new Date(detailExp.created_at).toLocaleString()}
            </Descriptions.Item>
            {detailExp.started_at && (
              <Descriptions.Item label="Started">
                {new Date(detailExp.started_at).toLocaleString()}
              </Descriptions.Item>
            )}
            {detailExp.completed_at && (
              <Descriptions.Item label="Completed">
                {new Date(detailExp.completed_at).toLocaleString()}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Targets" span={2}>
              {detailExp.targets.map((t) => (
                <Tag key={`${t.service}-${t.namespace}`} style={{ marginBottom: 4 }}>
                  {t.service}.{t.namespace}
                </Tag>
              ))}
            </Descriptions.Item>
            {detailExp.delay && (
              <Descriptions.Item label="Delay Spec" span={2}>
                {detailExp.delay.min_ms}ms - {detailExp.delay.max_ms}ms @ {detailExp.delay.percent}%
              </Descriptions.Item>
            )}
            {detailExp.abort && (
              <Descriptions.Item label="Abort Spec" span={2}>
                HTTP {detailExp.abort.http_status} @ {detailExp.abort.percent}%
              </Descriptions.Item>
            )}
            {detailExp.interrupt && (
              <Descriptions.Item label="Interrupt Spec" span={2}>
                {detailExp.interrupt.percent}%
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="Istio VirtualService YAML"
        open={yamlModalOpen}
        onCancel={() => setYamlModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setYamlModalOpen(false)}>
            Close
          </Button>,
        ]}
        width={720}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 6,
            maxHeight: 500,
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {yamlContent}
        </pre>
      </Modal>

      <Modal
        title={
          <Space>
            <SafetyOutlined style={{ color: '#ff4d4f' }} />
            <span>Blast Radius Assessment</span>
          </Space>
        }
        open={!!blastRadiusModal}
        onCancel={() => setBlastRadiusModal(null)}
        width={640}
        footer={[
          <Button key="cancel" onClick={() => setBlastRadiusModal(null)}>
            Cancel
          </Button>,
          <Button
            key="start"
            type="primary"
            danger
            onClick={() => blastRadiusModal && doStartExperiment(blastRadiusModal.experiment)}
          >
            Start Anyway
          </Button>,
        ]}
      >
        {blastRadiusModal && (
          <div>
            <Alert
              type={blastRadiusModal.has_critical_svc ? 'error' : 'warning'}
              showIcon
              icon={<WarningOutlined />}
              message={
                blastRadiusModal.has_critical_svc
                  ? 'This experiment targets a CRITICAL service!'
                  : 'This experiment has HIGH risk of SLO breach'
              }
              description={
                <span>
                  The safety system has detected that this experiment may cause SLO violations.
                  {blastRadiusModal.has_critical_svc && (
                    <strong> Critical services will be immediately auto-stopped if thresholds are breached.</strong>
                  )}
                </span>
              }
              style={{ marginBottom: 16 }}
            />

            <Row gutter={[16, 16]}>
              {blastRadiusModal.assessments.map((a) => (
                <Col xs={24} key={a.service}>
                  <Card
                    size="small"
                    title={
                      <Space>
                        <Text strong>{a.service}.{a.namespace}</Text>
                        {a.is_critical && (
                          <Tag color="red" icon={<WarningOutlined />}>
                            CRITICAL
                          </Tag>
                        )}
                      </Space>
                    }
                    extra={
                      <Tag
                        color={
                          a.risk_level === 'critical'
                            ? 'red'
                            : a.risk_level === 'high'
                            ? 'orange'
                            : a.risk_level === 'medium'
                            ? 'blue'
                            : 'green'
                        }
                      >
                        Risk: {a.risk_level.toUpperCase()}
                      </Tag>
                    }
                  >
                    <Space direction="vertical" size={8}>
                      <div>
                        <Text type="secondary">Estimated Impact: </Text>
                        <Text>{a.estimated_impact}</Text>
                      </div>
                      {a.has_slo && a.slo_threshold && (
                        <div>
                          <Text type="secondary">SLO Thresholds: </Text>
                          <Space wrap>
                            <Tag>Success ≥ {a.slo_threshold.min_success_rate}%</Tag>
                            <Tag>Error ≤ {a.slo_threshold.max_error_rate}%</Tag>
                            <Tag>Avg Lat ≤ {a.slo_threshold.max_avg_latency_ms}ms</Tag>
                            <Tag>P95 Lat ≤ {a.slo_threshold.max_p95_latency_ms}ms</Tag>
                          </Space>
                        </div>
                      )}
                      {!a.has_slo && (
                        <Tag color="orange">No SLO configured - no auto-protection</Tag>
                      )}
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>

            <div style={{ marginTop: 16 }}>
              <Alert
                type="info"
                showIcon
                message="Safety System Active"
                description={
                  <span>
                    During experiment execution, the safety monitor checks metrics every 5 seconds.
                    If any SLO threshold is breached for longer than the grace period,
                    the experiment will be <strong>automatically stopped</strong>.
                  </span>
                }
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
