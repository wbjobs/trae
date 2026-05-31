import React from 'react';
import { Card, Tag, Button, Space, Switch, Tooltip, Badge } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ExperimentOutlined,
  UserOutlined,
  PercentageOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { GrayRule } from '../types';

interface RuleCardProps {
  rule: GrayRule;
  onEdit: (rule: GrayRule) => void;
  onDelete: (rule: GrayRule) => void;
  onToggle: (rule: GrayRule, enabled: boolean) => void;
  onTest: (rule: GrayRule) => void;
}

const getUpstreamColor = (type: string) => {
  switch (type) {
    case 'v1':
      return 'blue';
    case 'v2':
      return 'green';
    case 'canary':
      return 'orange';
    default:
      return 'default';
  }
};

const RuleCard: React.FC<RuleCardProps> = ({ rule, onEdit, onDelete, onToggle, onTest }) => {
  const matchInfo = [];

  if (rule.match?.header && rule.match?.value) {
    matchInfo.push(
      <Tag key="header" color="geekblue">
        {rule.match.header}: {rule.match.value}
      </Tag>
    );
  }

  if (rule.match?.percentage !== undefined) {
    matchInfo.push(
      <Tag key="percentage" color="purple" icon={<PercentageOutlined />}>
        {rule.match.percentage}% 流量
      </Tag>
    );
  }

  if (rule.match?.user_ids && rule.match.user_ids.length > 0) {
    matchInfo.push(
      <Tag key="users" color="cyan" icon={<UserOutlined />}>
        {rule.match.user_ids.length} 个用户
      </Tag>
    );
  }

  if (rule.match?.hash_key) {
    matchInfo.push(
      <Tag key="hash" color="magenta">
        哈希一致性
      </Tag>
    );
  }

  return (
    <Card
      className={`rule-card ${!rule.enabled ? 'rule-card-disabled' : ''}`}
      size="small"
      title={
        <Space>
          <Badge
            status={rule.enabled ? 'success' : 'default'}
            text={
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                {rule.name}
              </span>
            }
          />
          {!rule.enabled && <Tag color="default">已禁用</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Tag
            color={getUpstreamColor(rule.upstream.type)}
            icon={<CloudOutlined />}
            style={{ fontSize: '13px' }}
          >
            {rule.upstream.type.toUpperCase()}
          </Tag>
        </Space>
      }
      actions={[
        <Tooltip title="编辑">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => onEdit(rule)}
          >
            编辑
          </Button>
        </Tooltip>,
        <Tooltip title={rule.enabled ? '禁用' : '启用'}>
          <Button
            type="text"
            icon={rule.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => onToggle(rule, !rule.enabled)}
          >
            {rule.enabled ? '禁用' : '启用'}
          </Button>
        </Tooltip>,
        <Tooltip title="测试">
          <Button
            type="text"
            icon={<ExperimentOutlined />}
            onClick={() => onTest(rule)}
          >
            测试
          </Button>
        </Tooltip>,
        <Tooltip title="删除">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(rule)}
          >
            删除
          </Button>
        </Tooltip>,
      ]}
    >
      {rule.description && (
        <div style={{ marginBottom: 12, color: '#666' }}>{rule.description}</div>
      )}

      <div style={{ marginBottom: 12 }}>
        <span style={{ color: '#888', marginRight: 8 }}>匹配条件：</span>
        <Space wrap>
          {matchInfo.length > 0 ? matchInfo : <Tag color="default">无匹配条件（全部流量）</Tag>}
        </Space>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#888', marginRight: 8 }}>上游地址：</span>
        {rule.upstream.upstream_id ? (
          <Tag color="blue">引用上游: {rule.upstream.upstream_id}</Tag>
        ) : rule.upstream.nodes ? (
          <Space wrap>
            {rule.upstream.nodes.map((node, index) => (
              <Tag key={index} color="blue">
                {node.host}:{node.port}
                {node.weight ? ` (权重: ${node.weight})` : ''}
              </Tag>
            ))}
          </Space>
        ) : (
          <Tag color="red">未配置</Tag>
        )}
      </div>

      <div style={{ color: '#999', fontSize: '12px', marginTop: 12 }}>
        优先级: {rule.priority || 0}
        {rule.updated_at && ` | 更新时间: ${new Date(rule.updated_at).toLocaleString()}`}
      </div>
    </Card>
  );
};

export default RuleCard;
