import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Upload,
  Switch,
  Tag,
  Space,
  message,
  Popconfirm,
  Progress,
  Row,
  Col,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons'
import { firmwareApi, firmwareDeltaApi } from '../services/api'
import dayjs from 'dayjs'

const FirmwareList = () => {
  const [firmwareList, setFirmwareList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [deltaModalVisible, setDeltaModalVisible] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [editingFirmware, setEditingFirmware] = useState<any>(null)
  const [selectedFirmware, setSelectedFirmware] = useState<any>(null)
  const [deltaList, setDeltaList] = useState<any[]>([])
  const [deltaLoading, setDeltaLoading] = useState(false)
  const [uploadForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [createDeltaForm] = Form.useForm()

  useEffect(() => {
    loadFirmware()
  }, [pagination.current, pagination.pageSize])

  const loadFirmware = async () => {
    setLoading(true)
    try {
      const response: any = await firmwareApi.getFirmware({
        page: pagination.current - 1,
        size: pagination.pageSize,
      })
      if (response.code === 200) {
        setFirmwareList(response.data.content)
        setPagination({
          ...pagination,
          total: response.data.totalElements,
        })
      }
    } catch (error) {
      message.error('加载固件列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    try {
      const values = await uploadForm.validateFields()
      const formData = new FormData()
      formData.append('file', values.file)
      formData.append('name', values.name)
      formData.append('version', values.version)
      formData.append('description', values.description || '')
      formData.append('modelRestriction', values.modelRestriction || '')
      formData.append('hardwareVersionMin', values.hardwareVersionMin || '')
      formData.append('hardwareVersionMax', values.hardwareVersionMax || '')
      formData.append('releaseNotes', values.releaseNotes || '')
      formData.append('encrypt', values.encrypt ? 'true' : 'false')

      setUploading(true)
      const response: any = await firmwareApi.uploadFirmware(formData, (percent) => {
        setUploadProgress(percent)
      })

      if (response.code === 200) {
        message.success('上传成功')
        setUploadModalVisible(false)
        uploadForm.resetFields()
        setUploadProgress(0)
        loadFirmware()
      } else {
        message.error(response.message || '上传失败')
      }
    } catch (error) {
      message.error('上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handlePublish = async (id: number, publish: boolean) => {
    try {
      const response: any = publish
        ? await firmwareApi.publishFirmware(id)
        : await firmwareApi.unpublishFirmware(id)
      if (response.code === 200) {
        message.success(publish ? '发布成功' : '取消发布成功')
        loadFirmware()
      } else {
        message.error(response.message || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const response: any = await firmwareApi.deleteFirmware(id)
      if (response.code === 200) {
        message.success('删除成功')
        loadFirmware()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleEdit = (firmware: any) => {
    setEditingFirmware(firmware)
    editForm.setFieldsValue(firmware)
    setEditModalVisible(true)
  }

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields()
      const response: any = await firmwareApi.updateFirmware(editingFirmware.id, values)
      if (response.code === 200) {
        message.success('更新成功')
        setEditModalVisible(false)
        loadFirmware()
      } else {
        message.error(response.message || '更新失败')
      }
    } catch (error) {
      message.error('更新失败')
    }
  }

  const handleViewDeltas = async (firmware: any) => {
    setSelectedFirmware(firmware)
    setDeltaModalVisible(true)
    loadDeltas(firmware.id)
  }

  const loadDeltas = async (firmwareId: number) => {
    setDeltaLoading(true)
    try {
      const [fromResponse, toResponse]: any = await Promise.all([
        firmwareDeltaApi.getDeltasForFromFirmware(firmwareId),
        firmwareDeltaApi.getDeltasForToFirmware(firmwareId),
      ])
      const deltas = [
        ...(fromResponse.data || []).map((d: any) => ({ ...d, direction: 'from' })),
        ...(toResponse.data || []).map((d: any) => ({ ...d, direction: 'to' })),
      ]
      setDeltaList(deltas)
    } catch (error) {
      message.error('加载差分包列表失败')
    } finally {
      setDeltaLoading(false)
    }
  }

  const handleCreateDelta = async () => {
    try {
      const values = await createDeltaForm.validateFields()
      const response: any = await firmwareDeltaApi.createDelta({
        fromFirmwareId: values.fromFirmwareId,
        toFirmwareId: selectedFirmware.id,
        description: values.description,
      })
      if (response.code === 200) {
        message.success('差分包生成任务已启动')
        loadDeltas(selectedFirmware.id)
        createDeltaForm.resetFields()
      } else {
        message.error(response.message || '创建失败')
      }
    } catch (error) {
      message.error('创建失败')
    }
  }

  const handleGenerateDelta = async (deltaId: number) => {
    try {
      const response: any = await firmwareDeltaApi.generateDelta(deltaId)
      if (response.code === 200) {
        message.success('差分包生成成功')
        loadDeltas(selectedFirmware.id)
      } else {
        message.error(response.message || '生成失败')
      }
    } catch (error) {
      message.error('生成失败')
    }
  }

  const handleDeleteDelta = async (deltaId: number) => {
    try {
      const response: any = await firmwareDeltaApi.deleteDelta(deltaId)
      if (response.code === 200) {
        message.success('删除成功')
        loadDeltas(selectedFirmware.id)
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 100,
      render: (size: number) => {
        if (size < 1024) return size + ' B'
        if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB'
        return (size / (1024 * 1024)).toFixed(2) + ' MB'
      },
    },
    {
      title: '适用型号',
      dataIndex: 'modelRestriction',
      key: 'modelRestriction',
      width: 120,
      render: (v: string) => v || '全部',
    },
    {
      title: '加密',
      dataIndex: 'isEncrypted',
      key: 'isEncrypted',
      width: 80,
      render: (v: boolean) =>
        v ? <LockOutlined style={{ color: '#faad14' }} /> : <UnlockOutlined style={{ color: '#52c41a' }} />,
    },
    {
      title: '状态',
      dataIndex: 'isPublished',
      key: 'isPublished',
      width: 100,
      render: (v: boolean) =>
        v ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            已发布
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="default">
            未发布
          </Tag>
        ),
    },
    {
      title: '升级次数',
      key: 'upgradeCount',
      width: 100,
      render: (_: any, record: any) => (
        <Space>
          <span style={{ color: '#52c41a' }}>成功 {record.successCount || 0}</span>
          <span style={{ color: '#ff4d4f' }}>失败 {record.failureCount || 0}</span>
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
      width: 280,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => firmwareApi.downloadFirmware(record.id)}
          >
            下载
          </Button>
          <Button type="link" size="small" onClick={() => handleViewDeltas(record)}>
            差分升级
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          {record.isPublished ? (
            <Button type="link" size="small" onClick={() => handlePublish(record.id, false)}>
              取消发布
            </Button>
          ) : (
            <Button type="link" size="small" onClick={() => handlePublish(record.id, true)}>
              发布
            </Button>
          )}
          <Popconfirm title="确定删除该固件?" onConfirm={() => handleDelete(record.id)}>
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
        <h2 style={{ margin: 0 }}>固件管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadFirmware}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadModalVisible(true)}>
            上传固件
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={firmwareList}
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
        title="上传固件"
        open={uploadModalVisible}
        onOk={handleUpload}
        onCancel={() => {
          setUploadModalVisible(false)
          uploadForm.resetFields()
          setUploadProgress(0)
        }}
        width={600}
        confirmLoading={uploading}
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item
            name="file"
            label="固件文件"
            rules={[{ required: true, message: '请选择固件文件' }]}
            getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
          >
            <Upload.Dragger
              name="file"
              beforeUpload={() => false}
              maxCount={1}
              fileList={uploadForm.getFieldValue('file') || []}
              onChange={({ fileList }) => uploadForm.setFieldValue('file', fileList[0]?.originFileObj)}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽固件文件到此处上传</p>
              <p className="ant-upload-hint">支持 .bin, .hex, .zip 等格式</p>
            </Upload.Dragger>
          </Form.Item>
          {uploading && (
            <Form.Item>
              <Progress percent={uploadProgress} status="active" />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="固件名称"
                rules={[{ required: true, message: '请输入固件名称' }]}
              >
                <Input placeholder="固件名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="version"
                label="版本号"
                rules={[{ required: true, message: '请输入版本号' }]}
              >
                <Input placeholder="如: 1.0.0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="固件描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="modelRestriction" label="适用型号">
                <Input placeholder="如: EMB-MODEL-1, 留空表示全部" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="encrypt" label="加密传输" valuePropName="checked">
                <Switch defaultChecked />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="hardwareVersionMin" label="最低硬件版本">
                <Input placeholder="如: HW-V1.0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hardwareVersionMax" label="最高硬件版本">
                <Input placeholder="如: HW-V2.0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="releaseNotes" label="发布说明">
            <Input.TextArea rows={3} placeholder="版本更新说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑固件"
        open={editModalVisible}
        onOk={handleEditSubmit}
        onCancel={() => setEditModalVisible(false)}
        width={600}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label="固件名称"
            rules={[{ required: true, message: '请输入固件名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="modelRestriction" label="适用型号">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="hardwareVersionMin" label="最低硬件版本">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hardwareVersionMax" label="最高硬件版本">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="releaseNotes" label="发布说明">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`差分升级管理 - ${selectedFirmware?.name} (${selectedFirmware?.version})`}
        open={deltaModalVisible}
        onCancel={() => {
          setDeltaModalVisible(false)
          setSelectedFirmware(null)
          setDeltaList([])
          createDeltaForm.resetFields()
        }}
        width={900}
        footer={[
          <Button key="close" onClick={() => setDeltaModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <Space style={{ marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>创建新差分包</h4>
        </Space>
        <Form form={createDeltaForm} layout="inline" style={{ marginBottom: 24 }}>
          <Form.Item
            name="fromFirmwareId"
            label="源版本"
            rules={[{ required: true, message: '请选择源版本' }]}
          >
            <Select
              placeholder="选择源固件版本"
              style={{ width: 200 }}
            >
              {firmwareList
                .filter((f) => f.id !== selectedFirmware?.id)
                .map((f) => (
                  <Select.Option key={f.id} value={f.id}>
                    {f.name} ({f.version})
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="差分包描述" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleCreateDelta}>
              生成差分包
            </Button>
          </Form.Item>
        </Form>

        <h4 style={{ margin: '16px 0' }}>差分包列表</h4>
        <Table
          columns={[
            {
              title: '类型',
              key: 'direction',
              width: 80,
              render: (_: any, record: any) =>
                record.direction === 'from' ? (
                  <Tag color="blue">从此升级</Tag>
                ) : (
                  <Tag color="green">升级到此</Tag>
                ),
            },
            {
              title: '源版本',
              key: 'fromVersion',
              render: (_: any, record: any) => record.fromFirmware?.version || '-',
            },
            {
              title: '目标版本',
              key: 'toVersion',
              render: (_: any, record: any) => record.toFirmware?.version || '-',
            },
            {
              title: '原始大小',
              dataIndex: 'originalSize',
              width: 100,
              render: (size: number) =>
                size ? (size / (1024 * 1024)).toFixed(2) + ' MB' : '-',
            },
            {
              title: '差分大小',
              dataIndex: 'fileSize',
              width: 100,
              render: (size: number) =>
                size ? (size / (1024 * 1024)).toFixed(2) + ' MB' : '-',
            },
            {
              title: '压缩率',
              dataIndex: 'compressionRatio',
              width: 100,
              render: (ratio: number) =>
                ratio != null ? (
                  <Tag color={ratio > 50 ? 'success' : ratio > 20 ? 'warning' : 'error'}>
                    {ratio.toFixed(1)}%
                  </Tag>
                ) : (
                  '-'
                ),
            },
            {
              title: '状态',
              dataIndex: 'isGenerated',
              width: 100,
              render: (v: boolean, record: any) =>
                v ? (
                  <Tag color="success">已生成</Tag>
                ) : record.generationError ? (
                  <Tag color="error">生成失败</Tag>
                ) : (
                  <Tag color="processing">生成中</Tag>
                ),
            },
            {
              title: '下载次数',
              dataIndex: 'downloadCount',
              width: 100,
            },
            {
              title: '操作',
              key: 'action',
              width: 200,
              render: (_: any, record: any) => (
                <Space size="small">
                  {record.isGenerated ? (
                    <>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => firmwareDeltaApi.downloadDelta(record.id)}
                      >
                        下载
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => handleGenerateDelta(record.id)}
                    >
                      重新生成
                    </Button>
                  )}
                  <Popconfirm
                    title="确定删除该差分包?"
                    onConfirm={() => handleDeleteDelta(record.id)}
                  >
                    <Button type="link" size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          dataSource={deltaList}
          rowKey="id"
          loading={deltaLoading}
          pagination={false}
          scroll={{ x: 800 }}
          locale={{ emptyText: '暂无差分包' }}
        />
      </Modal>
    </div>
  )
}

export default FirmwareList
