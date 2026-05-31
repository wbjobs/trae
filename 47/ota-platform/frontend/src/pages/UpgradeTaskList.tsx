import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Space,
  message,
  Popconfirm,
  Row,
  Col,
  InputNumber,
  DatePicker,
  Progress,
  Drawer,
  Descriptions,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  EyeOutlined,
  ForwardOutlined,
} from '@ant-design/icons'
import { upgradeTaskApi, firmwareApi, deviceGroupApi, deviceApi } from '../services/api'
import dayjs from 'dayjs'

const { Option } = Select
const { TextArea } = Input

const UpgradeTaskList = () => {
  const [tasks, setTasks] = useState<any[]>([])
  const [firmwareList, setFirmwareList] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [progressDrawerVisible, setProgressDrawerVisible] = useState(false)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [taskProgress, setTaskProgress] = useState<any[]>([])
  const [form] = Form.useForm()

  useEffect(() => {
    loadTasks()
    loadFirmware()
    loadGroups()
    loadDevices()
  }, [pagination.current, pagination.pageSize])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const response: any = await upgradeTaskApi.getTasks({
        page: pagination.current - 1,
        size: pagination.pageSize,
      })
      if (response.code === 200) {
        setTasks(response.data.content)
        setPagination({
          ...pagination,
          total: response.data.totalElements,
        })
      }
    } catch (error) {
      message.error('加载任务列表失败')
    } finally {
      setLoading(false)
    }
  }

  const loadFirmware = async () => {
    try {
      const response: any = await firmwareApi.getFirmware({ page: 0, size: 100, publishedOnly: true })
      if (response.code === 200) {
        setFirmwareList(response.data.content)
      }
    } catch (error) {
      console.error('加载固件列表失败')
    }
  }

  const loadGroups = async () => {
    try {
      const response: any = await deviceGroupApi.getGroups()
      if (response.code === 200) {
        setGroups(response.data)
      }
    } catch (error) {
      console.error('加载分组失败')
    }
  }

  const loadDevices = async () => {
    try {
      const response: any = await deviceApi.getDevices({ page: 0, size: 1000 })
      if (response.code === 200) {
        setDevices(response.data.content)
      }
    } catch (error) {
      console.error('加载设备列表失败')
    }
  }

  const loadTaskProgress = async (taskId: number) => {
    try {
      const response: any = await upgradeTaskApi.getTaskProgressList(taskId)
      if (response.code === 200) {
        setTaskProgress(response.data)
      }
    } catch (error) {
      message.error('加载升级进度失败')
    }
  }

  const handleCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        firmware: { id: values.firmwareId },
        scheduleTime: values.scheduleTime ? values.scheduleTime.toISOString() : null,
      }

      if (values.targetType === 'GROUP') {
        data.groupId = values.groupId
      } else if (values.targetType === 'DEVICES') {
        data.deviceIds = values.deviceIds
      }

      const response: any = await upgradeTaskApi.createTask(data)
      if (response.code === 200) {
        message.success('任务创建成功')
        setCreateModalVisible(false)
        loadTasks()
      } else {
        message.error(response.message || '创建失败')
      }
    } catch (error) {
      message.error('创建失败')
    }
  }

  const handleExecute = async (id: number) => {
    try {
      const response: any = await upgradeTaskApi.executeTask(id)
      if (response.code === 200) {
        message.success('任务开始执行')
        loadTasks()
      } else {
        message.error(response.message || '执行失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '执行失败')
    }
  }

  const handleCancel = async (id: number) => {
    try {
      const response: any = await upgradeTaskApi.cancelTask(id)
      if (response.code === 200) {
        message.success('任务已取消')
        loadTasks()
      } else {
        message.error(response.message || '取消失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '取消失败')
    }
  }

  const handleContinueGrayscale = async (id: number) => {
    try {
      const response: any = await upgradeTaskApi.continueGrayscaleTask(id)
      if (response.code === 200) {
        message.success('灰度任务继续')
        loadTasks()
      } else {
        message.error(response.message || '操作失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleResumeUpgrade = async (progressId: number) => {
    try {
      const response: any = await upgradeTaskApi.resumeUpgrade(progressId)
      if (response.code === 200) {
        message.success('升级已恢复')
        if (selectedTask) {
          loadTaskProgress(selectedTask.id)
        }
        loadTasks()
      } else {
        message.error(response.message || '恢复失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '恢复失败')
    }
  }

  const handleRetryUpgrade = async (progressId: number) => {
    try {
      const response: any = await upgradeTaskApi.retryUpgrade(progressId)
      if (response.code === 200) {
        message.success('升级已重试')
        if (selectedTask) {
          loadTaskProgress(selectedTask.id)
        }
        loadTasks()
      } else {
        message.error(response.message || '重试失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '重试失败')
    }
  }

  const handleRollback = async (progressId: number) => {
    try {
      const response: any = await upgradeTaskApi.initiateRollback(progressId)
      if (response.code === 200) {
        message.success('回滚已启动')
        if (selectedTask) {
          loadTaskProgress(selectedTask.id)
        }
        loadTasks()
      } else {
        message.error(response.message || '回滚失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '回滚失败')
    }
  }

  const handleViewProgress = async (task: any) => {
    setSelectedTask(task)
    await loadTaskProgress(task.id)
    setProgressDrawerVisible(true)
  }

  const getStatusTag = (status: string) => {
    const statusMap: any = {
      PENDING: { color: 'default', text: '待执行' },
      RUNNING: { color: 'processing', text: '执行中' },
      COMPLETED: { color: 'success', text: '已完成' },
      CANCELLED: { color: 'default', text: '已取消' },
      FAILED: { color: 'error', text: '失败' },
    }
    const info = statusMap[status] || { color: 'default', text: status }
    return <Tag color={info.color}>{info.text}</Tag>
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '固件版本',
      key: 'firmware',
      width: 150,
      render: (_: any, record: any) => record.firmware?.version || '-',
    },
    {
      title: '目标类型',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 100,
      render: (type: string) => ({
        DEVICES: '指定设备',
        GROUP: '设备分组',
        ALL: '全部设备',
      }[type] || type),
    },
    {
      title: '灰度发布',
      dataIndex: 'isGrayscale',
      key: 'isGrayscale',
      width: 100,
      render: (v: boolean, record: any) =>
        v ? (
          <Tag color="orange">是 ({record.grayscalePercentage}%)</Tag>
        ) : (
          <Tag color="default">否</Tag>
        ),
    },
    {
      title: '设备统计',
      key: 'stats',
      width: 200,
      render: (_: any, record: any) => (
        <Space direction="vertical" size={0}>
          <span>总数: {record.totalDevices || 0}</span>
          <Space size="small">
            <span style={{ color: '#52c41a' }}>成功 {record.successDevices || 0}</span>
            <span style={{ color: '#ff4d4f' }}>失败 {record.failedDevices || 0}</span>
            <span style={{ color: '#1890ff' }}>进行中 {record.upgradingDevices || 0}</span>
          </Space>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewProgress(record)}>
            进度
          </Button>
          {record.status === 'PENDING' && (
            <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleExecute(record.id)}>
              执行
            </Button>
          )}
          {record.status === 'RUNNING' && record.isGrayscale && record.pendingDevices > 0 && (
            <Button type="link" size="small" icon={<ForwardOutlined />} onClick={() => handleContinueGrayscale(record.id)}>
              继续
            </Button>
          )}
          {(record.status === 'PENDING' || record.status === 'RUNNING') && (
            <Popconfirm title="确定取消该任务?" onConfirm={() => handleCancel(record.id)}>
              <Button type="link" size="small" danger icon={<StopOutlined />}>
                取消
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const progressColumns = [
    {
      title: '设备ID',
      key: 'device',
      render: (_: any, record: any) => record.device?.deviceId || '-',
    },
    {
      title: '设备名称',
      key: 'deviceName',
      render: (_: any, record: any) => record.device?.name || '-',
    },
    {
      title: '原版本',
      dataIndex: 'oldVersion',
      render: (v: string) => v || '-',
    },
    {
      title: '新版本',
      dataIndex: 'newVersion',
      render: (v: string) => v || '-',
    },
    {
      title: '备份版本',
      dataIndex: 'backupVersion',
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string, record: any) => {
        const map: any = {
          PENDING: <Tag color="default">等待中</Tag>,
          UPGRADING: <Tag color="processing">升级中</Tag>,
          SUCCESS: <Tag color="success">成功</Tag>,
          FAILED: <Tag color="error">失败</Tag>,
          CANCELLED: <Tag color="default">已取消</Tag>,
          ROLLED_BACK: <Tag color="warning">已回滚</Tag>,
          ROLLBACK_FAILED: <Tag color="error">回滚失败</Tag>,
        }
        let statusTag = map[status] || status
        if (record.wasInterrupted) {
          statusTag = (
            <Space>
              {statusTag}
              <Tag color="orange">已中断</Tag>
            </Space>
          )
        }
        if (record.isRollbackInProgress) {
          statusTag = (
            <Space>
              {statusTag}
              <Tag color="processing">回滚中</Tag>
            </Space>
          )
        }
        return statusTag
      },
    },
    {
      title: '进度',
      key: 'progress',
      render: (_: any, record: any) => {
        if (record.status === 'UPGRADING') {
          return <Progress percent={record.progressPercentage || 0} size="small" />
        }
        if (record.isRollbackInProgress) {
          return <Tag color="processing">{record.rollbackStage || '回滚中...'}</Tag>
        }
        return '-'
      },
    },
    {
      title: '当前阶段',
      dataIndex: 'currentStage',
      render: (v: string, record: any) => {
        if (record.wasInterrupted) {
          return (
            <Space>
              <span>{v || '-'}</span>
              <Tag color="orange">中断于: {record.interruptionStage || '未知'}</Tag>
            </Space>
          )
        }
        return v || '-'
      },
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      render: (v: string) => v || '-',
    },
    {
      title: '重试次数',
      key: 'retries',
      render: (_: any, record: any) => (
        <Space>
          <span>升级: {record.retryCount || 0}/3</span>
          <span>恢复: {record.resumeCount || 0}/{record.maxResumeAttempts || 3}</span>
        </Space>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'durationSeconds',
      render: (v: number) => (v ? `${v}秒` : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space size="small">
          {record.wasInterrupted && record.canResume && (
            <Button
              type="link"
              size="small"
              onClick={() => handleResumeUpgrade(record.id)}
              disabled={record.resumeCount >= (record.maxResumeAttempts || 3)}
            >
              恢复
            </Button>
          )}
          {record.status === 'FAILED' && !record.isRollbackInProgress && (
            <Button type="link" size="small" onClick={() => handleRetryUpgrade(record.id)}>
              重试
            </Button>
          )}
          {(record.status === 'FAILED' || record.wasInterrupted) && record.backupVersion && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => handleRollback(record.id)}
              disabled={record.isRollbackInProgress}
            >
              回滚
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>升级任务</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadTasks}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            创建任务
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          onChange: (page, pageSize) => setPagination({ ...pagination, current: page, pageSize }),
        }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="创建升级任务"
        open={createModalVisible}
        onOk={handleSubmit}
        onCancel={() => setCreateModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="任务名称"
                rules={[{ required: true, message: '请输入任务名称' }]}
              >
                <Input placeholder="任务名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="firmwareId"
                label="目标固件"
                rules={[{ required: true, message: '请选择固件' }]}
              >
                <Select placeholder="选择要升级的固件">
                  {firmwareList.map((f) => (
                    <Option key={f.id} value={f.id}>
                      {f.name} ({f.version})
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="任务描述">
            <TextArea rows={2} placeholder="任务描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="targetType"
                label="升级目标"
                rules={[{ required: true, message: '请选择升级目标' }]}
                initialValue="DEVICES"
              >
                <Select>
                  <Option value="DEVICES">指定设备</Option>
                  <Option value="GROUP">设备分组</Option>
                  <Option value="ALL">全部设备</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.targetType !== curr.targetType}
              >
                {({ getFieldValue }) => {
                  const targetType = getFieldValue('targetType')
                  if (targetType === 'GROUP') {
                    return (
                      <Form.Item
                        name="groupId"
                        label="目标分组"
                        rules={[{ required: true, message: '请选择分组' }]}
                      >
                        <Select placeholder="选择设备分组">
                          {groups.map((g) => (
                            <Option key={g.id} value={g.id}>
                              {g.name}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    )
                  }
                  if (targetType === 'DEVICES') {
                    return (
                      <Form.Item
                        name="deviceIds"
                        label="目标设备"
                        rules={[{ required: true, message: '请选择设备' }]}
                      >
                        <Select mode="multiple" placeholder="选择设备" style={{ width: '100%' }}>
                          {devices.map((d) => (
                            <Option key={d.id} value={d.id}>
                              {d.name} ({d.deviceId})
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    )
                  }
                  return null
                }}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="isGrayscale" label="灰度发布" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.isGrayscale !== curr.isGrayscale}
              >
                {({ getFieldValue }) =>
                  getFieldValue('isGrayscale') ? (
                    <Form.Item
                      name="grayscalePercentage"
                      label="灰度比例 (%)"
                      rules={[{ required: true, message: '请输入灰度比例' }]}
                    >
                      <InputNumber min={1} max={100} style={{ width: '100%' }} />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="scheduleTime" label="定时执行">
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="timeoutSeconds" label="超时时间(秒)" initialValue={3600}>
                <InputNumber min={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="maxRetryCount" label="最大重试次数" initialValue={3}>
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isForceUpgrade" label="强制升级" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="升级进度详情"
        placement="right"
        width={1000}
        open={progressDrawerVisible}
        onClose={() => setProgressDrawerVisible(false)}
      >
        {selectedTask && (
          <>
            <Descriptions column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="任务名称">{selectedTask.name}</Descriptions.Item>
              <Descriptions.Item label="固件版本">{selectedTask.firmware?.version}</Descriptions.Item>
              <Descriptions.Item label="任务状态">
                <Badge
                  status={
                    selectedTask.status === 'RUNNING'
                      ? 'processing'
                      : selectedTask.status === 'COMPLETED'
                      ? 'success'
                      : selectedTask.status === 'FAILED'
                      ? 'error'
                      : 'default'
                  }
                  text={
                    {
                      PENDING: '待执行',
                      RUNNING: '执行中',
                      COMPLETED: '已完成',
                      CANCELLED: '已取消',
                      FAILED: '失败',
                    }[selectedTask.status] || selectedTask.status
                  }
                />
              </Descriptions.Item>
              <Descriptions.Item label="设备总数">{selectedTask.totalDevices || 0}</Descriptions.Item>
              <Descriptions.Item label="成功">
                <span style={{ color: '#52c41a' }}>{selectedTask.successDevices || 0}</span>
              </Descriptions.Item>
              <Descriptions.Item label="失败">
                <span style={{ color: '#ff4d4f' }}>{selectedTask.failedDevices || 0}</span>
              </Descriptions.Item>
              <Descriptions.Item label="进行中">
                <span style={{ color: '#1890ff' }}>{selectedTask.upgradingDevices || 0}</span>
              </Descriptions.Item>
              <Descriptions.Item label="等待中">{selectedTask.pendingDevices || 0}</Descriptions.Item>
            </Descriptions>
            <Table
              columns={progressColumns}
              dataSource={taskProgress}
              rowKey="id"
              pagination={{ pageSize: 20 }}
            />
          </>
        )}
      </Drawer>
    </div>
  )
}

export default UpgradeTaskList
