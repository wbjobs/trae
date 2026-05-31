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
  Switch,
  Tag,
  Typography,
  Row,
  Col,
  Tabs,
  Badge,
  Descriptions,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  alertApi,
  AlertRule,
  AlertRuleCreate,
  AlertHistory,
} from '@/api/alerts';
import { anomalyApi, AnomalyDetectionRule } from '@/api/anomaly';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const Alerts: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [anomalyRules, setAnomalyRules] = useState<AnomalyDetectionRule[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [selectedChannelType, setSelectedChannelType] = useState<string>('email');
  const [historyDetailVisible, setHistoryDetailVisible] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<AlertHistory | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesResponse, anomalyRulesResponse] = await Promise.all([
        alertApi.getAllRules(),
        anomalyApi.getAllRules(),
      ]);
      setRules(rulesResponse.data);
      setAnomalyRules(anomalyRulesResponse.data);
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await alertApi.getHistory(undefined, 200);
      setHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    setSelectedChannelType('email');
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: AlertRule) => {
    setEditingId(record.id);
    setSelectedChannelType(record.channel_type);
    form.setFieldsValue({
      name: record.name,
      anomaly_rule_id: record.anomaly_rule_id,
      channel_type: record.channel_type,
      channel_config: JSON.stringify(record.channel_config, null, 2),
      is_active: record.is_active,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await alertApi.deleteRule(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleTest = async (record: AlertRule) => {
    try {
      let success = false;
      let errorMsg = '';
      const config = record.channel_config;
      
      switch (record.channel_type) {
        case 'email':
          const response = await alertApi.testEmail(config.recipients || []);
          success = response.data.success;
          errorMsg = response.data.error_message || '';
          break;
        case 'dingding':
          const dingdingResponse = await alertApi.testDingding(
            config.webhook,
            '测试告警',
            '这是一条测试告警消息'
          );
          success = dingdingResponse.data.success;
          errorMsg = dingdingResponse.data.error_message || '';
          break;
        case 'wechat':
          const wechatResponse = await alertApi.testWechat(
            config.webhook,
            '测试告警',
            '这是一条测试告警消息'
          );
          success = wechatResponse.data.success;
          errorMsg = wechatResponse.data.error_message || '';
          break;
      }

      if (success) {
        message.success('测试成功');
      } else {
        message.error(errorMsg || '测试失败，请检查配置');
      }
    } catch (error) {
      console.error('Failed to test:', error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const data: AlertRuleCreate = {
        name: values.name,
        anomaly_rule_id: values.anomaly_rule_id,
        channel_type: values.channel_type,
        channel_config: JSON.parse(values.channel_config),
      };

      if (editingId) {
        await alertApi.updateRule(editingId, { ...data, is_active: values.is_active });
        message.success('更新成功');
      } else {
        await alertApi.createRule(data);
        message.success('创建成功');
      }

      setModalVisible(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const getChannelTypeTag = (type: string) => {
    const colors: Record<string, string> = {
      email: 'blue',
      dingding: 'purple',
      wechat: 'green',
    };
    const labels: Record<string, string> = {
      email: '邮件',
      dingding: '钉钉',
      wechat: '企业微信',
    };
    return <Tag color={colors[type] || 'default'}>{labels[type] || type}</Tag>;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'success') {
      return <Badge status="success" text={<span style={{ color: '#52c41a' }}>成功</span>} />;
    }
    return <Badge status="error" text={<span style={{ color: '#ff4d4f' }}>失败</span>} />;
  };

  const handleViewHistoryDetail = (record: AlertHistory) => {
    setSelectedHistory(record);
    setHistoryDetailVisible(true);
  };

  const columns: ColumnsType<AlertRule> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '异常规则',
      dataIndex: 'anomaly_rule_id',
      key: 'anomaly_rule',
      render: (id: number) => {
        const rule = anomalyRules.find((r) => r.id === id);
        return rule ? rule.name : `ID: ${id}`;
      },
    },
    {
      title: '通知方式',
      dataIndex: 'channel_type',
      key: 'channel_type',
      render: (type: string) => getChannelTypeTag(type),
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
      render: (_: any, record: AlertRule) => (
        <Space>
          <Button
            type="link"
            icon={<ExperimentOutlined />}
            onClick={() => handleTest(record)}
          >
            测试
          </Button>
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

  const historyColumns: ColumnsType<AlertHistory> = [
    {
      title: '发送时间',
      dataIndex: 'sent_at',
      key: 'sent_at',
      render: (date: string) => new Date(date).toLocaleString(),
      width: 180,
    },
    {
      title: '告警规则',
      dataIndex: 'alert_rule_id',
      key: 'alert_rule',
      render: (id: number) => {
        const rule = rules.find((r) => r.id === id);
        return rule ? rule.name : `ID: ${id}`;
      },
    },
    {
      title: '通知方式',
      dataIndex: 'channel_type',
      key: 'channel_type',
      render: (type: string) => getChannelTypeTag(type),
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusBadge(status),
      width: 100,
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (text: string | null) => (
        <Text type="danger" ellipsis={true} style={{ maxWidth: 400, display: 'inline-block' }}>
          {text || '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: AlertHistory) => (
        <Button type="link" onClick={() => handleViewHistoryDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  const getChannelConfigPlaceholder = () => {
    switch (selectedChannelType) {
      case 'email':
        return JSON.stringify(
          {
            recipients: ['user1@example.com', 'user2@example.com'],
          },
          null,
          2
        );
      case 'dingding':
        return JSON.stringify(
          {
            webhook: 'https://oapi.dingtalk.com/robot/send?access_token=your-token',
          },
          null,
          2
        );
      case 'wechat':
        return JSON.stringify(
          {
            webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=your-key',
          },
          null,
          2
        );
      default:
        return '';
    }
  };

  const stats = {
    total: history.length,
    success: history.filter((h) => h.status === 'success').length,
    failed: history.filter((h) => h.status === 'failed').length,
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card>
          <Title level={4}>告警规则与通知历史</Title>
        </Card>

        <Card>
          <Tabs
            defaultActiveKey="rules"
            onChange={(key) => {
              if (key === 'history') {
                fetchHistory();
              }
            }}
          >
            <TabPane
              tab={
                <span>
                  <EditOutlined />
                  告警规则
                </span>
              }
              key="rules"
            >
              <Space style={{ width: '100%', marginBottom: 16, justifyContent: 'flex-end' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                  新建告警规则
                </Button>
              </Space>
              <Table
                columns={columns}
                dataSource={rules}
                rowKey="id"
                loading={loading}
              />
            </TabPane>

            <TabPane
              tab={
                <span>
                  <HistoryOutlined />
                  通知历史
                  {stats.failed > 0 && (
                    <Badge
                      count={stats.failed}
                      style={{ marginLeft: 8 }}
                      status="error"
                    />
                  )}
                </span>
              }
              key="history"
            >
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="总发送次数"
                      value={stats.total}
                      prefix={<HistoryOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="成功"
                      value={stats.success}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<CheckCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="失败"
                      value={stats.failed}
                      valueStyle={{ color: '#ff4d4f' }}
                      prefix={<CloseCircleOutlined />}
                    />
                  </Card>
                </Col>
              </Row>

              <Button
                icon={<HistoryOutlined />}
                onClick={fetchHistory}
                style={{ marginBottom: 16 }}
              >
                刷新历史
              </Button>

              <Table
                columns={historyColumns}
                dataSource={history}
                rowKey="id"
                loading={historyLoading}
                scroll={{ x: 1200 }}
              />
            </TabPane>
          </Tabs>
        </Card>
      </Space>

      <Modal
        title={editingId ? '编辑告警规则' : '新建告警规则'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            channel_type: 'email',
            is_active: true,
          }}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="请输入告警规则名称" />
          </Form.Item>

          <Form.Item
            label="关联异常检测规则"
            name="anomaly_rule_id"
            rules={[{ required: true, message: '请选择异常检测规则' }]}
          >
            <Select placeholder="请选择异常检测规则">
              {anomalyRules.map((rule) => (
                <Option key={rule.id} value={rule.id}>
                  {rule.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="通知方式"
            name="channel_type"
            rules={[{ required: true, message: '请选择通知方式' }]}
          >
            <Select
              onChange={(value) => setSelectedChannelType(value)}
            >
              <Option value="email">邮件</Option>
              <Option value="dingding">钉钉</Option>
              <Option value="wechat">企业微信</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="通道配置 (JSON)"
            name="channel_config"
            rules={[{ required: true, message: '请输入通道配置' }]}
          >
            <TextArea
              rows={6}
              placeholder={getChannelConfigPlaceholder()}
            />
          </Form.Item>

          <Form.Item label="启用" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="告警历史详情"
        open={historyDetailVisible}
        onCancel={() => setHistoryDetailVisible(false)}
        footer={null}
        width={800}
      >
        {selectedHistory && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="发送时间">
                {new Date(selectedHistory.sent_at).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusBadge(selectedHistory.status)}
              </Descriptions.Item>
              <Descriptions.Item label="告警规则">
                {rules.find((r) => r.id === selectedHistory.alert_rule_id)?.name ||
                  `ID: ${selectedHistory.alert_rule_id}`}
              </Descriptions.Item>
              <Descriptions.Item label="通知方式">
                {getChannelTypeTag(selectedHistory.channel_type)}
              </Descriptions.Item>
              <Descriptions.Item label="异常记录ID">
                {selectedHistory.anomaly_record_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="ID">
                {selectedHistory.id}
              </Descriptions.Item>
            </Descriptions>

            <Card title="错误信息" type="inner">
              {selectedHistory.error_message ? (
                <Paragraph
                  type="danger"
                  style={{
                    backgroundColor: '#fff2f0',
                    padding: 12,
                    borderRadius: 4,
                    border: '1px solid #ffccc7',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedHistory.error_message}
                </Paragraph>
              ) : (
                <Text type="secondary">无错误信息</Text>
              )}
            </Card>

            <Card title="响应数据" type="inner">
              {selectedHistory.response_data ? (
                <pre style={{
                  backgroundColor: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  overflow: 'auto',
                  maxHeight: 300,
                }}>
                  {JSON.stringify(selectedHistory.response_data, null, 2)}
                </pre>
              ) : (
                <Text type="secondary">无响应数据</Text>
              )}
            </Card>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default Alerts;
