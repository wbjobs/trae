import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, Tag, Space, message, Popconfirm, Row, Col } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { deviceApi, deviceGroupApi } from '../services/api'
import dayjs from 'dayjs'

const { Option } = Select

const DeviceList = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [modalVisible, setModalVisible] = useState(false)
  const [editingDevice, setEditingDevice] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadDevices()
    loadGroups()
  }, [pagination.current, pagination.pageSize])

  const loadDevices = async () => {
    setLoading(true)
    try {
      const response: any = await deviceApi.getDevices({
        page: pagination.current - 1,
        size: pagination.pageSize,
      })
      if (response.code === 200) {
        setDevices(response.data.content)
        setPagination({
          ...pagination,
          total: response.data.totalElements,
        })
      }
    } catch (error) {
      message.error('加载设备列表失败')
    } finally {
      setLoading(false)
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

  const handleAdd = () => {
    setEditingDevice(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (device: any) => {
    setEditingDevice(device)
    form.setFieldsValue({
      ...device,
      groupId: device.group?.id,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const response: any = await deviceApi.deleteDevice(id)
      if (response.code === 200) {
        message.success('删除成功')
        loadDevices()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const data = {
        ...values,
        group: values.groupId ? { id: values.groupId } : null,
      }

      let response: any
      if (editingDevice) {
        response = await deviceApi.updateDevice(editingDevice.id, data)
      } else {
        response = await deviceApi.createDevice(data)
      }

      if (response.code === 200) {
        message.success(editingDevice ? '更新成功' : '创建成功')
        setModalVisible(false)
        loadDevices()
      } else {
        message.error(response.message || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleAssignGroup = async (deviceId: number, groupId: number | null) => {
    try {
      let response: any
      if (groupId) {
        response = await deviceApi.assignToGroup(deviceId, groupId)
      } else {
        response = await deviceApi.removeFromGroup(deviceId)
      }
      if (response.code === 200) {
        message.success('分组更新成功')
        loadDevices()
      } else {
        message.error(response.message || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '设备ID',
      dataIndex: 'deviceId',
      key: 'deviceId',
      width: 120,
    },
    {
      title: '设备名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '型号',
      dataIndex: 'model',
      key: 'model',
      width: 120,
    },
    {
      title: '固件版本',
      dataIndex: 'firmwareVersion',
      key: 'firmwareVersion',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '硬件版本',
      dataIndex: 'hardwareVersion',
      key: 'hardwareVersion',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 130,
      render: (v: string) => v || '-',
    },
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      width: 150,
      render: (group: any, record: any) => (
        <Select
          style={{ width: 140 }}
          placeholder="选择分组"
          value={group?.id}
          onChange={(value) => handleAssignGroup(record.id, value)}
          allowClear
        >
          {groups.map((g) => (
            <Option key={g.id} value={g.id}>
              {g.name}
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'ONLINE' ? 'success' : 'error'}>
          {status === 'ONLINE' ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: '最后心跳',
      dataIndex: 'lastHeartbeat',
      key: 'lastHeartbeat',
      width: 180,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除该设备?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>设备管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadDevices}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加设备
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={devices}
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
        title={editingDevice ? '编辑设备' : '添加设备'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="deviceId"
            label="设备ID"
            rules={[{ required: true, message: '请输入设备ID' }]}
          >
            <Input placeholder="设备唯一标识" disabled={!!editingDevice} />
          </Form.Item>
          <Form.Item
            name="name"
            label="设备名称"
            rules={[{ required: true, message: '请输入设备名称' }]}
          >
            <Input placeholder="设备名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="设备描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="model" label="型号">
                <Input placeholder="设备型号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="manufacturer" label="制造商">
                <Input placeholder="制造商" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firmwareVersion" label="固件版本">
                <Input placeholder="当前固件版本" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hardwareVersion" label="硬件版本">
                <Input placeholder="硬件版本" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="serialNumber" label="序列号">
                <Input placeholder="序列号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="macAddress" label="MAC地址">
                <Input placeholder="MAC地址" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="groupId" label="分组">
            <Select placeholder="选择分组" allowClear>
              {groups.map((g) => (
                <Option key={g.id} value={g.id}>
                  {g.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="publicKey" label="公钥">
            <Input.TextArea rows={3} placeholder="设备公钥" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DeviceList
