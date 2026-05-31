import React from 'react';
import { Table, Tag, Space } from 'antd';
import { WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { AnomalyResult } from '../types';
import moment from 'moment';

interface AnomalyListProps {
  anomalies: AnomalyResult[];
  loading?: boolean;
}

const AnomalyList: React.FC<AnomalyListProps> = ({ anomalies, loading }) => {
  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: number) => moment(ts).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '指标ID',
      dataIndex: 'metricId',
      key: 'metricId',
      width: 150,
      render: (id: string) => <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{id}</code>,
    },
    {
      title: '数值',
      dataIndex: 'value',
      key: 'value',
      width: 100,
      render: (value: number) => value.toFixed(2),
    },
    {
      title: '状态',
      dataIndex: 'isAnomaly',
      key: 'isAnomaly',
      width: 100,
      render: (isAnomaly: boolean) => (
        <Tag color={isAnomaly ? 'red' : 'green'} icon={isAnomaly ? <WarningOutlined /> : <CheckCircleOutlined />}>
          {isAnomaly ? '异常' : '正常'}
        </Tag>
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
    },
    {
      title: '异常分数',
      dataIndex: 'score',
      key: 'score',
      width: 100,
      render: (score: number, record: AnomalyResult) => (
        <span style={{ color: record.isAnomaly ? '#ff4d4f' : 'inherit' }}>
          {score.toFixed(4)}
        </span>
      ),
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
      render: (source: string) => (
        <Tag color="cyan">{source}</Tag>
      ),
    },
    {
      title: '详情',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  return (
    <Table
      size="small"
      columns={columns}
      dataSource={anomalies}
      rowKey={(record) => `${record.metricId}-${record.timestamp}-${record.algorithm}`}
      loading={loading}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条记录`,
      }}
      scroll={{ x: 1200 }}
    />
  );
};

export default AnomalyList;
