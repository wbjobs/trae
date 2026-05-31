import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Card,
  Space,
  message,
  Popconfirm,
  Upload,
  Switch,
  Tag,
  Typography,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { datasourceApi, DataSource } from '@/api/datasources';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const DataSources: React.FC = () => {
  const [datasources, setDatasources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [selectedType, setSelectedType] = useState<string>('influxdb');

  const fetchDatasources = async () => {
    setLoading(true);
    try {
      const response = await datasourceApi.getAll();
      setDatasources(response.data);
    } catch (error) {
      console.error('Failed to fetch datasources:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasources();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    setSelectedType('influxdb');
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: DataSource) => {
    setEditingId(record.id);
    setSelectedType(record.type);
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      connection_info: JSON.stringify(record.connection_info, null, 2),
      field_mapping: JSON.stringify(record.field_mapping, null, 2),
      is_active: record.is_active,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await datasourceApi.delete(id);
      message.success('删除成功');
      fetchDatasources();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleTest = async (id: number) => {
    try {
      const response = await datasourceApi.test(id);
      if (response.data.success) {
        message.success('连接测试成功');
      } else {
        message.error(`连接测试失败: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Failed to test:', error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const data = {
        name: values.name,
        type: values.type,
        connection_info: JSON.parse(values.connection_info),
        field_mapping: JSON.parse(values.field_mapping),
        is_active: values.is_active,
      };

      if (editingId) {
        await datasourceApi.update(editingId, data);
        message.success('更新成功');
      } else {
        await datasourceApi.create(data);
        message.success('创建成功');
      }

      setModalVisible(false);
      fetchDatasources();
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const beforeUpload = (file: File, record: DataSource) => {
    const uploadFile = async () => {
      try {
        const response = await datasourceApi.uploadCsv(record.id, file);
        if (response.data.success) {
          message.success(`上传成功，共 ${response.data.records_count} 条记录`);
        }
      } catch (error) {
        console.error('Upload error:', error);
      }
    };
    uploadFile();
    return false;
  };

  const columns: ColumnsType<DataSource> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const colors: Record<string, string> = {
          influxdb: 'blue',
          prometheus: 'orange',
          csv: 'green',
        };
        return <Tag color={colors[type] || 'default'}>{type.toUpperCase()}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: DataSource) => (
        <Space>
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            onClick={() => handleTest(record.id)}
          >
            测试
          </Button>
          {record.type === 'csv' && (
            <Upload
              beforeUpload={(file) => beforeUpload(file, record)}
              showUploadList={false}
            >
              <Button type="link" icon={<UploadOutlined />}>
                上传CSV
              </Button>
            </Upload>
          )}
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除?"
            onConfirm={() => handleDelete(record.id)}
            okText="是"
            cancelText="否"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const getConnectionInfoPlaceholder = () => {
    switch (selectedType) {
      case 'influxdb':
        return JSON.stringify(
          {
            url: 'http://localhost:8086',
            token: 'your-token',
            org: 'your-org',
            bucket: 'your-bucket',
          },
          null,
          2
        );
      case 'prometheus':
        return JSON.stringify(
          {
            url: 'http://localhost:9090',
          },
          null,
          2
        );
      case 'csv':
        return JSON.stringify(
          {
            file_path: '/path/to/data.csv',
          },
          null,
          2
        );
      default:
        return '';
    }
  };

  const getFieldMappingPlaceholder = () => {
    switch (selectedType) {
      case 'influxdb':
        return JSON.stringify(
          {
            measurement: 'data',
            field: 'value',
          },
          null,
          2
        );
      case 'prometheus':
        return JSON.stringify(
          {
            query: 'up',
          },
          null,
          2
        );
      case 'csv':
        return JSON.stringify(
          {
            timestamp: 'timestamp',
            value: 'value',
          },
          null,
          2
        );
      default:
        return '';
    }
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Title level={4}>数据源管理</Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新建数据源
            </Button>
          </Space>
        </Card>

        <Card>
          <Table
            columns={columns}
            dataSource={datasources}
            rowKey="id"
            loading={loading}
          />
        </Card>
      </Space>

      <Modal
        title={editingId ? '编辑数据源' : '新建数据源'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            type: 'influxdb',
            is_active: true,
          }}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="请输入数据源名称" />
          </Form.Item>

          <Form.Item
            label="类型"
            name="type"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select
              onChange={(value) => setSelectedType(value)}
            >
              <Option value="influxdb">InfluxDB</Option>
              <Option value="prometheus">Prometheus</Option>
              <Option value="csv">CSV文件</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="连接信息 (JSON)"
            name="connection_info"
            rules={[{ required: true, message: '请输入连接信息' }]}
          >
            <TextArea
              rows={6}
              placeholder={getConnectionInfoPlaceholder()}
            />
          </Form.Item>

          <Form.Item
            label="字段映射 (JSON)"
            name="field_mapping"
            rules={[{ required: true, message: '请输入字段映射' }]}
          >
            <TextArea
              rows={4}
              placeholder={getFieldMappingPlaceholder()}
            />
          </Form.Item>

          <Form.Item label="启用" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DataSources;
