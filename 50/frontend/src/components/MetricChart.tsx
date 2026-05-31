import React, { useEffect, useState, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, Tag, Statistic, Row, Col } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, WarningOutlined } from '@ant-design/icons';
import { AnomalyResult, MetricDataPoint } from '../types';
import moment from 'moment';

interface MetricChartProps {
  metricId: string;
  data: MetricDataPoint[];
  onData?: (data: AnomalyResult) => void;
}

const MetricChart: React.FC<MetricChartProps> = ({ metricId, data, onData }) => {
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    if (data.length > 0) {
      const latest = data[data.length - 1];
      setCurrentValue(latest.value);
      setAnomalyCount(data.filter(d => d.isAnomaly).length);
    }
  }, [data]);

  const getChartOption = () => {
    const times = data.map(d => moment(d.timestamp).format('HH:mm:ss'));
    const values = data.map(d => d.value);
    const anomalyPoints = data
      .map((d, idx) => d.isAnomaly ? [idx, d.value, d.score, d.algorithm] : null)
      .filter(Boolean) as [number, number, number, string][];

    return {
      title: {
        text: metricId,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
        },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const idx = params[0].dataIndex;
          const point = data[idx];
          let html = `<div>${times[idx]}</div>`;
          html += `<div>值: ${point.value.toFixed(2)}</div>`;
          if (point.isAnomaly) {
            html += `<div style="color: #ff4d4f;">
              <WarningOutlined /> 异常点 (${point.algorithm})
              <br/>分数: ${point.score.toFixed(4)}
            </div>`;
          }
          return html;
        },
      },
      grid: {
        left: '10%',
        right: '10%',
        top: 60,
        bottom: 40,
      },
      xAxis: {
        type: 'category',
        data: times,
        axisLabel: {
          rotate: 45,
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
      },
      series: [
        {
          name: '数值',
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            color: '#1890ff',
            width: 2,
          },
          itemStyle: {
            color: '#1890ff',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
                { offset: 1, color: 'rgba(24, 144, 255, 0.05)' },
              ],
            },
          },
          markPoint: {
            symbol: 'diamond',
            symbolSize: 12,
            data: anomalyPoints.map(([idx, value, score, algo]) => ({
              coord: [idx, value],
              value: `异常 ${score.toFixed(2)}`,
              itemStyle: {
                color: '#ff4d4f',
              },
            })),
          },
        },
      ],
    };
  };

  const avgValue = data.length > 0 
    ? data.reduce((sum, d) => sum + d.value, 0) / data.length 
    : 0;

  return (
    <Card className="metric-card">
      <Row gutter={16}>
        <Col span={6}>
          <Statistic
            title="当前值"
            value={currentValue ?? 0}
            precision={2}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="平均值"
            value={avgValue}
            precision={2}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="数据点数"
            value={data.length}
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="异常点数"
            value={anomalyCount}
            valueStyle={{ color: anomalyCount > 0 ? '#ff4d4f' : '#8c8c8c' }}
            prefix={anomalyCount > 0 ? <WarningOutlined /> : null}
          />
        </Col>
      </Row>
      
      <div style={{ height: 300, marginTop: 16 }}>
        <ReactECharts
          ref={chartRef}
          option={getChartOption()}
          notMerge={true}
          lazyUpdate={true}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </Card>
  );
};

export default MetricChart;
