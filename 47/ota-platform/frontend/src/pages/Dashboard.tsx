import { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Tag } from 'antd'
import {
  DesktopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  TeamOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { statisticsApi } from '../services/api'

const Dashboard = () => {
  const [stats, setStats] = useState<any>({})
  const [deviceStatusData, setDeviceStatusData] = useState<any[]>([])
  const [firmwareVersionData, setFirmwareVersionData] = useState<any[]>([])
  const [upgradeTrendData, setUpgradeTrendData] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [dashboardRes, statusRes, versionRes, trendRes]: any[] = await Promise.all([
        statisticsApi.getDashboard(),
        statisticsApi.getDeviceStatus(),
        statisticsApi.getFirmwareVersion(),
        statisticsApi.getUpgradeTrend(7),
      ])

      if (dashboardRes.code === 200) {
        setStats(dashboardRes.data)
      }
      if (statusRes.code === 200) {
        setDeviceStatusData(statusRes.data)
      }
      if (versionRes.code === 200) {
        setFirmwareVersionData(versionRes.data)
      }
      if (trendRes.code === 200) {
        setUpgradeTrendData(trendRes.data)
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    }
  }

  const deviceStatusChart = {
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
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
          label: { show: true, fontSize: 20, fontWeight: 'bold' },
        },
        labelLine: { show: false },
        data: deviceStatusData.map((item: any) => ({
          value: item.count,
          name: item.status === 'ONLINE' ? '在线' : '离线',
          itemStyle: {
            color: item.status === 'ONLINE' ? '#52c41a' : '#ff4d4f',
          },
        })),
      },
    ],
  }

  const firmwareVersionChart = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: firmwareVersionData.map((item: any) => item.version || '未知'),
      axisLabel: { interval: 0, rotate: 30 },
    },
    yAxis: { type: 'value', name: '设备数' },
    series: [
      {
        name: '设备数量',
        type: 'bar',
        data: firmwareVersionData.map((item: any) => item.count),
        itemStyle: { color: '#1890ff' },
      },
    ],
  }

  const upgradeTrendChart = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['升级任务数'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: upgradeTrendData.map((item: any) => item.date),
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
      },
    ],
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <DesktopOutlined className="icon" style={{ color: '#1890ff' }} />
            <Statistic title="设备总数" value={stats.totalDevices || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <CheckCircleOutlined className="icon" style={{ color: '#52c41a' }} />
            <Statistic title="在线设备" value={stats.onlineDevices || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <CloseCircleOutlined className="icon" style={{ color: '#ff4d4f' }} />
            <Statistic title="离线设备" value={stats.offlineDevices || 0} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <TeamOutlined className="icon" style={{ color: '#722ed1' }} />
            <Statistic title="设备分组" value={stats.totalGroups || 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <CloudServerOutlined className="icon" style={{ color: '#fa8c16' }} />
            <Statistic title="固件总数" value={stats.totalFirmware || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <CloudUploadOutlined className="icon" style={{ color: '#13c2c2' }} />
            <Statistic title="升级任务" value={stats.totalTasks || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <RiseOutlined className="icon" style={{ color: '#52c41a' }} />
            <Statistic title="升级成功率" value={stats.successRate || '0%'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="dashboard-card">
            <FallOutlined className="icon" style={{ color: '#ff4d4f' }} />
            <Statistic title="总升级次数" value={stats.totalUpgrades || 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="设备状态分布">
            <ReactECharts option={deviceStatusChart} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="固件版本分布">
            <ReactECharts option={firmwareVersionChart} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="近7天升级趋势">
            <ReactECharts option={upgradeTrendChart} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
