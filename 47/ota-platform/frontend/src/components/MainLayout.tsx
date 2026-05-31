import { Layout, Menu, Avatar, Dropdown, Button } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined,
  DesktopOutlined,
  TeamOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  BarChartOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons'

const { Header, Sider, Content } = Layout

const MainLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '数据概览',
      onClick: () => navigate('/'),
    },
    {
      key: '/devices',
      icon: <DesktopOutlined />,
      label: '设备管理',
      onClick: () => navigate('/devices'),
    },
    {
      key: '/device-groups',
      icon: <TeamOutlined />,
      label: '设备分组',
      onClick: () => navigate('/device-groups'),
    },
    {
      key: '/firmware',
      icon: <CloudServerOutlined />,
      label: '固件管理',
      onClick: () => navigate('/firmware'),
    },
    {
      key: '/upgrade-tasks',
      icon: <CloudUploadOutlined />,
      label: '升级任务',
      onClick: () => navigate('/upgrade-tasks'),
    },
    {
      key: '/statistics',
      icon: <BarChartOutlined />,
      label: '数据统计',
      onClick: () => navigate('/statistics'),
    },
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  return (
    <Layout className="app-layout">
      <Sider theme="dark" width={220}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 'bold' }}>
          <CloudUploadOutlined style={{ marginRight: 8, fontSize: 24 }} />
          OTA 管理平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div style={{ color: 'white', fontSize: 16 }}>
            嵌入式设备 OTA 升级管理平台
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <span style={{ color: 'white' }}>{user.realName || user.username || '用户'}</span>
              </div>
            </Dropdown>
            <Button type="primary" danger size="small" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
