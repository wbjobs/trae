import React, { useState } from 'react'
import {
  Tabs,
  Form,
  Input,
  Button,
  Card,
  message,
  Space,
  List,
  Tag,
  Modal,
  Row,
  Col,
  Table,
  DatePicker,
  InputNumber,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { stateApi } from '../services/api.js'

const StateExplorer = () => {
  const [getKey, setGetKey] = useState('')
  const [getValue, setGetValue] = useState(null)
  const [setForm] = Form.useForm()
  const [bulkGetKeys, setBulkGetKeys] = useState('')
  const [bulkGetResult, setBulkGetResult] = useState(null)
  const [bulkSetItems, setBulkSetItems] = useState([{ key: '', value: '' }])
  const [bulkDeleteKeys, setBulkDeleteKeys] = useState('')
  const [versionKey, setVersionKey] = useState('')
  const [versionHistory, setVersionHistory] = useState([])
  const [timeTravelKey, setTimeTravelKey] = useState('')
  const [timeTravelResult, setTimeTravelResult] = useState(null)
  const [timeTravelTime, setTimeTravelTime] = useState(null)

  const handleGet = async () => {
    if (!getKey) {
      message.warning('请输入 Key')
      return
    }
    try {
      const response = await stateApi.get(getKey)
      if (response.data.success) {
        setGetValue(response.data.data)
      } else {
        message.error(response.data.error || '获取失败')
      }
    } catch (error) {
      message.error('获取失败: ' + error.message)
    }
  }

  const handleSet = async (values) => {
    try {
      const response = await stateApi.set(values.key, values.value)
      if (response.data.success) {
        message.success('设置成功')
        setForm.resetFields()
      } else {
        message.error(response.data.error || '设置失败')
      }
    } catch (error) {
      message.error('设置失败: ' + error.message)
    }
  }

  const handleDelete = async (key) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 Key "${key}" 吗?`,
      onOk: async () => {
        try {
          const response = await stateApi.delete(key)
          if (response.data.success) {
            message.success('删除成功')
          } else {
            message.error(response.data.error || '删除失败')
          }
        } catch (error) {
          message.error('删除失败: ' + error.message)
        }
      },
    })
  }

  const handleBulkGet = async () => {
    if (!bulkGetKeys) {
      message.warning('请输入 Keys')
      return
    }
    const keys = bulkGetKeys.split(',').map((k) => k.trim()).filter(Boolean)
    try {
      const response = await stateApi.bulkGet(keys)
      if (response.data.success) {
        setBulkGetResult(response.data.data.items)
      } else {
        message.error(response.data.error || '批量获取失败')
      }
    } catch (error) {
      message.error('批量获取失败: ' + error.message)
    }
  }

  const handleBulkSet = async () => {
    const items = {}
    bulkSetItems.forEach((item) => {
      if (item.key && item.value) {
        items[item.key] = item.value
      }
    })
    if (Object.keys(items).length === 0) {
      message.warning('请填写有效的 Key-Value')
      return
    }
    try {
      const response = await stateApi.bulkSet(items)
      if (response.data.success) {
        message.success('批量设置成功')
        setBulkSetItems([{ key: '', value: '' }])
      } else {
        message.error(response.data.error || '批量设置失败')
      }
    } catch (error) {
      message.error('批量设置失败: ' + error.message)
    }
  }

  const handleBulkDelete = async () => {
    if (!bulkDeleteKeys) {
      message.warning('请输入 Keys')
      return
    }
    const keys = bulkDeleteKeys.split(',').map((k) => k.trim()).filter(Boolean)
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除 ${keys.length} 个 Key 吗?`,
      onOk: async () => {
        try {
          const response = await stateApi.bulkDelete(keys)
          if (response.data.success) {
            message.success('批量删除成功')
            setBulkDeleteKeys('')
          } else {
            message.error(response.data.error || '批量删除失败')
          }
        } catch (error) {
          message.error('批量删除失败: ' + error.message)
        }
      },
    })
  }

  const handleGetVersionHistory = async () => {
    if (!versionKey) {
      message.warning('请输入 Key')
      return
    }
    try {
      const response = await stateApi.getVersionHistory(versionKey)
      if (response.data.success) {
        setVersionHistory(response.data.data || [])
      } else {
        message.error(response.data.error || '获取版本历史失败')
      }
    } catch (error) {
      message.error('获取版本历史失败: ' + error.message)
    }
  }

  const handleGetAtTime = async () => {
    if (!timeTravelKey) {
      message.warning('请输入 Key')
      return
    }
    if (!timeTravelTime) {
      message.warning('请选择时间')
      return
    }
    try {
      const timestamp = timeTravelTime.toISOString()
      const response = await stateApi.getAtTime(timeTravelKey, timestamp)
      if (response.data.success) {
        setTimeTravelResult(response.data.data)
      } else {
        message.error(response.data.error || '时间旅行查询失败')
      }
    } catch (error) {
      message.error('时间旅行查询失败: ' + error.message)
    }
  }

  const handleDeleteOldVersions = async () => {
    if (!versionKey) {
      message.warning('请输入 Key')
      return
    }
    Modal.confirm({
      title: '确认删除版本历史',
      content: `确定要删除 "${versionKey}" 的所有版本历史吗?`,
      onOk: async () => {
        try {
          const response = await stateApi.deleteOldVersions(versionKey)
          if (response.data.success) {
            message.success('版本历史已删除')
            setVersionHistory([])
          } else {
            message.error(response.data.error || '删除失败')
          }
        } catch (error) {
          message.error('删除失败: ' + error.message)
        }
      },
    })
  }

  const versionColumns = [
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      width: 150,
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp) => dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss.SSS'),
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
      render: (value) => {
        const str = typeof value === 'string' ? value : new TextDecoder().decode(new Uint8Array(value))
        return <Input.TextArea value={str} readOnly autoSize />
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Tag color="blue">v{record.version}</Tag>
      ),
    },
  ]

  return (
    <Tabs
      defaultActiveKey="get"
      items={[
        {
          key: 'get',
          label: 'Get',
          children: (
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Input
                    placeholder="输入 Key"
                    value={getKey}
                    onChange={(e) => setGetKey(e.target.value)}
                    style={{ width: 300 }}
                    allowClear
                  />
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    onClick={handleGet}
                  >
                    查询
                  </Button>
                </Space>
                {getValue && (
                  <Card
                    type="inner"
                    title="查询结果"
                    size="small"
                  >
                    <Row gutter={16}>
                      <Col span={6}>
                        <Tag color="blue">Key</Tag>
                      </Col>
                      <Col span={18}>
                        {getValue.key}
                      </Col>
                      <Col span={6}>
                        <Tag color="green">Value</Tag>
                      </Col>
                      <Col span={18}>
                        <Input.TextArea
                          value={getValue.value}
                          readOnly
                          autoSize
                        />
                      </Col>
                      <Col span={6}>
                        <Tag color={getValue.found ? 'green' : 'red'}>
                          {getValue.found ? 'Found' : 'Not Found'}
                        </Tag>
                      </Col>
                    </Row>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(getValue.key)}
                      style={{ marginTop: 16 }}
                    >
                      删除此 Key
                    </Button>
                  </Card>
                )}
              </Space>
            </Card>
          ),
        },
        {
          key: 'set',
          label: 'Set',
          children: (
            <Card>
              <Form
                form={setForm}
                layout="vertical"
                onFinish={handleSet}
                style={{ maxWidth: 600 }}
              >
                <Form.Item
                  name="key"
                  label="Key"
                  rules={[{ required: true, message: '请输入 Key' }]}
                >
                  <Input placeholder="输入 Key" />
                </Form.Item>
                <Form.Item
                  name="value"
                  label="Value"
                  rules={[{ required: true, message: '请输入 Value' }]}
                >
                  <Input.TextArea
                    placeholder="输入 Value"
                    rows={4}
                  />
                </Form.Item>
                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                  >
                    设置
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          ),
        },
        {
          key: 'delete',
          label: 'Delete',
          children: (
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  placeholder="输入要删除的 Key"
                  id="delete-key-input"
                  style={{ width: 300 }}
                  allowClear
                />
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    const input = document.getElementById('delete-key-input')
                    if (input?.value) {
                      handleDelete(input.value)
                    } else {
                      message.warning('请输入 Key')
                    }
                  }}
                >
                  删除
                </Button>
              </Space>
            </Card>
          ),
        },
        {
          key: 'bulk',
          label: 'Bulk Operations',
          children: (
            <Tabs
              defaultActiveKey="bulkGet"
              items={[
                {
                  key: 'bulkGet',
                  label: 'Bulk Get',
                  children: (
                    <Card>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Input.TextArea
                          placeholder="输入多个 Key，用逗号分隔"
                          value={bulkGetKeys}
                          onChange={(e) => setBulkGetKeys(e.target.value)}
                          rows={3}
                        />
                        <Button
                          type="primary"
                          icon={<SearchOutlined />}
                          onClick={handleBulkGet}
                        >
                          批量查询
                        </Button>
                        {bulkGetResult && (
                          <Card type="inner" title="查询结果">
                            <List
                              dataSource={Object.entries(bulkGetResult)}
                              renderItem={([key, value]) => (
                                <List.Item>
                                  <Space>
                                    <Tag color="blue">{key}</Tag>
                                    <Input
                                      value={value}
                                      readOnly
                                      style={{ width: 400 }}
                                    />
                                  </Space>
                                </List.Item>
                              )}
                            />
                          </Card>
                        )}
                      </Space>
                    </Card>
                  ),
                },
                {
                  key: 'bulkSet',
                  label: 'Bulk Set',
                  children: (
                    <Card>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {bulkSetItems.map((item, index) => (
                          <Row key={index} gutter={8}>
                            <Col span={10}>
                              <Input
                                placeholder="Key"
                                value={item.key}
                                onChange={(e) => {
                                  const newItems = [...bulkSetItems]
                                  newItems[index].key = e.target.value
                                  setBulkSetItems(newItems)
                                }}
                              />
                            </Col>
                            <Col span={10}>
                              <Input
                                placeholder="Value"
                                value={item.value}
                                onChange={(e) => {
                                  const newItems = [...bulkSetItems]
                                  newItems[index].value = e.target.value
                                  setBulkSetItems(newItems)
                                }}
                              />
                            </Col>
                            <Col span={4}>
                              {index === bulkSetItems.length - 1 ? (
                                <Button
                                  icon={<PlusOutlined />}
                                  onClick={() =>
                                    setBulkSetItems([
                                      ...bulkSetItems,
                                      { key: '', value: '' },
                                    ])
                                  }
                                />
                              ) : (
                                <Button
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => {
                                    const newItems = bulkSetItems.filter(
                                      (_, i) => i !== index
                                    )
                                    setBulkSetItems(newItems)
                                  }}
                                />
                              )}
                            </Col>
                          </Row>
                        ))}
                        <Button
                          type="primary"
                          icon={<DatabaseOutlined />}
                          onClick={handleBulkSet}
                        >
                          批量设置
                        </Button>
                      </Space>
                    </Card>
                  ),
                },
                {
                  key: 'bulkDelete',
                  label: 'Bulk Delete',
                  children: (
                    <Card>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Input.TextArea
                          placeholder="输入多个 Key，用逗号分隔"
                          value={bulkDeleteKeys}
                          onChange={(e) => setBulkDeleteKeys(e.target.value)}
                          rows={3}
                        />
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={handleBulkDelete}
                        >
                          批量删除
                        </Button>
                      </Space>
                    </Card>
                  ),
                },
              ]}
            />
          ),
        },
        {
          key: 'versions',
          label: '版本历史',
          children: (
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Input
                    placeholder="输入 Key"
                    value={versionKey}
                    onChange={(e) => setVersionKey(e.target.value)}
                    style={{ width: 300 }}
                    allowClear
                  />
                  <Button
                    type="primary"
                    icon={<HistoryOutlined />}
                    onClick={handleGetVersionHistory}
                  >
                    查询版本历史
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDeleteOldVersions}
                    disabled={!versionKey}
                  >
                    清除版本历史
                  </Button>
                </Space>
                {versionHistory.length > 0 && (
                  <Table
                    dataSource={versionHistory}
                    columns={versionColumns}
                    rowKey="version"
                    size="small"
                    pagination={{ pageSize: 10 }}
                  />
                )}
                {versionHistory.length === 0 && versionKey && (
                  <Tag color="orange">暂无版本历史</Tag>
                )}
              </Space>
            </Card>
          ),
        },
        {
          key: 'timetravel',
          label: '时间旅行',
          children: (
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Input
                    placeholder="输入 Key"
                    value={timeTravelKey}
                    onChange={(e) => setTimeTravelKey(e.target.value)}
                    style={{ width: 200 }}
                    allowClear
                  />
                  <DatePicker
                    showTime={{ format: 'HH:mm:ss.SSS' }}
                    format="YYYY-MM-DD HH:mm:ss.SSS"
                    value={timeTravelTime}
                    onChange={(time) => setTimeTravelTime(time)}
                    style={{ width: 250 }}
                  />
                  <Button
                    type="primary"
                    icon={<ClockCircleOutlined />}
                    onClick={handleGetAtTime}
                  >
                    时间旅行查询
                  </Button>
                </Space>
                {timeTravelResult && (
                  <Card type="inner" title="查询结果" size="small">
                    <Row gutter={16}>
                      <Col span={6}>
                        <Tag color="blue">Key</Tag>
                      </Col>
                      <Col span={18}>
                        {timeTravelResult.key}
                      </Col>
                      <Col span={6}>
                        <Tag color="green">时间点</Tag>
                      </Col>
                      <Col span={18}>
                        {dayjs(timeTravelResult.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
                      </Col>
                      <Col span={6}>
                        <Tag color="cyan">Value</Tag>
                      </Col>
                      <Col span={18}>
                        <Input.TextArea
                          value={timeTravelResult.value}
                          readOnly
                          autoSize
                        />
                      </Col>
                    </Row>
                  </Card>
                )}
              </Space>
            </Card>
          ),
        },
      ]}
    />
  )
}

export default StateExplorer
