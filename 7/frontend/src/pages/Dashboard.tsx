import React, { useEffect, useState } from 'react';
import {
  Card,
  Space,
  Select,
  DatePicker,
  Typography,
  Row,
  Col,
  Spin,
  Empty,
  Button,
  message,
  Modal,
  Form,
  Input,
  Switch,
  InputNumber,
  Table,
  Tag,
  Tooltip,
  Popconfirm,
  CopyOutlined,
  ShareAltOutlined,
} from 'antd';
import { ReloadOutlined, ShareOutlined, EyeOutlined, DeleteOutlined, LinkOutlined, LockOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import { datasourceApi, DataSource, TimeSeriesPoint, DataQueryParams } from '@/api/datasources';
import { shareApi, ShareLink, ShareLinkCreate } from '@/api/share';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const Dashboard: React.FC = () => {
  const [datasources, setDatasources] = useState<DataSource[]>([]);
  const [selectedDatasource, setSelectedDatasource] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(1, 'day'),
    dayjs(),
  ]);
  const [aggregation, setAggregation] = useState<'mean' | 'sum' | 'max' | 'min'>('mean');
  const [interval, setInterval] = useState<string>('5m');
  const [chartType, setChartType] = useState<'line' | 'area' | 'heatmap' | 'boxplot'>('line');
  const [data, setData] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchDatasources = async () => {
    try {
      const response = await datasourceApi.getAll();
      setDatasources(response.data);
      if (response.data.length > 0 && !selectedDatasource) {
        setSelectedDatasource(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch datasources:', error);
    }
  };

  const fetchData = async () => {
    if (!selectedDatasource) return;

    setLoading(true);
    try {
      const params: DataQueryParams = {
        start_time: timeRange[0].toISOString(),
        end_time: timeRange[1].toISOString(),
        aggregation,
        interval,
      };

      const response = await datasourceApi.query(selectedDatasource, params);
      setData(response.data.data);
      message.success(`加载完成，共 ${response.data.count} 条数据`);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchShareLinks = async () => {
    try {
      setShareLoading(true);
      const response = await shareApi.list();
      setShareLinks(response.data);
    } catch (error) {
      console.error('Failed to fetch share links:', error);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCreateShare = async (values: any) => {
    if (!selectedDatasource) {
      message.error('请先选择数据源');
      return;
    }

    try {
      setShareLoading(true);
      
      const shareData: ShareLinkCreate = {
        datasource_id: selectedDatasource,
        config: {
          timeRange: [
            timeRange[0].toISOString(),
            timeRange[1].toISOString(),
          ],
          aggregation,
          interval,
          chartType,
        },
        password: values.password || undefined,
        expires_at: values.expiresAt ? values.expiresAt.toISOString() : undefined,
      };

      const response = await shareApi.create(shareData);
      message.success('分享链接创建成功！');
      setShareModalVisible(false);
      form.resetFields();
      
      Modal.success({
        title: '分享链接已创建',
        content: (
          <div>
            <p>链接：<code>{response.data.share_url}</code></p>
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(response.data.share_url || '');
                message.success('已复制到剪贴板');
              }}
            >
              复制链接
            </Button>
          </div>
        ),
      });
      
    } catch (error) {
      console.error('Failed to create share link:', error);
      message.error('创建分享链接失败');
    } finally {
      setShareLoading(false);
    }
  };

  const handleDeleteShare = async (id: number) => {
    try {
      await shareApi.delete(id);
      message.success('分享链接已删除');
      fetchShareLinks();
    } catch (error) {
      console.error('Failed to delete share link:', error);
      message.error('删除失败');
    }
  };

  const handleToggleShareActive = async (id: number, is_active: boolean) => {
    try {
      await shareApi.update(id, { is_active });
      message.success(`分享链接已${is_active ? '启用' : '禁用'}`);
      fetchShareLinks();
    } catch (error) {
      console.error('Failed to update share link:', error);
      message.error('更新失败');
    }
  };

  useEffect(() => {
    fetchDatasources();
  }, []);

  useEffect(() => {
    if (selectedDatasource) {
      fetchData();
    }
  }, [selectedDatasource, timeRange, aggregation, interval]);

  useEffect(() => {
    if (manageModalVisible) {
      fetchShareLinks();
    }
  }, [manageModalVisible]);

  const getLineChartOption = (areaStyle: boolean = false): EChartsOption => {
    const timestamps = data.map((d) => d.timestamp);
    const values = data.map((d) => d.value);

    return {
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
      series: [
        {
          name: '值',
          type: 'line',
          data: values,
          smooth: true,
          areaStyle: areaStyle ? {} : undefined,
        },
      ],
    };
  };

  const getHeatmapOption = (): EChartsOption => {
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
      tooltip: {
        position: 'top',
      },
      grid: {
        height: '50%',
        top: '10%',
      },
      xAxis: {
        type: 'category',
        data: hours,
        splitArea: {
          show: true,
        },
      },
      yAxis: {
        type: 'category',
        data: days,
        splitArea: {
          show: true,
        },
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
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  };

  const getBoxplotOption = (): EChartsOption => {
    const boxData: number[][] = [];
    const values = data.map((d) => d.value);
    
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
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
      },
      xAxis: {
        type: 'category',
        data: ['数据分布'],
        axisLabel: {
          formatter: '{value}',
        },
      },
      yAxis: {
        type: 'value',
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
  };

  const renderChart = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (data.length === 0) {
      return <Empty description="暂无数据" />;
    }

    let option: EChartsOption;

    switch (chartType) {
      case 'area':
        option = getLineChartOption(true);
        break;
      case 'heatmap':
        option = getHeatmapOption();
        break;
      case 'boxplot':
        option = getBoxplotOption();
        break;
      case 'line':
      default:
        option = getLineChartOption(false);
    }

    return (
      <ReactECharts
        option={option}
        style={{ height: '500px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    );
  };

  const selectedDatasourceName = datasources.find((d) => d.id === selectedDatasource)?.name || '';

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Card>
          <Title level={4}>可视化仪表盘</Title>
        </Card>

        <Card>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <div style={{ marginBottom: 8 }}>数据源</div>
              <Select
                style={{ width: '100%' }}
                value={selectedDatasource}
                onChange={setSelectedDatasource}
                placeholder="选择数据源"
              >
                {datasources.map((ds) => (
                  <Option key={ds.id} value={ds.id}>
                    {ds.name}
                  </Option>
                ))}
              </Select>
            </Col>

            <Col xs={24} md={8}>
              <div style={{ marginBottom: 8 }}>时间范围</div>
              <RangePicker
                style={{ width: '100%' }}
                value={timeRange}
                onChange={(dates) => dates && setTimeRange(dates as [Dayjs, Dayjs])}
                showTime
              />
            </Col>

            <Col xs={24} md={4}>
              <div style={{ marginBottom: 8 }}>聚合方式</div>
              <Select
                style={{ width: '100%' }}
                value={aggregation}
                onChange={setAggregation}
              >
                <Option value="mean">平均</Option>
                <Option value="sum">求和</Option>
                <Option value="max">最大</Option>
                <Option value="min">最小</Option>
              </Select>
            </Col>

            <Col xs={24} md={4}>
              <div style={{ marginBottom: 8 }}>时间间隔</div>
              <Select
                style={{ width: '100%' }}
                value={interval}
                onChange={setInterval}
              >
                <Option value="1m">1分钟</Option>
                <Option value="5m">5分钟</Option>
                <Option value="15m">15分钟</Option>
                <Option value="1h">1小时</Option>
                <Option value="1d">1天</Option>
              </Select>
            </Col>

            <Col xs={24} md={2}>
              <div style={{ marginBottom: 8 }}>&nbsp;</div>
              <Button icon={<ReloadOutlined />} onClick={fetchData}>
                刷新
              </Button>
            </Col>
          </Row>
        </Card>

        <Card>
          <Row gutter={16}>
            <Col xs={24} md={18}>
              <Space size="middle">
                <Button
                  type={chartType === 'line' ? 'primary' : 'default'}
                  onClick={() => setChartType('line')}
                >
                  折线图
                </Button>
                <Button
                  type={chartType === 'area' ? 'primary' : 'default'}
                  onClick={() => setChartType('area')}
                >
                  面积图
                </Button>
                <Button
                  type={chartType === 'heatmap' ? 'primary' : 'default'}
                  onClick={() => setChartType('heatmap')}
                >
                  热力图
                </Button>
                <Button
                  type={chartType === 'boxplot' ? 'primary' : 'default'}
                  onClick={() => setChartType('boxplot')}
                >
                  箱线图
                </Button>
              </Space>
            </Col>
            <Col xs={24} md={6} style={{ textAlign: 'right' }}>
              <Space>
                <Button
                  icon={<ShareAltOutlined />}
                  onClick={() => setManageModalVisible(true)}
                >
                  管理分享
                </Button>
                <Button
                  type="primary"
                  icon={<ShareOutlined />}
                  onClick={() => setShareModalVisible(true)}
                  disabled={!selectedDatasource}
                >
                  分享仪表盘
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        <Card>{renderChart()}</Card>

        <Modal
          title="创建分享链接"
          open={shareModalVisible}
          onCancel={() => setShareModalVisible(false)}
          footer={null}
          width={600}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleCreateShare}
          >
            <Card title="当前仪表盘配置" type="inner" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <div><strong>数据源:</strong> {selectedDatasourceName}</div>
                </Col>
                <Col span={12}>
                  <div><strong>图表类型:</strong> {chartType}</div>
                </Col>
                <Col span={24}>
                  <div><strong>时间范围:</strong> {timeRange[0].format('YYYY-MM-DD HH:mm')} - {timeRange[1].format('YYYY-MM-DD HH:mm')}</div>
                </Col>
                <Col span={12}>
                  <div><strong>聚合方式:</strong> {aggregation}</div>
                </Col>
                <Col span={12}>
                  <div><strong>时间间隔:</strong> {interval}</div>
                </Col>
              </Row>
            </Card>

            <Form.Item label="过期时间" name="expiresAt">
              <DatePicker
                style={{ width: '100%' }}
                showTime
                placeholder="选择过期时间（留空表示永不过期）"
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>

            <Form.Item
              label="访问密码"
              name="password"
              tooltip="设置密码后，访问者需要输入密码才能查看"
            >
              <Input.Password
                placeholder="留空表示不需要密码"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setShareModalVisible(false)}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit" loading={shareLoading}>
                  创建分享链接
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="管理分享链接"
          open={manageModalVisible}
          onCancel={() => setManageModalVisible(false)}
          footer={null}
          width={900}
        >
          <Table
            dataSource={shareLinks}
            rowKey="id"
            loading={shareLoading}
            columns={[
              {
                title: '数据源',
                dataIndex: 'datasource_id',
                key: 'datasource_id',
                render: (id) => datasources.find(d => d.id === id)?.name || `#${id}`,
              },
              {
                title: '图表类型',
                dataIndex: ['config', 'chartType'],
                key: 'chartType',
                render: (type) => {
                  const typeMap: Record<string, string> = {
                    line: '折线图',
                    area: '面积图',
                    heatmap: '热力图',
                    boxplot: '箱线图',
                  };
                  return typeMap[type] || type;
                },
              },
              {
                title: '密码保护',
                dataIndex: 'has_password',
                key: 'has_password',
                render: (has) => has ? <Tag color="orange" icon={<LockOutlined />}>已加密</Tag> : <Tag color="green">公开</Tag>,
              },
              {
                title: '状态',
                dataIndex: 'is_active',
                key: 'is_active',
                render: (active, record) => (
                  <Switch
                    checked={active}
                    onChange={(checked) => handleToggleShareActive(record.id, checked)}
                  />
                ),
              },
              {
                title: '访问次数',
                dataIndex: 'view_count',
                key: 'view_count',
                render: (count) => <Tag color="blue"><EyeOutlined /> {count}</Tag>,
              },
              {
                title: '创建时间',
                dataIndex: 'created_at',
                key: 'created_at',
                render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm'),
              },
              {
                title: '过期时间',
                dataIndex: 'expires_at',
                key: 'expires_at',
                render: (time) => time ? (
                  dayjs(time).isBefore(dayjs()) ? (
                    <Tag color="red">已过期</Tag>
                  ) : (
                    <Tag color="blue">{dayjs(time).format('YYYY-MM-DD HH:mm')}</Tag>
                  )
                ) : (
                  <Tag color="green">永不过期</Tag>
                ),
              },
              {
                title: '操作',
                key: 'action',
                render: (_, record) => (
                  <Space>
                    <Tooltip title="复制链接">
                      <Button
                        icon={<LinkOutlined />}
                        size="small"
                        onClick={() => {
                          if (record.share_url) {
                            navigator.clipboard.writeText(record.share_url);
                            message.success('链接已复制');
                          }
                        }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="确定要删除这个分享链接吗？"
                      onConfirm={() => handleDeleteShare(record.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        icon={<DeleteOutlined />}
                        size="small"
                        danger
                      />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
            pagination={{ pageSize: 10 }}
          />
        </Modal>
      </Space>
    </div>
  );
};

export default Dashboard;
