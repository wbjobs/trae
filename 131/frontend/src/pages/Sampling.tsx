import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Space,
  Select,
  InputNumber,
  Button,
  Switch,
  Form,
  Alert,
  Divider,
  Progress,
  Tooltip,
  Descriptions,
  Spin,
  message,
} from 'antd';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { samplingApi } from '../services/api';
import { SamplingStats, SampleRecord, SamplingConfig } from '../types';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const SamplingDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SamplingStats | null>(null);
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [config, setConfig] = useState<SamplingConfig | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, samplesData, configData] = await Promise.all([
        samplingApi.getStats(),
        samplingApi.getRecentSamples(100),
        samplingApi.getConfig(),
      ]);
      setStats(statsData);
      setSamples(samplesData);
      setConfig(configData);
      form.setFieldsValue(configData);
    } catch (error) {
      console.error('Failed to load sampling data:', error);
    }
    setLoading(false);
  };

  const handleConfigSave = async (values: Partial<SamplingConfig>) => {
    try {
      const newConfig = await samplingApi.updateConfig(values);
      setConfig(newConfig);
      message.success('采样配置已更新');
    } catch (error) {
      message.error('更新采样配置失败');
    }
  };

  const getUpstreamTypeDistribution = () => {
    if (!stats) return [];
    return Object.entries(stats.upstream_type_distribution).map(([type, count]) => ({
      name: type.toUpperCase(),
      value: count,
    }));
  };

  const getStatusCodeDistribution = () => {
    if (!stats) return [];
    return Object.entries(stats.status_code_distribution).map(([code, count]) => ({
      name: code,
      count,
    }));
  };

  const getLatencyData = () => {
    return samples.slice(0, 50).map((s, index) => ({
      index,
      latency: Math.round(s.latency * 1000),
      upstream: s.upstream_type,
    }));
  };

  const formatLatency = (latency: number) => {
    return (latency * 1000).toFixed(2) + 'ms';
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: number) => new Date(ts).toLocaleString('zh-CN'),
    },
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 80,
      render: (method: string) => <Tag color="blue">{method}</Tag>,
    },
    {
      title: '路径',
      dataIndex: 'uri',
      key: 'uri',
      ellipsis: true,
    },
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 120,
    },
    {
      title: '上游类型',
      dataIndex: 'upstream_type',
      key: 'upstream_type',
      width: 100,
      render: (type: string) => {
        const colors: Record<string, string> = {
          v1: 'green',
          v2: 'blue',
          canary: 'orange',
        };
        return <Tag color={colors[type] || 'default'}>{type.toUpperCase()}</Tag>;
      },
    },
    {
      title: '状态码',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 90,
      render: (code: number) => {
        const color = code >= 500 ? 'red' : code >= 400 ? 'orange' : 'green';
        return <Tag color={color}>{code}</Tag>;
      },
    },
    {
      title: '延迟',
      dataIndex: 'latency',
      key: 'latency',
      width: 100,
      render: (latency: number) => formatLatency(latency),
      sorter: (a: SampleRecord, b: SampleRecord) => a.latency - b.latency,
    },
    {
      title: '匹配规则',
      dataIndex: 'matched_rule',
      key: 'matched_rule',
      width: 100,
      render: (matched: boolean) => (
        <Tag color={matched ? 'green' : 'default'}>
          {matched ? '已匹配' : '默认'}
        </Tag>
      ),
    },
  ];

  if (loading && !stats) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" tip="加载采样数据..." />
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="采样总数"
              value={stats?.total_samples || 0}
              suffix="条"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="采样率"
              value={(stats?.sampling_config.rate || 0) * 100}
              suffix="%"
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="规则匹配率"
              value={stats?.match_rate.percentage || 0}
              suffix="%"
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="平均延迟"
              value={stats?.average_latency_ms || 0}
              suffix="ms"
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="上游类型分布">
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={getUpstreamTypeDistribution()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {getUpstreamTypeDistribution().map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {stats && (
              <Descriptions column={2} size="small">
                <Descriptions.Item label="V1">
                  {stats.upstream_type_distribution.v1 || 0}
                </Descriptions.Item>
                <Descriptions.Item label="V2">
                  {stats.upstream_type_distribution.v2 || 0}
                </Descriptions.Item>
                <Descriptions.Item label="Canary">
                  {stats.upstream_type_distribution.canary || 0}
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="状态码分布">
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={getStatusCodeDistribution()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#1890ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="延迟趋势 (最近50条)">
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={getLatencyData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <RechartsTooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="#1890ff"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title="采样配置"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button onClick={loadData}>刷新</Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="inline"
          onFinish={handleConfigSave}
          initialValues={config}
        >
          <Form.Item name="enabled" label="启用采样" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="rate" label="采样率">
            <InputNumber
              min={0}
              max={1}
              step={0.01}
              formatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
              parser={(value) => String(Number(value?.replace('%', '')) / 100)}
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              保存配置
            </Button>
          </Form.Item>
        </Form>

        {config?.kafka_enabled && (
          <Alert
            message="Kafka 集成"
            description={`采样数据正在发送到 Kafka topic: ${config.kafka_topic}`}
            type="success"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      <Card
        title="最近采样记录"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button onClick={loadData}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={samples}
          rowKey={(record) => `${record.timestamp}-${record.uri}`}
          pagination={{ pageSize: 10 }}
          size="small"
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  );
};

export default SamplingDashboard;
