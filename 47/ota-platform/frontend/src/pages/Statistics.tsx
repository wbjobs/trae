import { useState, useEffect } from 'react'
import { Card, Row, Col, Table, Tag, Button, Space, DatePicker } from 'antd'
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { statisticsApi } from '../services/api'

const Statistics = () => {
  const [dashboardStats, setDashboardStats] = useState<any>({})
  const [deviceStatusData, setDeviceStatusData] = useState<any[]>([])
  const [firmwareVersionData, setFirmwareVersionData] = useState<any[]>([])
  const [taskStatusData, setTaskStatusData] = useState<any[]>([])
  const [firmwareUpgradeData, setFirmwareUpgradeData] = useState<any[]>([])
  const [upgradeTrendData, setUpgradeTrendData] = useState<any[]>([])

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    try {
      const [
        dashboardRes,
        statusRes,
        versionRes,
        taskStatusRes,
        firmwareUpgradeRes,
        trendRes,
      ]: any[] = await Promise.all([
        statisticsApi.getDashboard(),
        statisticsApi.getDeviceStatus(),
        statisticsApi.getFirmwareVersion(),
        statisticsApi.getTaskStatus(),
        statisticsApi.getFirmwareUpgrade(),
        statisticsApi.getUpgradeTrend(30),
      ])

      if (dashboardRes.code === 200) setDashboardStats(dashboardRes.data)
      if (statusRes.code === 200) setDeviceStatusData(statusRes.data)
      if (versionRes.code === 200) setFirmwareVersionData(versionRes.data)
      if (taskStatusRes.code === 200) setTaskStatusData(taskStatusRes.data)
      if (firmwareUpgradeRes.code === 200) setFirmwareUpgradeData(firmwareUpgradeRes.data)
      if (trendRes.code === 200) setUpgradeTrendData(trendRes.data)
    } catch (error) {
      console.error('Failed to load statistics:', error)
    }
  }

  const statusPieChart = {
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%', left: 'center' },
    series: [
      {
        name: '设备状态',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' },
        },
        labelLine: { show: false },
        data: deviceStatusData.map((item: any) => ({
          value: item.count,
          name: item.status === 'ONLINE' ? '在线设备' : '离线设备',
          itemStyle: {
            color: item.status === 'ONLINE' ? '#52c41a' : '#ff4d4f',
          },
        })),
      },
    ],
  }

  const firmwareVersionBarChart = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: firmwareVersionData.map((item: any) => item.version || '未知'),
      axisLabel: { interval: 0, rotate: 45 },
    },
    yAxis: { type: 'value', name: '设备数' },
    series: [
      {
        name: '设备数量',
        type: 'bar',
        data: firmwareVersionData.map((item: any) => item.count),
        itemStyle: { color: '#1890ff' },
        label: { show: true, position: 'top' },
      },
    ],
  }

  const taskStatusPieChart = {
    tooltip: { trigger: 'item' },
    legend: { bottom: '0%', left: 'center' },
    series: [
      {
        name: '任务状态',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' },
        },
        labelLine: { show: false },
        data: taskStatusData.map((item: any) => {
          const colorMap: any = {
            PENDING: '#faad14',
            RUNNING: '#1890ff',
            COMPLETED: '#52c41a',
            CANCELLED: '#8c8c8c',
            FAILED: '#ff4d4f',
          }
          const nameMap: any = {
            PENDING: '待执行',
            RUNNING: '执行中',
            COMPLETED: '已完成',
            CANCELLED: '已取消',
            FAILED: '失败',
          }
          return {
            value: item.count,
            name: nameMap[item.status] || item.status,
            itemStyle: { color: colorMap[item.status] || '#1890ff' },
          }
        }),
      },
    ],
  }

  const upgradeTrendLineChart = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['升级任务数'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: upgradeTrendData.map((item: any) => item.date?.substring(0, 10) || ''),
    },
    yAxis: { type: 'value', name: '任务数' },
    series: [
      {
        name: '升级任务数',
        type: 'line',
        stack: 'Total',
        data: upgradeTrendData.map((item: any) => item.count),
        areaStyle: { color: 'rgba(24, 144, 255, 0.3)' },
        lineStyle: { color: '#1890ff' },
        smooth: true,
      },
    ],
  }

  const upgradeSuccessRateChart = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['成功次数', '失败次数'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: firmwareUpgradeData.map((item: any) => item.version),
      axisLabel: { interval: 0, rotate: 45 },
    },
    yAxis: { type: 'value', name: '次数' },
    series: [
      {
        name: '成功次数',
        type: 'bar',
        stack: 'total',
        data: firmwareUpgradeData.map((item: any) => item.successCount),
        itemStyle: { color: '#52c41a' },
      },
      {
        name: '失败次数',
        type: 'bar',
        stack: 'total',
        data: firmwareUpgradeData.map((item: any) => item.failureCount),
        itemStyle: { color: '#ff4d4f' },
      },
    ],
  }

  const firmwareTableColumns = [
    {
      title: '固件版本',
      dataIndex: 'version',
      key: 'version',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '成功次数',
      dataIndex: 'successCount',
      key: 'successCount',
      render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{v}</span>,
    },
    {
      title: '失败次数',
      dataIndex: 'failureCount',
      key: 'failureCount',
      render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span>,
    },
    {
      title: '总次数',
      dataIndex: 'totalCount',
      key: 'totalCount',
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      render: (rate: string) => {
        const percent = parseFloat(rate)
        const color = percent >= 90 ? '#52c41a' : percent >= 70 ? '#faad14' : '#ff4d4f'
        return <Tag color={color}>{rate}</Tag>
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>数据统计</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAllData}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />}>导出报表</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>升级成功率</div>
              <div style={{ fontSize: 36, fontWeight: 'bold', color: '#52c41a' }}>
                {dashboardStats.successRate || '0.00%'}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>总升级次数</div>
              <div style={{ fontSize: 36, fontWeight: 'bold', color: '#1890ff' }}>
                {dashboardStats.totalUpgrades || 0}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>成功升级</div>
              <div style={{ fontSize: 36, fontWeight: 'bold', color: '#52c41a' }}>
                {dashboardStats.successUpgrades || 0}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>失败升级</div>
              <div style={{ fontSize: 36, fontWeight: 'bold', color: '#ff4d4f' }}>
                {dashboardStats.failedUpgrades || 0}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="设备状态分布">
            <ReactECharts option={statusPieChart} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="升级任务状态分布">
            <ReactECharts option={taskStatusPieChart} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="固件版本分布">
            <ReactECharts option={firmwareVersionBarChart} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="近30天升级趋势">
            <ReactECharts option={upgradeTrendLineChart} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="各版本升级成功率">
            <ReactECharts option={upgradeSuccessRateChart} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title="固件升级明细表">
            <Table
              columns={firmwareTableColumns}
              dataSource={firmwareUpgradeData}
              rowKey="version"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Statistics
