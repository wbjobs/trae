import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Tabs, Select, Space, Typography } from 'antd';
import { DashboardOutlined, ReloadOutlined } from '@ant-design/icons';
import MetricChart from '../components/MetricChart';
import AnomalyList from '../components/AnomalyList';
import StatisticsPanel from '../components/StatisticsPanel';
import { wsService } from '../services/websocketService';
import { AnomalyResult, StatisticsData, MetricDataPoint } from '../types';

const { Title } = Typography;
const { Option } = Select;

const MAX_DATA_POINTS = 100;

const Dashboard: React.FC = () => {
  const [metricsData, setMetricsData] = useState<Record<string, MetricDataPoint[]>>({});
  const [anomalies, setAnomalies] = useState<AnomalyResult[]>([]);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  const handleMessage = useCallback((message: AnomalyResult | StatisticsData) => {
    if ('type' in message && message.type === 'statistics') {
      setStatistics(message as StatisticsData);
    } else if ('isAnomaly' in message) {
      const anomaly = message as AnomalyResult;
      
      setMetricsData(prev => {
        const metricData = prev[anomaly.metricId] || [];
        const newDataPoint: MetricDataPoint = {
          timestamp: anomaly.timestamp,
          value: anomaly.value,
          isAnomaly: anomaly.isAnomaly,
          score: anomaly.score,
          algorithm: anomaly.algorithm,
        };
        const updated = [...metricData, newDataPoint].slice(-MAX_DATA_POINTS);
        return {
          ...prev,
          [anomaly.metricId]: updated,
        };
      });

      if (anomaly.isAnomaly) {
        setAnomalies(prev => [anomaly, ...prev].slice(0, 1000));
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = wsService.subscribe(handleMessage);
    return unsubscribe;
  }, [handleMessage]);

  const metricIds = Object.keys(metricsData);

  const displayMetrics = selectedMetrics.length > 0
    ? selectedMetrics
    : metricIds.slice(0, 4);

  const handleMetricChange = (value: string[]) => {
    setSelectedMetrics(value);
  };

  const clearData = () => {
    setMetricsData({});
    setAnomalies([]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <DashboardOutlined /> 实时监控看板
        </Title>
        <Space>
          <Select
            mode="multiple"
            placeholder="选择要显示的指标"
            style={{ minWidth: 300 }}
            value={selectedMetrics}
            onChange={handleMetricChange}
            allowClear
          >
            {metricIds.map(id => (
              <Option key={id} value={id}>{id}</Option>
            ))}
          </Select>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: '概览',
            children: <StatisticsPanel statistics={statistics} />,
          },
          {
            key: 'metrics',
            label: '指标趋势',
            children: (
              <div>
                {displayMetrics.length > 0 ? (
                  <Row gutter={[16, 16]}>
                    {displayMetrics.map(metricId => (
                      <Col key={metricId} xs={24} lg={12}>
                        <MetricChart
                          metricId={metricId}
                          data={metricsData[metricId] || []}
                        />
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <Card style={{ textAlign: 'center', color: '#999' }}>
                    等待数据流接入... 请确保后端服务已启动并正在发送数据
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'anomalies',
            label: `异常列表 (${anomalies.length})`,
            children: (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <Space>
                    <span style={{ color: '#666' }}>
                      共检测到 {anomalies.filter(a => a.isAnomaly).length} 个异常点
                    </span>
                  </Space>
                </div>
                <AnomalyList anomalies={anomalies} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default Dashboard;
