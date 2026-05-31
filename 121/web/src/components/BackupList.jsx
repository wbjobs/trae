import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Card,
  Button,
  Space,
  Row,
  Col,
  Statistic,
  Spin,
  message,
  Popconfirm,
} from 'antd';
import {
  ReloadOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { backupApi } from '../api/backup.js';

const statusColor = {
  Pending: 'gold',
  Running: 'blue',
  Completed: 'green',
  Failed: 'red',
};

const statusText = {
  Pending: '等待中',
  Running: '执行中',
  Completed: '已完成',
  Failed: '失败',
};

export default function BackupList({ onSelect, refreshKey, onRefresh }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await backupApi.list();
      setData(res.data || []);
    } catch (err) {
      message.error('获取备份列表失败');
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTrigger = async (record) => {
    try {
      await backupApi.trigger(record.namespace, record.name);
      message.success('备份任务已触发');
      setTimeout(fetchData, 2000);
    } catch (err) {
      message.error('触发备份失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Button type="link" onClick={() => onSelect(record)} style={{ padding: 0 }}>
          {text}
        </Button>
      ),
    },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
    },
    {
      title: 'MySQL 主机',
      dataIndex: 'mysqlHost',
      key: 'mysqlHost',
    },
    {
      title: '数据库',
      dataIndex: 'mysqlDatabase',
      key: 'mysqlDatabase',
    },
    {
      title: '调度',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (text) => text || '手动',
    },
    {
      title: '保留天数',
      dataIndex: 'retentionDays',
      key: 'retentionDays',
      render: (days) => `${days || 7} 天`,
    },
    {
      title: '预校验',
      dataIndex: 'lastPreCheck',
      key: 'lastPreCheck',
      render: (preCheck) => {
        if (!preCheck) return <Tag>未检查</Tag>;
        if (preCheck.passed) return <Tag color="green"><SafetyCertificateOutlined /> 通过</Tag>;
        return <Tag color="red"><SafetyCertificateOutlined /> 未通过</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'currentStatus',
      key: 'currentStatus',
      render: (status, record) => (
        <Space>
          <Tag color={statusColor[status] || 'default'}>
            {statusText[status] || status}
          </Tag>
          {record.retryCount > 0 && (
            <Tag color="orange">重试 {record.retryCount}/10</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '错误信息',
      dataIndex: 'lastError',
      key: 'lastError',
      render: (error) => error || '-',
      ellipsis: true,
      width: 200,
    },
    {
      title: '上次备份',
      dataIndex: 'lastBackupTime',
      key: 'lastBackupTime',
      render: (time) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '下次备份',
      dataIndex: 'nextBackupTime',
      key: 'nextBackupTime',
      render: (time) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Popconfirm
            title="确定要手动触发备份吗？"
            onConfirm={() => handleTrigger(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              disabled={record.currentStatus === 'Running'}
            >
              备份
            </Button>
          </Popconfirm>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onSelect(record)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  const stats = {
    total: data.length,
    running: data.filter((b) => b.currentStatus === 'Running').length,
    completed: data.filter((b) => b.currentStatus === 'Completed').length,
    failed: data.filter((b) => b.currentStatus === 'Failed').length,
  };

  return (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="备份任务总数"
              value={stats.total}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="执行中"
              value={stats.running}
              valueStyle={{ color: '#1677ff' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completed}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="失败"
              value={stats.failed}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="备份任务列表"
        extra={
          <Button icon={<ReloadOutlined />} onClick={onRefresh}>
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey={(record) => `${record.namespace}/${record.name}`}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </Spin>
  );
}
