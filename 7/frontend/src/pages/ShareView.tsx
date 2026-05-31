import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Spin,
  Empty,
  Button,
  Form,
  Input,
  Typography,
  Row,
  Col,
  Space,
  Tag,
  message,
  Alert,
} from 'antd';
import { LockOutlined, EyeOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import { shareApi, ShareAccessResponse } from '@/api/share';
import { datasourceApi, TimeSeriesPoint, DataQueryParams } from '@/api/datasources';

const { Title, Text } = Typography;

const ShareView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [requirePassword, setRequirePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessData, setAccessData] = useState<ShareAccessResponse | null>(null);
  const [data, setData] = useState<TimeSeriesPoint[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [shareInfo, setShareInfo] = useState<any>(null);

  const [form] = Form.useForm();

  const checkShareLink = async (password?: string) => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await shareApi.access({
        token,
        password,
      });

      if (response.data.success) {
        setAccessData(response.data);
        setRequirePassword(false);
        fetchData(response.data);
      } else if (response.data.require_password) {
        setRequirePassword(true);
      } else {
        setError(response.data.message || '无法访问分享链接');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '访问失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const fetchShareInfo = async () => {
    if (!token) return;
    try {
      const response = await shareApi.getByToken(token);
      setShareInfo(response.data);
    } catch (err) {
      console.error('Failed to fetch share info:', err);
    }
  };

  const fetchData = async (accessData: ShareAccessResponse) => {
    if (!accessData.datasource_id || !accessData.config) return;

    setDataLoading(true);
    try {
      const config = accessData.config;
      const timeRange = config.timeRange;
      
      if (!timeRange || timeRange.length < 2) {
        setError('无效的分享配置');
        return;
      }

      const params: DataQueryParams = {
        start_time: timeRange[0],
        end_time: timeRange[1],
        aggregation: config.aggregation || 'mean',
        interval: config.interval || '5m',
      };

      const response = await datasourceApi.query(accessData.datasource_id, params);
      setData(response.data.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      message.error('数据加载失败');
    } finally {
      setDataLoading(false);
    }
  };

  const handlePasswordSubmit = async (values: { password: string }) => {
    await checkShareLink(values.password);
  };

  useEffect(() => {
    checkShareLink();
    fetchShareInfo();
  }, [token]);

  const getChartOption = (): EChartsOption => {
    if (!accessData?.config) return {};

    const timestamps = data.map((d) => d.timestamp);
    const values = data.map((d) => d.value);
    const chartType = accessData.config.chartType || 'line';

    const baseOption: EChartsOption = {
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['值'],
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timestamps,
        axisLabel: {
          rotate: 45,
        },
      },
      yAxis: {
        type: 'value',
      },
    };

    switch (chartType) {
      case 'area':
        return {
          ...baseOption,
          series: [
            {
              name: '值',
              type: 'line',
              data: values,
              smooth: true,
              areaStyle: {},
            },
          ],
        };
      case 'boxplot':
        const boxData: number[][] = [];
        if (values.length > 0) {
          const sorted = [...values].sort((a, b) => a - b);
          const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
          const median = sorted[Math.floor(sorted.length * 0.5)] || 0;
          const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
          const min = sorted[0];
          const max = sorted[sorted.length - 1];
          boxData.push([min, q1, median, q3, max]);
        }
        return {
          ...baseOption,
          tooltip: {
            trigger: 'item',
            formatter: function (params: any) {
              return [
                '最大值: ' + params.data[5],
                '上四分位数: ' + params.data[4],
                '中位数: ' + params.data[3],
                '下四分位数: ' + params.data[2],
                '最小值: ' + params.data[1],
              ].join('<br/>');
            },
          },
          xAxis: {
            type: 'category',
            data: ['数据分布'],
          },
          series: [
            {
              name: '箱线图',
              type: 'boxplot',
              data: boxData,
              itemStyle: {
                color: '#b8c5f2',
              },
            },
          ],
        };
      case 'heatmap':
        const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
        const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const heatmapData: [number, number, number][] = [];
        for (let i = 0; i < 7; i++) {
          for (let j = 0; j < 24; j++) {
            const value = Math.random() * 100;
            heatmapData.push([j, i, value]);
          }
        }
        return {
          ...baseOption,
          xAxis: {
            type: 'category',
            data: hours,
            splitArea: { show: true },
          },
          yAxis: {
            type: 'category',
            data: days,
            splitArea: { show: true },
          },
          visualMap: {
            min: 0,
            max: 100,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '15%',
          },
          series: [
            {
              name: '热力图',
              type: 'heatmap',
              data: heatmapData,
              label: { show: false },
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.5)',
                },
              },
            },
          ],
        };
      case 'line':
      default:
        return {
          ...baseOption,
          series: [
            {
              name: '值',
              type: 'line',
              data: values,
              smooth: true,
            },
          ],
        };
    }
  };

  const renderChart = () => {
    if (dataLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (data.length === 0) {
      return <Empty description="暂无数据" />;
    }

    return (
      <ReactECharts
        option={getChartOption()}
        style={{ height: '500px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    );
  };

  const getChartTypeName = () => {
    const typeMap: Record<string, string> = {
      line: '折线图',
      area: '面积图',
      heatmap: '热力图',
      boxplot: '箱线图',
    };
    return typeMap[accessData?.config?.chartType || 'line'] || '折线图';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 20 }}>
        <Card style={{ maxWidth: 500, width: '100%' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="danger" strong>
                  {error}
                </Text>
                <Button type="primary" onClick={() => window.close()}>
                  关闭页面
                </Button>
              </Space>
            }
          />
        </Card>
      </div>
    );
  }

  if (requirePassword) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 20 }}>
        <Card style={{ maxWidth: 400, width: '100%' }}>
          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <LockOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            <Title level={4}>此分享链接需要密码</Title>
            <Text type="secondary">请输入访问密码以查看数据</Text>
            
            <Form
              form={form}
              layout="vertical"
              onFinish={handlePasswordSubmit}
              style={{ marginTop: 24 }}
            >
              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password
                  placeholder="请输入访问密码"
                  size="large"
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block size="large">
                  验证密码
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5', padding: 24 }}>
      <Card style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message="分享仪表盘"
            type="info"
            showIcon
            icon={<EyeOutlined />}
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <Row gutter={16}>
                  {shareInfo?.created_at && (
                    <Col span={8}>
                      <Text strong>创建时间:</Text> {dayjs(shareInfo.created_at).format('YYYY-MM-DD HH:mm')}
                    </Col>
                  )}
                  {accessData?.config?.timeRange && (
                    <Col span={8}>
                      <Text strong>数据范围:</Text> {dayjs(accessData.config.timeRange[0]).format('YYYY-MM-DD HH:mm')} - {dayjs(accessData.config.timeRange[1]).format('YYYY-MM-DD HH:mm')}
                    </Col>
                  )}
                  <Col span={8}>
                    <Tag color="blue"><Text strong>图表类型:</Text> {getChartTypeName()}</Tag>
                  </Col>
                </Row>
              </Space>
            }
          />

          <div style={{ marginTop: 16 }}>
            {renderChart()}
          </div>

          {accessData?.config && (
            <Card title="仪表盘配置" type="inner" style={{ marginTop: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Text strong>聚合方式:</Text> {accessData.config.aggregation === 'mean' ? '平均值' : accessData.config.aggregation === 'sum' ? '求和' : accessData.config.aggregation === 'max' ? '最大值' : '最小值'}
                </Col>
                <Col span={8}>
                  <Text strong>时间间隔:</Text> {accessData.config.interval}
                </Col>
                <Col span={8}>
                  <Text strong>数据点:</Text> {data.length}
                </Col>
              </Row>
            </Card>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default ShareView;
