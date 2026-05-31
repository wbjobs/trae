import React from 'react';
import { Card, Tag, Progress, List, Alert, Space, Typography, Divider } from 'antd';
import {
  BulbOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { RootCauseAnalysis as RootCauseAnalysisType } from '../types';
import moment from 'moment';

const { Title, Text, Paragraph } = Typography;

interface RootCauseAnalysisPanelProps {
  analysis: RootCauseAnalysisType;
  onClose?: () => void;
}

const RootCauseAnalysisPanel: React.FC<RootCauseAnalysisPanelProps> = ({ analysis, onClose }) => {
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

  const getSeverityText = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return '严重';
      case 'HIGH':
        return '高';
      case 'MEDIUM':
        return '中';
      case 'LOW':
        return '低';
      default:
        return '未知';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return '#ff4d4f';
    if (score >= 0.6) return '#faad14';
    if (score >= 0.4) return '#1890ff';
    return '#52c41a';
  };

  const alert = analysis.alert;

  return (
    <Card
      className="root-cause-analysis-panel"
      style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
    >
      <div style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title level={4} style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ color: '#ff4d4f' }} /> 根因分析结果
          </Title>
          <Space>
            <Tag color={getSeverityColor(analysis.severityLevel)}>
              严重级别: {getSeverityText(analysis.severityLevel)}
            </Tag>
            <Tag icon={<CheckCircleOutlined />} color="green">
              置信度: {(analysis.confidence * 100).toFixed(1)}%
            </Tag>
          </Space>
        </Space>
        <Text type="secondary">
          分析耗时: {analysis.analysisTimeMs}ms · {moment(alert.timestamp).format('YYYY-MM-DD HH:mm:ss')}
        </Text>
      </div>

      <Alert
        message="异常信息"
        description={
          <div>
            <Space direction="vertical" size="small">
              <div>
                <Text strong>指标: </Text>
                <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                  {alert.metricId}
                </code>
              </div>
              <div>
                <Text strong>异常值: </Text>
                <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{alert.value.toFixed(2)}</span>
                <Text type="secondary"> (偏离 {alert.score.toFixed(2)} 倍标准差)</Text>
              </div>
              <div>
                <Text strong>检测算法: </Text>
                <Tag color={alert.algorithm === '3sigma' ? 'blue' : 'purple'}>
                  {alert.algorithm === '3sigma' ? '3σ 统计方法' : '孤立森林'}
                </Tag>
              </div>
              <div>
                <Text strong>数据源: </Text>
                <Tag color="cyan">{alert.source}</Tag>
              </div>
            </Space>
          </div>
        }
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Divider orientation="left">
        <WarningOutlined style={{ color: '#faad14' }} /> 可能的原因
      </Divider>

      <List
        dataSource={analysis.possibleCauses}
        renderItem={(cause, index) => (
          <List.Item key={cause.patternCode}>
            <Card
              size="small"
              style={{ width: '100%', marginBottom: 8 }}
              title={
                <Space>
                  <Text strong>#{index + 1}</Text>
                  <Text strong>{cause.patternName}</Text>
                  <Tag color={getScoreColor(cause.totalScore)}>
                    匹配度: {(cause.totalScore * 100).toFixed(1)}%
                  </Tag>
                </Space>
              }
              extra={
                <Progress
                  type="circle"
                  percent={Math.round(cause.totalScore * 100)}
                  width={50}
                  strokeColor={getScoreColor(cause.totalScore)}
                />
              }
            >
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">可能原因:</Text>
                <Space wrap style={{ marginTop: 4 }}>
                  {cause.possibleCauses.map((c, i) => (
                    <Tag key={i} color="magenta">{c}</Tag>
                  ))}
                </Space>
              </div>
              <div>
                <Text type="secondary">诊断维度:</Text>
                <Space wrap style={{ marginTop: 4 }}>
                  {Object.entries(cause.scoreComponents).map(([key, value]) => (
                    <Tag key={key} color="blue">
                      {key}: {(value * 100).toFixed(0)}%
                    </Tag>
                  ))}
                </Space>
              </div>
            </Card>
          </List.Item>
        )}
      />

      <Divider orientation="left">
        <BulbOutlined style={{ color: '#faad14' }} /> 建议处理方案
      </Divider>

      <Alert
        message="处理建议"
        description={
          <List
            size="small"
            dataSource={analysis.suggestions}
            renderItem={(item) => (
              <List.Item>
                <Space>
                  <InfoCircleOutlined style={{ color: '#1890ff' }} />
                  <Text>{item}</Text>
                </Space>
              </List.Item>
            )}
          />
        }
        type="info"
        showIcon
      />

      <style>{`
        .root-cause-analysis-panel .ant-card-head {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .root-cause-analysis-panel .ant-card-head-title {
          color: white;
        }
      `}</style>
    </Card>
  );
};

export default RootCauseAnalysisPanel;
