import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Layout, Menu, Badge } from 'antd';
import {
  DashboardOutlined,
  AlertOutlined,
  SettingOutlined,
  BellOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import AlertHistory from './pages/AlertHistory';
import AlertConfig from './pages/AlertConfig';
import RootCauseAnalysis from './pages/RootCauseAnalysis';
import { wsService } from './services/websocketService';
import { StatisticsData, AnomalyResult, RootCauseAnalysis as RootCauseAnalysisType } from './types';

const { Header, Sider, Content } = Layout;

const App: React.FC = () => {
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8083/ws/anomaly';
    wsService.connect(wsUrl);

    const unsubscribe = wsService.subscribe((message) => {
      if ('type' in message && message.type === 'statistics') {
        const stats = message as StatisticsData;
        setAnomalyCount(stats.totalAnomalies);
        setConnected(stats.activeConnections > 0);
      } else if ('isAnomaly' in message && (message as AnomalyResult).isAnomaly) {
        setAnomalyCount(prev => prev + 1);
      }
    });

    return () => {
      unsubscribe();
      wsService.disconnect();
    };
  }, []);

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: <Link to="/">实时监控</Link>,
    },
    {
      key: '/root-cause',
      icon: <ThunderboltOutlined />,
      label: <Link to="/root-cause">根因分析</Link>,
    },
    {
      key: '/alerts',
      icon: <AlertOutlined />,
      label: <Link to="/alerts">告警历史</Link>,
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: <Link to="/config">告警配置</Link>,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#001529', 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
          🔍 实时数据流异常检测平台
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Badge count={anomalyCount} offset={[5, 0]}>
            <BellOutlined style={{ color: 'white', fontSize: '20px' }} />
          </Badge>
          <span style={{ color: connected ? '#52c41a' : '#ff4d4f' }}>
            {connected ? '● 已连接' : '○ 未连接'}
          </span>
        </div>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            defaultSelectedKeys={['/']}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px' }}>
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: '#fff',
              borderRadius: '8px',
              marginTop: '24px',
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/root-cause" element={<RootCauseAnalysis />} />
              <Route path="/alerts" element={<AlertHistory />} />
              <Route path="/config" element={<AlertConfig />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default App;
