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
  InputNumber,
  Tabs,
  Divider,
  Descriptions,
  Badge,
  Row,
  Col,
  Upload,
  Checkbox,
  List,
  Timeline,
  Alert,
  Result,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ExportOutlined,
  ImportOutlined,
  DownloadOutlined,
  UploadOutlined,
  BulbOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TableRowSelection } from 'antd/es/table';
import {
  anomalyApi,
  AnomalyDetectionRule,
  AnomalyDetectionRuleCreate,
  AnomalyRecord,
} from '@/api/anomaly';
import { datasourceApi, DataSource } from '@/api/datasources';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const AnomalyDetection: React.FC = () => {
  const [rules, setRules] = useState<AnomalyDetectionRule[]>([]);
  const [records, setRecords] = useState<AnomalyRecord[]>([]);
  const [datasources, setDatasources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [rulesModalVisible, setRulesModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>('3sigma');
  const [selectedRecord, setSelectedRecord] = useState<AnomalyRecord | null>(null);
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [recordForm] = Form.useForm();
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [rootCauseLoading, setRootCauseLoading] = useState(false);
  const [rootCauseResult, setRootCauseResult] = useState<any>(null);
  const [rootCauseModalVisible, setRootCauseModalVisible] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesResponse, recordsResponse, datasourcesResponse] = await Promise.all([
        anomalyApi.getAllRules(),
        anomalyApi.getAllRecords(100),
        datasourceApi.getAll(),
      ]);
      setRules(rulesResponse.data);
      setRecords(recordsResponse.data);
      setDatasources(datasourcesResponse.data);
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddRule = () => {
    setEditingId(null);
    setSelectedAlgorithm('3sigma');
    form.resetFields();
    setRulesModalVisible(true);
  };

  const handleEditRule = (record: AnomalyDetectionRule) => {
    setEditingId(record.id);
    setSelectedAlgorithm(record.algorithm);
    form.setFieldsValue({
      name: record.name,
      datasource_id: record.datasource_id,
      algorithm: record.algorithm,
      params: JSON.stringify(record.params, null, 2),
      window_size: record.window_size,
      threshold: record.threshold,
      min_continuous: record.min_continuous,
      is_active: record.is_active,
    });
    setRulesModalVisible(true);
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await anomalyApi.deleteRule(id);
      message.success('删除成功');
      fetchData();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleRunDetection = async (id: number) => {
    try {
      const response = await anomalyApi.detect(id);
      if (response.data.anomalies_detected > 0) {
        message.success(`检测完成，发现 ${response.data.anomalies_detected} 个异常点，已发送 ${response.data.alerts?.alerts_sent || 0} 条告警`);
      } else {
        message.info('检测完成，未发现异常点');
      }
      fetchData();
    } catch (error) {
      console.error('Failed to detect:', error);
    }
  };

  const handleRuleSubmit = async (values: any) => {
    try {
      const data: AnomalyDetectionRuleCreate = {
        name: values.name,
        datasource_id: values.datasource_id,
        algorithm: values.algorithm,
        params: JSON.parse(values.params),
        window_size: values.window_size,
        threshold: values.threshold,
        min_continuous: values.min_continuous,
      };

      if (editingId) {
        await anomalyApi.updateRule(editingId, { ...data, is_active: values.is_active });
        message.success('更新成功');
      } else {
        await anomalyApi.createRule(data);
        message.success('创建成功');
      }

      setRulesModalVisible(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleViewRecord = (record: AnomalyRecord) => {
    setSelectedRecord(record);
    recordForm.setFieldsValue({
      status: record.status,
      cause: record.cause,
    });
    setRecordModalVisible(true);
  };

  const handleUpdateRecord = async (values: any) => {
    if (!selectedRecord) return;
    
    try {
      await anomalyApi.updateRecord(selectedRecord.id, {
        status: values.status,
        cause: values.cause,
      });
      message.success('更新成功');
      setRecordModalVisible(false);
      fetchData();
    } catch (error) {
      console.error('Failed to update record:', error);
    }
  };

  const handleExportRules = async () => {
    try {
      const ids = selectedRuleIds.length > 0 ? selectedRuleIds : undefined;
      const response = await anomalyApi.exportRules(ids);
      
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `anomaly_rules_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success(`成功导出 ${ids ? ids.length : rules.length} 条规则`);
    } catch (error) {
      console.error('Export failed:', error);
      message.error('导出失败');
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    
    try {
      const response = await anomalyApi.importRules(file);
      setImportResult(response.data);
      
      if (response.data.imported_count > 0) {
        message.success(`成功导入 ${response.data.imported_count} 条规则`);
        fetchData();
      } else {
        message.warning(`没有导入任何规则，请检查数据`);
      }
    } catch (error: any) {
      message.error(`导入失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setImporting(false);
    }
    
    return false;
  };

  const handleRootCauseAnalysis = async (record: AnomalyRecord) => {
    setRootCauseLoading(true);
    setRootCauseResult(null);
    setRootCauseModalVisible(true);
    setSelectedRecord(record);
    
    try {
      const response = await anomalyApi.analyzeRootCause(record.id);
      setRootCauseResult(response.data);
    } catch (error) {
      console.error('Root cause analysis failed:', error);
      message.error('根因分析失败');
    } finally {
      setRootCauseLoading(false);
    }
  };

  const onRuleSelectionChange = (selectedRowKeys: React.Key[]) => {
    setSelectedRuleIds(selectedRowKeys as number[]);
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'red',
      high: 'orange',
      medium: 'gold',
      low: 'green',
    };
    return <Badge color={colors[severity] || 'default'} text={severity.toUpperCase()} />;
  };

  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      new: 'blue',
      investigating: 'orange',
      resolved: 'green',
      ignored: 'gray',
    };
    const labels: Record<string, string> = {
      new: '新建',
      investigating: '调查中',
      resolved: '已解决',
      ignored: '已忽略',
    };
    return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>;
  };

  const ruleColumns: ColumnsType<AnomalyDetectionRule> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '数据源',
      dataIndex: 'datasource_id',
      key: 'datasource',
      render: (id: number) => {
        const ds = datasources.find((d) => d.id === id);
        return ds ? ds.name : `ID: ${id}`;
      },
    },
    {
      title: '算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      render: (algo: string) => {
        const labels: Record<string, string> = {
          '3sigma': '3σ原则',
          moving_average: '移动平均',
          isolation_forest: 'Isolation Forest',
        };
        return labels[algo] || algo;
      },
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
    },
    {
      title: '窗口大小',
      dataIndex: 'window_size',
      key: 'window_size',
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
      title: '操作',
      key: 'actions',
      render: (_: any, record: AnomalyDetectionRule) => (
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => handleRunDetection(record.id)}
          >
            检测
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditRule(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除?"
            onConfirm={() => handleDeleteRule(record.id)}
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

  const recordColumns: ColumnsType<AnomalyRecord> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '值',
      dataIndex: 'value',
      key: 'value',
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => getSeverityBadge(severity),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: AnomalyRecord) => (
        <Space>
          <Button type="link" onClick={() => handleViewRecord(record)}>
            详情
          </Button>
          <Button 
            type="link" 
            icon={<BulbOutlined />}
            onClick={() => handleRootCauseAnalysis(record)}
          >
            根因分析
          </Button>
        </Space>
      ),
    },
  ];

  const getParamsPlaceholder = () => {
    switch (selectedAlgorithm) {
      case 'isolation_forest':
        return JSON.stringify({ contamination: 0.01 }, null, 2);
      case '3sigma':
      case 'moving_average':
      default:
        return JSON.stringify({}, null, 2);
    }
  };

  const stats = {
    total: records.length,
    new: records.filter((r) => r.status === 'new').length,
    investigating: records.filter((r) => r.status === 'investigating').length,
    resolved: records.filter((r) => r.status === 'resolved').length,
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card>
          <Title level={4}>异常检测配置</Title>
        </Card>

        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats.total}</div>
                <div style={{ color: '#999' }}>总异常数</div>
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
                  {stats.new}
                </div>
                <div style={{ color: '#999' }}>新建</div>
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fa8c16' }}>
                  {stats.investigating}
                </div>
                <div style={{ color: '#999' }}>调查中</div>
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                  {stats.resolved}
                </div>
                <div style={{ color: '#999' }}>已解决</div>
              </div>
            </Card>
          </Col>
        </Row>

        <Card>
          <Tabs defaultActiveKey="1">
            <TabPane tab="检测规则" key="1">
              <Space style={{ width: '100%', marginBottom: 16, justifyContent: 'space-between' }}>
                <Space>
                  <Text type="secondary">
                    已选择 {selectedRuleIds.length} 条规则
                  </Text>
                </Space>
                <Space>
                  <Upload
                    beforeUpload={handleImportFile}
                    showUploadList={false}
                    accept=".json"
                  >
                    <Button icon={<ImportOutlined />} loading={importing}>
                      导入
                    </Button>
                  </Upload>
                  <Button 
                    icon={<ExportOutlined />} 
                    onClick={handleExportRules}
                  >
                    导出 {selectedRuleIds.length > 0 ? `(${selectedRuleIds.length})` : '(全部)'}
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRule}>
                    新建规则
                  </Button>
                </Space>
              </Space>
              <Table
                columns={ruleColumns}
                dataSource={rules}
                rowKey="id"
                loading={loading}
                rowSelection={{
                  selectedRowKeys: selectedRuleIds,
                  onChange: onRuleSelectionChange,
                }}
              />
            </TabPane>
            <TabPane tab="异常记录" key="2">
              <Table
                columns={recordColumns}
                dataSource={records}
                rowKey="id"
                loading={loading}
              />
            </TabPane>
          </Tabs>
        </Card>
      </Space>

      <Modal
        title={editingId ? '编辑检测规则' : '新建检测规则'}
        open={rulesModalVisible}
        onCancel={() => setRulesModalVisible(false)}
        onOk={() => form.submit()}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleRuleSubmit}
          initialValues={{
            algorithm: '3sigma',
            window_size: 60,
            threshold: 3.0,
            min_continuous: 1,
            is_active: true,
            params: '{}',
          }}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="请输入规则名称" />
          </Form.Item>

          <Form.Item
            label="数据源"
            name="datasource_id"
            rules={[{ required: true, message: '请选择数据源' }]}
          >
            <Select placeholder="请选择数据源">
              {datasources.map((ds) => (
                <Option key={ds.id} value={ds.id}>
                  {ds.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="算法"
                name="algorithm"
                rules={[{ required: true, message: '请选择算法' }]}
              >
                <Select
                  onChange={(value) => setSelectedAlgorithm(value)}
                >
                  <Option value="3sigma">3σ原则</Option>
                  <Option value="moving_average">移动平均</Option>
                  <Option value="isolation_forest">Isolation Forest</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="阈值"
                name="threshold"
                rules={[{ required: true, message: '请输入阈值' }]}
              >
                <InputNumber style={{ width: '100%' }} step={0.1} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="窗口大小"
                name="window_size"
                rules={[{ required: true, message: '请输入窗口大小' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="连续异常次数"
                name="min_continuous"
                rules={[{ required: true, message: '请输入连续异常次数' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="算法参数 (JSON)"
            name="params"
            rules={[{ required: true, message: '请输入参数' }]}
          >
            <TextArea
              rows={4}
              placeholder={getParamsPlaceholder()}
            />
          </Form.Item>

          <Form.Item label="启用" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="异常详情"
        open={recordModalVisible}
        onCancel={() => setRecordModalVisible(false)}
        onOk={() => recordForm.submit()}
        width={800}
      >
        {selectedRecord && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="时间">
                {new Date(selectedRecord.timestamp).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="值">{selectedRecord.value}</Descriptions.Item>
              <Descriptions.Item label="严重程度">
                {getSeverityBadge(selectedRecord.severity)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusTag(selectedRecord.status)}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {selectedRecord.description}
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <Form
              form={recordForm}
              layout="vertical"
              onFinish={handleUpdateRecord}
            >
              <Form.Item label="状态" name="status">
                <Select>
                  <Option value="new">新建</Option>
                  <Option value="investigating">调查中</Option>
                  <Option value="resolved">已解决</Option>
                  <Option value="ignored">已忽略</Option>
                </Select>
              </Form.Item>
              <Form.Item label="异常原因" name="cause">
                <TextArea rows={4} placeholder="请输入异常原因" />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal
        title="自动根因分析"
        open={rootCauseModalVisible}
        onCancel={() => setRootCauseModalVisible(false)}
        footer={null}
        width={900}
      >
        {selectedRecord && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              message="异常信息"
              type="warning"
              showIcon
              description={
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text strong>时间:</Text> {new Date(selectedRecord.timestamp).toLocaleString()}
                    </Col>
                    <Col span={8}>
                      <Text strong>值:</Text> {selectedRecord.value}
                    </Col>
                    <Col span={8}>
                      <Text strong>严重程度:</Text> {getSeverityBadge(selectedRecord.severity)}
                    </Col>
                  </Row>
                  <Row>
                    <Col span={24}>
                      <Text strong>描述:</Text> {selectedRecord.description}
                    </Col>
                  </Row>
                  <Row>
                    <Col span={24}>
                      <Text strong>状态:</Text> {getStatusTag(selectedRecord.status)}
                    </Col>
                  </Row>
                </Space>
              }
            />

            <Divider />

            {rootCauseLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div>正在进行根因分析...</div>
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">正在分析历史数据和关联指标...</Text>
                </div>
              </div>
            ) : rootCauseResult ? (
              <Space direction="vertical" style={{ width: '100%' }}>
              <Card title="分析结果" type="inner">
                <Timeline mode="left">
                  {rootCauseResult.analysis_steps?.map((step: any, idx: number) => (
                    <Timeline.Item
                      key={idx}
                      color={step.status === 'success' ? 'green' : step.status === 'warning' ? 'orange' : 'blue'}
                    >
                      <Text strong>{step.title}</Text>
                      <div style={{ marginTop: 4 }}>
                        <Paragraph type="secondary">{step.description}</Paragraph>
                      </div>
                      {step.value && (
                        <Tag color={step.value_color || 'blue'}>
                          {step.label || '值'}: {step.value}
                        </Tag>
                      )}
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Card>

              <Card title="可能的根因" type="inner" style={{ marginTop: 16 }}>
                <List
                  dataSource={rootCauseResult.possible_causes}
                  renderItem={(cause: any) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <Badge
                            count={cause.likelihood * 100}
                            showZero
                            style={{ backgroundColor: cause.likelihood > 0.7 ? '#ff4d4f' : cause.likelihood > 0.4 ? '#fa8c16' : '#52c41a' }}
                          />
                      }
                      title={
                        <Space>
                          <Tag color={
                            cause.likelihood > 0.7 ? 'red' : cause.likelihood > 0.4 ? 'orange' : 'green'
                          }>
                            可能性: {Math.round(cause.likelihood * 100)}%
                          </Tag>
                          <Text strong>{cause.cause}</Text>
                        </Space>
                      }
                      description={
                        <Paragraph type="secondary">
                          {cause.description}
                          {cause.suggestion && (
                            <div style={{ marginTop: 8, padding: 8, backgroundColor: '#f6ffed', borderRadius: 4 }}>
                              <BulbOutlined style={{ marginRight: 4 }} />
                              <Text type="success">建议: {cause.suggestion}</Text>
                            </div>
                          )}
                        </Paragraph>
                      }
                    />
                  )}
                />
              </Card>

              <Card title="相关指标" type="inner" style={{ marginTop: 16 }}>
                <Row gutter={16}>
                  {rootCauseResult.related_metrics?.map((metric: any, idx: number) => (
                    <Col span={8} key={idx}>
                      <Card size="small" style={{ marginTop: 16 }}>
                        <Statistic
                          title={metric.name}
                          value={metric.value}
                          valueStyle={{ color: metric.trend === 'up' ? '#ff4d4f' : metric.trend === 'down' ? '#52c41a' : '#1890ff' }}
                          prefix={metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                          suffix={metric.unit}
                        />
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Space>
          ) : (
            <Result
              status="error"
              title="分析失败"
              subTitle="无法完成根因分析，请稍后重试"
            />
          )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default AnomalyDetection;
