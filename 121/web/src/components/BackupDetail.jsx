import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Descriptions,
  Table,
  Tag,
  Modal,
  Form,
  Select,
  message,
  Spin,
  Popconfirm,
  Statistic,
  Row,
  Col,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  DatabaseOutlined,
  CloudOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
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

const preCheckStatusConfig = {
  Passed: { icon: <CheckCircleOutlined />, color: 'green', text: '通过' },
  Warning: { icon: <WarningOutlined />, color: 'orange', text: '警告' },
  Failed: { icon: <CloseCircleOutlined />, color: 'red', text: '失败' },
  Skipped: { icon: <ClockCircleOutlined />, color: 'default', text: '跳过' },
};

export default function BackupDetail({ backup, onBack, refreshKey, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [form] = Form.useForm();

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [detailRes, recordsRes] = await Promise.all([
        backupApi.get(backup.namespace, backup.name),
        backupApi.listRecords(backup.namespace, backup.name),
      ]);
      setDetail(detailRes.data);
      setRecords(recordsRes.data || []);
    } catch (err) {
      message.error('获取详情失败');
    } finally {
      setLoading(false);
    }
  }, [backup.namespace, backup.name, refreshKey]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleTrigger = async () => {
    try {
      await backupApi.trigger(backup.namespace, backup.name);
      message.success('备份任务已触发');
      setTimeout(fetchDetail, 2000);
    } catch (err) {
      message.error('触发备份失败');
    }
  };

  const handleRestore = async () => {
    try {
      const values = await form.validateFields();
      setRestoring(true);
      await backupApi.restore(backup.namespace, backup.name, values);
      message.success('恢复任务已完成');
      setRestoreModal(false);
      form.resetFields();
    } catch (err) {
      if (err.errorFields) return;
      message.error('恢复失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setRestoring(false);
    }
  };

  const recordColumns = [
    {
      title: '备份名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '大小',
      dataIndex: 'sizeHuman',
      key: 'sizeHuman',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={statusColor[status] || 'default'}>
          {statusText[status] || status}
        </Tag>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '完成时间',
      dataIndex: 'finishTime',
      key: 'finishTime',
      render: (time) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: 'S3 路径',
      dataIndex: 's3Path',
      key: 's3Path',
      render: (path) => path || '-',
    },
    {
      title: '错误',
      dataIndex: 'error',
      key: 'error',
      render: (error) => error || '-',
    },
  ];

  const completedRecords = records.filter((r) => r.status === 'Completed');

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          title="备份任务详情"
          extra={
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                返回
              </Button>
              <Button icon={<ReloadOutlined />} onClick={onRefresh}>
                刷新
              </Button>
              <Popconfirm
                title="确定要手动触发备份吗？"
                onConfirm={handleTrigger}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  disabled={detail?.currentStatus === 'Running'}
                >
                  手动备份
                </Button>
              </Popconfirm>
              <Button
                type="primary"
                danger
                onClick={() => setRestoreModal(true)}
                disabled={completedRecords.length === 0}
              >
                恢复数据库
              </Button>
            </Space>
          }
        >
          {detail && (
            <>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="middle">
                <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
                <Descriptions.Item label="命名空间">{detail.namespace}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColor[detail.currentStatus] || 'default'}>
                    {statusText[detail.currentStatus] || detail.currentStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="MySQL 主机">{detail.mysqlHost}</Descriptions.Item>
                <Descriptions.Item label="数据库">{detail.mysqlDatabase}</Descriptions.Item>
                <Descriptions.Item label="S3 存储桶">{detail.s3Bucket}</Descriptions.Item>
                <Descriptions.Item label="调度策略">{detail.schedule || '手动'}</Descriptions.Item>
                <Descriptions.Item label="保留天数">{detail.retentionDays || 7} 天</Descriptions.Item>
                <Descriptions.Item label="上次备份">
                  {detail.lastBackupTime
                    ? dayjs(detail.lastBackupTime).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="下次备份">
                  {detail.nextBackupTime
                    ? dayjs(detail.nextBackupTime).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="重试次数">
                  {detail.retryCount > 0
                    ? `${detail.retryCount} / 10`
                    : '0'}
                </Descriptions.Item>
                <Descriptions.Item label="上次错误" span={3}>
                  {detail.lastError || '-'}
                </Descriptions.Item>
              </Descriptions>

              <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="备份记录总数"
                      value={records.length}
                      prefix={<HistoryOutlined />}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="成功备份数"
                      value={completedRecords.length}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<DatabaseOutlined />}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic
                      title="S3 存储使用"
                      value={
                        records
                          .filter((r) => r.status === 'Completed')
                          .reduce((sum, r) => sum + (r.size || 0), 0)
                      }
                      formatter={(value) => {
                        const units = ['B', 'KB', 'MB', 'GB'];
                        let size = value;
                        let unit = 0;
                        while (size >= 1024 && unit < units.length - 1) {
                          size /= 1024;
                          unit++;
                        }
                        return `${size.toFixed(1)} ${units[unit]}`;
                      }}
                      prefix={<CloudOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Card>

        <Card title="备份历史记录">
          <Table
            columns={recordColumns}
            dataSource={records}
            rowKey="name"
            pagination={{ pageSize: 10 }}
          />
        </Card>

        {detail?.lastPreCheck && (
          <Card
            title={
              <Space>
                <SafetyCertificateOutlined />
                <span>预校验报告</span>
                {detail.lastPreCheck.passed ? (
                  <Tag color="green">全部通过</Tag>
                ) : (
                  <Tag color="red">存在问题</Tag>
                )}
                <span style={{ color: '#999', fontSize: 12 }}>
                  {dayjs(detail.lastPreCheck.checkedAt).format('YYYY-MM-DD HH:mm:ss')}
                </span>
              </Space>
            }
          >
            {!detail.lastPreCheck.passed && (
              <Alert
                type="error"
                showIcon
                message="上次预校验未通过，备份任务可能被跳过"
                description="请检查下方预校验项并修复问题后重新触发备份。"
                style={{ marginBottom: 16 }}
              />
            )}

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card size="small" type="inner" title="预校验摘要">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="数据库大小">
                      {detail.lastPreCheck.dbSize || '未知'}
                    </Descriptions.Item>
                    <Descriptions.Item label="预估备份时长">
                      {detail.lastPreCheck.estimatedDuration || '未知'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" type="inner" title="预校验项详情">
                  {detail.lastPreCheck.results.map((item) => {
                    const config = preCheckStatusConfig[item.status] || preCheckStatusConfig.Skipped;
                    return (
                      <div key={item.name} style={{ marginBottom: 8 }}>
                        <Space>
                          <span style={{ color: config.color }}>{config.icon}</span>
                          <strong>{item.name}</strong>
                          <Tag color={config.color}>{config.text}</Tag>
                        </Space>
                        <div style={{ marginLeft: 24, color: '#666', fontSize: 13 }}>
                          {item.message}
                          {item.detail && (
                            <div style={{ color: '#999', fontSize: 12 }}>
                              {item.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </Col>
            </Row>
          </Card>
        )}
      </Space>

      <Modal
        title="恢复数据库"
        open={restoreModal}
        onCancel={() => {
          setRestoreModal(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleRestore}>
          <Form.Item
            name="backupName"
            label="选择备份文件"
            rules={[{ required: true, message: '请选择要恢复的备份文件' }]}
          >
            <Select
              placeholder="请选择备份文件"
              options={completedRecords.map((r) => ({
                label: `${r.name} (${r.sizeHuman}) - ${dayjs(r.startTime).format('YYYY-MM-DD HH:mm:ss')}`,
                value: r.name,
              }))}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Popconfirm
                title="确定要恢复数据库吗？这将覆盖当前数据库！"
                onConfirm={() => form.submit()}
                okText="确定恢复"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="primary" danger loading={restoring}>
                  开始恢复
                </Button>
              </Popconfirm>
              <Button onClick={() => setRestoreModal(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  );
}
