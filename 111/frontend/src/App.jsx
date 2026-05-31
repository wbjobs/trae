import React, { useState, useEffect } from 'react'
import { Layout, Menu, theme, Badge, message } from 'antd'
import {
  DashboardOutlined,
  ExperimentOutlined,
  ClusterOutlined,
  AlertOutlined,
  SafetyOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Experiments from './pages/Experiments.jsx'
import Topology from './pages/Topology.jsx'
import ActiveFaults from './pages/ActiveFaults.jsx'
import SLOConfig from './pages/SLOConfig.jsx'
import SafetyEvents from './pages/SafetyEvents.jsx'
import { safetyApi } from './api/index.js'

const { Header, Content, Sider } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/experiments', icon: <ExperimentOutlined />, label: 'Experiments' },
  { key: '/topology', icon: <ClusterOutlined />, label: 'Topology' },
  { key: '/faults', icon: <AlertOutlined />, label: 'Active Faults' },
  { key: '/slo', icon: <SafetyOutlined />, label: 'SLO Config' },
  { key: '/safety-events', icon: <AlertOutlined />, label: 'Safety Events' },
]

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [autoStopAlerts, setAutoStopAlerts] = useState([])
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  useEffect(() => {
    const checkAutoStops = async () => {
      try {
        const res = await safetyApi.listEvents()
        const autoStops = res.data.filter(
          (e) => e.action === 'auto_stop'
        )
        const newAlerts = autoStops.filter(
          (e) => !localStorage.getItem(`alert_${e.id}`)
        )
        if (newAlerts.length > 0) {
          newAlerts.forEach((e) => {
            localStorage.setItem(`alert_${e.id}`, '1')
            message.warning({
              content: (
                <div>
                  <strong>Experiment auto-stopped:</strong> {e.experiment_name}
                  <br />
                  <span style={{ fontSize: 12 }}>{e.reason}</span>
                </div>
              ),
              duration: 8,
            })
          })
          setAutoStopAlerts(autoStops)
        }
      } catch (err) {}
    }
    checkAutoStops()
    const interval = setInterval(checkAutoStops, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: collapsed ? 14 : 18,
            fontWeight: 'bold',
            background: 'rgba(255,255,255,0.05)',
          }}
        >
          {collapsed ? 'CI' : 'Chaos Injector'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            boxShadow: '0 1px 4px rgba(0,21,41,0.08)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            Service Mesh Chaos Engineering Platform
          </div>
        </Header>
        <Content style={{ margin: 24 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/topology" element={<Topology />} />
            <Route path="/faults" element={<ActiveFaults />} />
            <Route path="/slo" element={<SLOConfig />} />
            <Route path="/safety-events" element={<SafetyEvents />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
