import React from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  DashboardOutlined,
  DatabaseOutlined,
  ExtensionOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './components/Dashboard.jsx'
import StateExplorer from './components/StateExplorer.jsx'
import PluginManager from './components/PluginManager.jsx'
import Settings from './components/Settings.jsx'

const { Header, Sider, Content } = Layout

const App = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '监控面板',
    },
    {
      key: '/state',
      icon: <DatabaseOutlined />,
      label: '状态管理',
    },
    {
      key: '/plugins',
      icon: <ExtensionOutlined />,
      label: 'Wasm 插件',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        theme="dark"
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
          Dapr Wasm State
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
            padding: 0,
            background: colorBgContainer,
          }}
        >
          <div style={{ padding: '0 24px', fontSize: 18, fontWeight: 500 }}>
            状态管理系统
          </div>
        </Header>
        <Content
          style={{
            margin: '16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/state" element={<StateExplorer />} />
            <Route path="/plugins" element={<PluginManager />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
