import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Input, DatePicker, Select, Typography } from 'antd';
import { SearchOutlined, AlertOutlined } from '@ant-design/icons';
import { AnomalyResult } from '../types';
import { wsService } from '../services/websocketService';
import moment from 'moment';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const AlertHistory: React.FC = () => {
  const [alerts, setAlerts] = useState<AnomalyResult[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<AnomalyResult[]>([]);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[moment.Moment, moment.Moment] | null>(null);
  const [algorithmFilter, setAlgorithmFilter] = useState<string>('all');

  useEffect(() => {
    const unsubscribe = wsService.subscribe((message) => {
      if ('isAnomaly' in message && (message as AnomalyResult).isAnomaly) {
        const anomaly = message as AnomalyResult;
        setAlerts(prev => [anomaly, ...prev].slice(0, 2000));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let filtered = alerts;

    if (searchText) {
      filtered = filtered.filter(alert =>
        alert.metricId.toLowerCase().includes(searchText.toLowerCase()) ||
        alert.message.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    if (dateRange && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].valueOf();
      const end = dateRange[1].valueOf();
      filtered = filtered.filter(alert =>
        alert.timestamp >= start && alert.timestamp <= end
      );
    }

    if (algorithmFilter !== 'all') {
      filtered = filtered.filter(alert => alert.algorithm === algorithmFilter);
    }

    setFilteredAlerts(filtered);
  }, [alerts, searchText, dateRange, algorithmFilter]);

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: number) => moment(ts).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a: AnomalyResult, b: AnomalyResult) => a.timestamp - b.timestamp,
    },
    {
      title: '指标ID',
      dataIndex: 'metricId',
      key: 'metricId',
      width: 180,
      render: (id: string) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{id}</code>
      ),
    },
    {
      title: '异常值',
      dataIndex: 'value',
      key: 'value',
      width: 100,
      render: (value: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{value.toFixed(2)}</span>
      ),
    },
    {
      title: '检测算法',
      dataIndex: 'algorithm',
      key: 'algorithm',
      width: 140,
      render: (algo: string) => (
        <Tag color={algo === '3sigma' ? 'blue' : 'purple'}>
          {algo === '3sigma' ? '3σ 统计方法' : '孤立森林'}
        </Tag>
      ),
      filters: [
        { text: '3σ 统计方法', value: '3sigma' },
        { text: '孤立森林', value: 'isolation-forest' },
      ],
    },
    {
      title: '异常分数',
      dataIndex: 'score',
      key: 'score',
      width: 100,
      render: (score: number) => score.toFixed(4),
      sorter: (a: AnomalyResult, b: AnomalyResult) => a.score - b.score,
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      width: 80,
      render: (threshold: number) => threshold.toFixed(2),
    },
    {
      title: '数据源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (source: string) => <Tag color="cyan">{source}</Tag>,
    },
    {
      title: '详细信息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <AlertOutlined /> 告警历史记录
      </Title>

      <Card>
        <Space style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap' }}>
          <Input
            placeholder="搜索指标ID或消息内容"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <RangePicker
            showTime
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [moment.Moment, moment.Moment])}
          />
          <Select
            value={algorithmFilter}
            onChange={setAlgorithmFilter}
            style={{ width: 150 }}
          >
            <Option value="all">全部算法</Option>
            <Option value="3sigma">3σ 统计方法</Option>
            <Option value="isolation-forest">孤立森林</Option>
          </Select>
          <span style={{ color: '#666' }}>
            共 {filteredAlerts.length} 条告警记录
          </span>
        </Space>

        <Table
          columns={columns}
          dataSource={filteredAlerts}
          rowKey={(record) => `${record.metricId}-${record.timestamp}-${record.algorithm}`}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          scroll={{ x: 1400 }}
        />
      </Card>
    </div>
  );
};

export default AlertHistory;
