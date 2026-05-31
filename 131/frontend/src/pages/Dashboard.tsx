import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Tag, Space, Alert } from 'antd';
import {
  CloudOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { rulesApi, healthApi } from '../services/api';
import { GrayRule } from '../types';

const COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#eb2f96'];

const Dashboard: React.FC = () => {
  const [rules, setRules] = useState<GrayRule[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesData, healthData] = await Promise.all([
        rulesApi.getAll(),
        healthApi.getHealth(),
      ]);
      setRules(rulesData);
      setHealth(healthData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const enabledRules = rules.filter((r) => r.enabled);
  const disabledRules = rules.filter((r) => !r.enabled);

  const upstreamStats = rules.reduce((acc: any, rule) => {
    const type = rule.upstream.type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(upstreamStats).map(([name, value]) => ({
    name: name.toUpperCase(),
    value,
  }));

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>仪表盘</h1>
        <p style={{ color: '#888', marginTop: 8 }}>灰度路由系统概览</p>
      </div>

      {health?.services?.etcd === 'healthy' && (
        <Alert
          message="系统运行正常"
          description="etcd 连接正常，热更新已启用"
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="规则总数"
              value={rules.length}
              prefix={<CloudOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="已启用"
              value={enabledRules.length}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="已禁用"
              value={disabledRules.length}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="系统状态"
              value={health?.services?.etcd === 'healthy' ? '正常' : '异常'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{
                color: health?.services?.etcd === 'healthy' ? '#52c41a' : '#ff4d4f',
              }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card title="上游版本分布" className="card-shadow">
            {pieData.length > 0 ? (
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无数据
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="规则列表" className="card-shadow">
            {rules.length > 0 ? (
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      padding: 12,
                      borderBottom: '1px solid #f0f0f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Space>
                      <Tag color={rule.enabled ? 'green' : 'default'}>
                        {rule.enabled ? '启用' : '禁用'}
                      </Tag>
                      <span>{rule.name}</span>
                    </Space>
                    <Tag
                      color={
                        rule.upstream.type === 'v1'
                          ? 'blue'
                          : rule.upstream.type === 'v2'
                          ? 'green'
                          : 'orange'
                      }
                    >
                      {rule.upstream.type.toUpperCase()}
                    </Tag>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无规则
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
