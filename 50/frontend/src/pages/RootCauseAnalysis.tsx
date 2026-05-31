import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Space,
  Typography,
  Empty,
  Alert,
  Select,
  InputNumber,
  Form,
  Drawer,
  Badge,
  Statistic,
  Row,
  Col,
  Divider,
  Timeline,
} from 'antd';
import {
  ThunderboltOutlined,
  SearchOutlined,
  HistoryOutlined,
  BarChartOutlined,
  RocketOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  AlertOutlined,
  InfoOutlined,
} from '@ant-design/icons';
import RootCauseAnalysisPanel from '../components/RootCauseAnalysisPanel';
import { wsService } from '../services/websocketService';
import { RootCauseAnalysis as RootCauseAnalysisType, AnomalyResult } from '../types';
import moment from 'moment';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;

const RootCauseAnalysisPage: React.FC = () => {
  const [analyses, setAnalyses] = useState<RootCauseAnalysisType[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<RootCauseAnalysisType | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [simulateModalVisible, setSimulateModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [stats, setStats] = useState({
    totalAnalyses: 0,
    highSeverity: 0,
    mediumSeverity: 0,
    lowSeverity: 0,
  });

  useEffect(() => {
    const unsubscribe = wsService.subscribe((message) => {
      if ('type' in message && (message as any).type === 'root_cause') {
        const analysis = message as RootCauseAnalysisType;
        setAnalyses(prev => [analysis, ...prev].slice(0, 100));
        
        setStats(prev => {
          const newStats = { ...prev, totalAnalyses: prev.totalAnalyses + 1 };
          if (analysis.severityLevel === 'CRITICAL' || analysis.severityLevel === 'HIGH') {
            newStats.highSeverity++;
          } else if (analysis.severityLevel === 'MEDIUM') {
            newStats.mediumSeverity++;
          } else {
            newStats.lowSeverity++;
          }
          return newStats;
        });
      }
    });

    return unsubscribe;
  }, []);

  const viewAnalysis = (analysis: RootCauseAnalysisType) => {
    setSelectedAnalysis(analysis);
    setDrawerVisible(true);
  };

  const handleSimulate = async (values: any) => {
    try {
      const response = await axios.post(
        `http://localhost:8085/api/root-cause/simulate?metricId=${values.metricId}&score=${values.score}&algorithm=${values.algorithm}`
      );
      const analysis = response.data;
      setAnalyses(prev => [analysis, ...prev].slice(0, 100));
      setSimulateModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error('Simulation failed:', error);
    }
  };

  const getSeverityColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'red';
      case 'HIGH':
        return 'orange';
      case 'MEDIUM':
        return 'gold';
      case 'LOW':
        return 'blue';
      default:
        return 'default';
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: ['alert', 'timestamp'],
      key: 'timestamp',
      width: 180,
      render: (ts: number) => moment(ts).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a: RootCauseAnalysisType, b: RootCauseAnalysisType) => 
        a.alert.timestamp - b.alert.timestamp,
    },
    {
      title: '指标',
      dataIndex: ['alert', 'metricId'],
      key: 'metricId',
      width: 150,
      render: (id: string) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{id}</code>
      ),
    },
    {
      title: '异常值',
      dataIndex: ['alert', 'value'],
      key: 'value',
      width: 100,
      render: (value: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{value.toFixed(2)}</span>
      ),
    },
    {
      title: '偏离度',
      dataIndex: ['alert', 'score'],
      key: 'score',
      width: 100,
      render: (score: number) => `${score.toFixed(2)}σ`,
    },
    {
      title: '严重级别',
      dataIndex: 'severityLevel',
      key: 'severityLevel',
      width: 100,
      render: (level: string) => (
        <Tag color={getSeverityColor(level)}>
          {level === 'CRITICAL' ? '严重' : 
           level === 'HIGH' ? '高' : 
           level === 'MEDIUM' ? '中' : 
           level === 'LOW' ? '低' : '未知'}
        </Tag>
      ),
      filters: [
        { text: '严重', value: 'CRITICAL' },
        { text: '高', value: 'HIGH' },
        { text: '中', value: 'MEDIUM' },
        { text: '低', value: 'LOW' },
      ],
      onFilter: (value: string, record: RootCauseAnalysisType) => 
        record.severityLevel === value,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      render: (confidence: number) => `${(confidence * 100).toFixed(1)}%`,
      sorter: (a: RootCauseAnalysisType, b: RootCauseAnalysisType) => 
        a.confidence - b.confidence,
    },
    {
      title: '可能原因数',
      key: 'causeCount',
      width: 100,
      render: (_: any, record: RootCauseAnalysisType) => record.possibleCauses.length,
    },
    {
      title: '分析耗时',
      dataIndex: 'analysisTimeMs',
      key: 'analysisTimeMs',
      width: 100,
      render: (ms: number) => `${ms}ms`,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: RootCauseAnalysisType) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => viewAnalysis(record)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ThunderboltOutlined style={{ color: '#ff4d4f' }} /> 异常根因分析
        </Title>
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => setSimulateModalVisible(true)}
          >
            模拟分析
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总分析次数"
              value={stats.totalAnalyses}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="高严重级别"
              value={stats.highSeverity}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="中严重级别"
              value={stats.mediumSeverity}
              prefix={<AlertOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="低严重级别"
              value={stats.lowSeverity}
              prefix={<InfoOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="实时根因分析"
        description="系统自动对每个异常进行根因分析，结合指标特征、时间模式、历史上下文等多维度数据，智能推断可能原因并提供处理建议。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card>
        {analyses.length > 0 ? (
          <Table
            columns={columns}
            dataSource={analyses}
            rowKey={(record) => `${record.alert.metricId}-${record.alert.timestamp}`}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条分析记录`,
            }}
            scroll={{ x: 1200 }}
          />
        ) : (
          <Empty
            description={
              <div>
                <Text type="secondary">暂无根因分析记录</Text>
                <div style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={() => setSimulateModalVisible(true)}>
                    模拟异常进行测试
                  </Button>
                </div>
              </div>
            }
          />
        )}
      </Card>

      <Drawer
        title="根因分析详情"
        placement="right"
        width={600}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedAnalysis && (
          <RootCauseAnalysisPanel analysis={selectedAnalysis} />
        )}
      </Drawer>

      <Modal
        title="模拟根因分析"
        open={simulateModalVisible}
        onCancel={() => setSimulateModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSimulate}>
          <Form.Item
            name="metricId"
            label="指标ID"
            rules={[{ required: true, message: '请选择指标' }]}
            initialValue="cpu.usage"
          >
            <Select>
              <Option value="cpu.usage">cpu.usage - CPU使用率</Option>
              <Option value="memory.usage">memory.usage - 内存使用率</Option>
              <Option value="network.traffic">network.traffic - 网络流量</Option>
              <Option value="disk.io">disk.io - 磁盘IO</Option>
              <Option value="response.time">response.time - 响应时间</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="score"
            label="异常分数 (偏离倍数)"
            rules={[{ required: true, message: '请输入异常分数' }]}
            initialValue={3.8}
          >
            <InputNumber min={3.0} max={10.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="algorithm"
            label="检测算法"
            rules={[{ required: true, message: '请选择算法' }]}
            initialValue="3sigma"
          >
            <Select>
              <Option value="3sigma">3σ 统计方法</Option>
              <Option value="isolation-forest">孤立森林</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                执行分析
              </Button>
              <Button onClick={() => setSimulateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RootCauseAnalysisPage;
