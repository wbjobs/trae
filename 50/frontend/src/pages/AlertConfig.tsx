import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Tag,
  Space,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import {
  SettingOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  MailOutlined,
  MessageOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import { AlertConfig as AlertConfigType } from '../types';

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const AlertConfig: React.FC = () => {
  const [configs, setConfigs] = useState<AlertConfigType[]>([
    {
      id: '1',
      metricId: 'cpu.usage',
      algorithm: '3sigma',
      enabled: true,
      channels: ['email', 'wechat'],
      threshold: 3.0,
      minInterval: 60,
    },
    {
      id: '2',
      metricId: 'memory.usage',
      algorithm: 'isolation-forest',
      enabled: true,
      channels: ['email'],
      threshold: 0.7,
      minInterval: 120,
    },
    {
      id: '3',
      metricId: 'network.traffic',
      algorithm: '3sigma',
      enabled: false,
      channels: ['sms', 'wechat'],
      threshold: 3.0,
      minInterval: 300,
    },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AlertConfigType | null>(null);
  const [form] = Form.useForm();

  const channelIcons: Record<string, React.ReactNode> = {
    email: <MailOutlined />,
    sms: <MessageOutlined />,
    wechat: <WechatOutlined />,
  };

  const channelColors: Record<string, string> = {
    email: 'blue',
    sms: 'orange',
    wechat: 'green',
  };

  const handleAdd = () => {
    setEditingConfig(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (config: AlertConfigType) => {
    setEditingConfig(config);
    form.setFieldsValue(config);
    setModalVisible(true);
  };

  const handleDelete = (id: string) => {
    setConfigs(prev => prev.filter(c => c.id !== id));
    message.success('配置已删除');
  };

  const handleSubmit = () => {
    form.validateFields().then(values => {
      if (editingConfig) {
        setConfigs(prev =>
          prev.map(c => (c.id === editingConfig.id ? { ...c, ...values } : c))
        );
        message.success('配置已更新');
      } else {
        const newConfig: AlertConfigType = {
          ...values,
          id: Date.now().toString(),
        };
        setConfigs(prev => [...prev, newConfig]);
        message.success('配置已添加');
      }
      setModalVisible(false);
    });
  };

  const handleToggle = (id: string, enabled: boolean) => {
    setConfigs(prev =>
      prev.map(c => (c.id === id ? { ...c, enabled } : c))
    );
    message.success(enabled ? '已启用' : '已禁用');
  };

  const columns = [
    {
      title: '指标ID',
      dataIndex: 'metricId',
      key: 'metricId',
      render: (id: string) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{id}</code>
      ),
    },
    {
      title: '检测算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (algo: string) => (
        <Tag color={algo === '3sigma' ? 'blue' : 'purple'}>
          {algo === '3sigma' ? '3σ 统计方法' : '孤立森林'}
        </Tag>
      ),
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '最小间隔(秒)',
      dataIndex: 'minInterval',
      key: 'minInterval',
    },
    {
      title: '通知渠道',
      dataIndex: 'channels',
      key: 'channels',
      render: (channels: string[]) => (
        <Space>
          {channels.map(ch => (
            <Tag key={ch} icon={channelIcons[ch]} color={channelColors[ch]}>
              {ch === 'email' ? '邮件' : ch === 'sms' ? '短信' : '企业微信'}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, record: AlertConfigType) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: AlertConfigType) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个配置吗？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <SettingOutlined /> 告警配置管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增配置
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 条配置`,
          }}
        />
      </Card>

      <Modal
        title={editingConfig ? '编辑告警配置' : '新增告警配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: true,
            channels: ['email'],
            threshold: 3.0,
            minInterval: 60,
          }}
        >
          <Form.Item
            name="metricId"
            label="指标ID"
            rules={[{ required: true, message: '请输入指标ID' }]}
          >
            <Input placeholder="例如: cpu.usage" />
          </Form.Item>

          <Form.Item
            name="algorithm"
            label="检测算法"
            rules={[{ required: true, message: '请选择检测算法' }]}
          >
            <Select>
              <Option value="3sigma">3σ 统计方法</Option>
              <Option value="isolation-forest">孤立森林</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="threshold"
            label="异常阈值"
            rules={[{ required: true, message: '请输入阈值' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              step={0.1}
              placeholder="3σ方法建议3.0，孤立森林建议0.7"
            />
          </Form.Item>

          <Form.Item
            name="minInterval"
            label="最小告警间隔(秒)"
            rules={[{ required: true, message: '请输入最小间隔' }]}
            tooltip="同一指标的告警最小间隔，避免告警风暴"
          >
            <InputNumber style={{ width: '100%' }} min={10} step={10} />
          </Form.Item>

          <Form.Item
            name="channels"
            label="通知渠道"
            rules={[{ required: true, message: '请选择至少一个通知渠道' }]}
          >
            <Select mode="multiple">
              <Option value="email">邮件通知</Option>
              <Option value="sms">短信通知</Option>
              <Option value="wechat">企业微信通知</Option>
            </Select>
          </Form.Item>

          <Form.Item name="enabled" label="启用配置" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AlertConfig;
