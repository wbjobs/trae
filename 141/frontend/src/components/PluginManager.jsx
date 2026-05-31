import React, { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Upload,
  message,
  Modal,
  Form,
  Input,
  Popconfirm,
  Descriptions,
  Row,
  Col,
} from 'antd'
import {
  UploadOutlined,
  PoweroffOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ExtensionOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { pluginApi } from '../services/api.js'

const PluginManager = () => {
  const [plugins, setPlugins] = useState([])
  const [activePlugin, setActivePlugin] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [uploadForm] = Form.useForm()
  const [wasmFile, setWasmFile] = useState(null)

  const fetchPlugins = async () => {
    setLoading(true)
    try {
      const [pluginsRes, activeRes] = await Promise.all([
        pluginApi.list(),
        pluginApi.getActive(),
      ])
      if (pluginsRes.data.success) {
        setPlugins(pluginsRes.data.data || [])
      }
      if (activeRes.data.success) {
        setActivePlugin(activeRes.data.data.plugin_id || '')
      }
    } catch (error) {
      message.error('获取插件列表失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlugins()
  }, [])

  const handleUpload = async () => {
    if (!wasmFile) {
      message.warning('请选择 Wasm 文件')
      return
    }

    const values = await uploadForm.validateFields()
    const formData = new FormData()
    formData.append('file', wasmFile)
    formData.append('name', values.name)
    formData.append('description', values.description || '')
    formData.append('version', values.version || '1.0.0')

    try {
      const response = await pluginApi.upload(formData)
      if (response.data.success) {
        message.success('插件上传成功')
        setUploadModalVisible(false)
        uploadForm.resetFields()
        setWasmFile(null)
        fetchPlugins()
      } else {
        message.error(response.data.error || '上传失败')
      }
    } catch (error) {
      message.error('上传失败: ' + error.message)
    }
  }

  const handleActivate = async (pluginId) => {
    try {
      const response = await pluginApi.activate(pluginId)
      if (response.data.success) {
        message.success('插件已激活')
        setActivePlugin(pluginId)
      } else {
        message.error(response.data.error || '激活失败')
      }
    } catch (error) {
      message.error('激活失败: ' + error.message)
    }
  }

  const handleDeactivate = async () => {
    try {
      const response = await pluginApi.deactivate()
      if (response.data.success) {
        message.success('插件已停用')
        setActivePlugin('')
      } else {
        message.error(response.data.error || '停用失败')
      }
    } catch (error) {
      message.error('停用失败: ' + error.message)
    }
  }

  const handleDelete = async (pluginId) => {
    try {
      const response = await pluginApi.delete(pluginId)
      if (response.data.success) {
        message.success('插件已删除')
        if (activePlugin === pluginId) {
          setActivePlugin('')
        }
        fetchPlugins()
      } else {
        message.error(response.data.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败: ' + error.message)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => (
        record.id === activePlugin ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            已激活
          </Tag>
        ) : (
          <Tag icon={<StopOutlined />} color="default">
            未激活
          </Tag>
        )
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          {record.id === activePlugin ? (
            <Button
              size="small"
              icon={<PoweroffOutlined />}
              onClick={() => handleDeactivate()}
            >
              停用
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PoweroffOutlined />}
              onClick={() => handleActivate(record.id)}
            >
              激活
            </Button>
          )}
          <Popconfirm
            title="确定删除这个插件吗?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card
            title="当前激活插件"
            size="small"
          >
            {activePlugin ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Plugin ID">
                  <Tag color="green">{activePlugin}</Tag>
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <Tag color="default">未激活任何插件</Tag>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title="插件统计"
            size="small"
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="插件总数">
                {plugins.length}
              </Descriptions.Item>
              <Descriptions.Item label="已激活">
                {activePlugin ? 1 : 0}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card
        title="Wasm 插件列表"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchPlugins}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => setUploadModalVisible(true)}
            >
              上传插件
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={plugins}
          loading={loading}
          rowKey="id"
        />
      </Card>

      <Modal
        title="上传 Wasm 插件"
        open={uploadModalVisible}
        onOk={handleUpload}
        onCancel={() => {
          setUploadModalVisible(false)
          uploadForm.resetFields()
          setWasmFile(null)
        }}
        okText="上传"
        cancelText="取消"
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item
            name="name"
            label="插件名称"
            rules={[{ required: true, message: '请输入插件名称' }]}
          >
            <Input placeholder="输入插件名称" />
          </Form.Item>
          <Form.Item name="description" label="插件描述">
            <Input.TextArea
              placeholder="输入插件描述"
              rows={3}
            />
          </Form.Item>
          <Form.Item name="version" label="版本号">
            <Input placeholder="1.0.0" />
          </Form.Item>
          <Form.Item
            label="Wasm 文件"
            rules={[{ required: true, message: '请选择 Wasm 文件' }]}
          >
            <Upload
              beforeUpload={(file) => {
                setWasmFile(file)
                return false
              }}
              maxCount={1}
              accept=".wasm"
            >
              <Button icon={<ExtensionOutlined />}>
                选择 Wasm 文件
              </Button>
            </Upload>
            {wasmFile && (
              <Tag color="blue" style={{ marginTop: 8 }}>
                {wasmFile.name}
              </Tag>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PluginManager
