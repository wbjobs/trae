import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Row, Col, Card, Statistic } from 'antd';
import {
  DashboardOutlined,
  WarningOutlined,
  DatabaseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { StatisticsData } from '../types';

interface StatisticsPanelProps {
  statistics: StatisticsData | null;
}

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ statistics }) => {
  if (!statistics) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>等待统计数据...</div>;
  }

  const algorithmChartOption = {
    title: {
      text: '按检测算法统计',
      left: 'center',
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: '{b}\n{c}个',
        },
        data: Object.entries(statistics.anomaliesByAlgorithm).map(([name, value]) => ({
          name: name === '3sigma' ? '3σ 统计' : '孤立森林',
          value,
        })),
        color: ['#1890ff', '#722ed1'],
      },
    ],
  };

  const metricChartOption = {
    title: {
      text: '按指标统计',
      left: 'center',
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: Object.keys(statistics.anomaliesByMetric),
      axisLabel: {
        rotate: 30,
        fontSize: 10,
      },
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        type: 'bar',
        data: Object.values(statistics.anomaliesByMetric),
        itemStyle: {
          color: '#ff4d4f',
        },
      },
    ],
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃连接数"
              value={statistics.activeConnections}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总消息数"
              value={statistics.totalMessages}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总异常数"
              value={statistics.totalAnomalies}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="异常率"
              value={statistics.totalMessages > 0 
                ? (statistics.totalAnomalies / statistics.totalMessages * 100) 
                : 0}
              precision={2}
              suffix="%"
              prefix={<DashboardOutlined />}
              valueStyle={{ 
                color: statistics.totalAnomalies > statistics.totalMessages * 0.05 ? '#ff4d4f' : '#faad14' 
              }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card>
            <div style={{ height: 300 }}>
              <ReactECharts
                option={algorithmChartOption}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <div style={{ height: 300 }}>
              <ReactECharts
                option={metricChartOption}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StatisticsPanel;
