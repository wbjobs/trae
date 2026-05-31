import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space, Card } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import { deviceGroupApi } from '../services/api'
import dayjs from 'dayjs'

const DeviceGroupList = () => {
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const response: any = await deviceGroupApi.getGroups()
      if (response.code === 200) {
        setGroups(response.data)
      }
    } catch (error) {
      message.error('加载分组列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingGroup(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (group: any) => {
    setEditingGroup(group)
    form.setFieldsValue(group)
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      const response: any = await deviceGroupApi.deleteGroup(id)
      if (response.code === 200) {
        message.success('删除成功')
        loadGroups()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      let response: any
      if (editingGroup) {
        response = await deviceGroupApi.updateGroup(editingGroup.id, values)
      } else {
        response = await deviceGroupApi.createGroup(values)
      }
      if (response.code === 200) {
        message.success(editingGroup ? '更新成功' : '创建成功')
        setModalVisible(false)
        loadGroups()
      } else {
        message.error(response.message || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '分组名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (v: string) => v || '-',
    },
    {
      title: '设备数量',
      dataIndex: 'deviceCount',
      key: 'deviceCount',
      width: 120,
      render: (count: number) => (
        <Space>
          <TeamOutlined style={{ color: '#1890ff' }} />
          <span>{count || 0} 台</span>
        </Space>
      ),
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
      width: 150,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该分组?"
            description="删除前请确保分组中没有设备"
            onConfirm={() => handleDelete(record.id)}
          >
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
        <h2 style={{ margin: 0 }}>设备分组</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadGroups}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加分组
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>总分组数</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
              {groups.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>总设备数</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
              {groups.reduce((sum: number, g: any) => sum + (g.deviceCount || 0), 0)}
            </div>
          </div>
        </div>
      </Card>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingGroup ? '编辑分组' : '添加分组'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="分组名称"
            rules={[{ required: true, message: '请输入分组名称' }]}
          >
            <Input placeholder="请输入分组名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入分组描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DeviceGroupList
