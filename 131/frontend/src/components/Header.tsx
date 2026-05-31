import React, { useState, useEffect } from 'react';
import { Button, Badge, Space, Tooltip } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloudSyncOutlined } from '@ant-design/icons';
import { healthApi } from '../services/api';

const Header: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const data = await healthApi.getHealth();
      setHealth(data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health?.services?.etcd === 'healthy';

  return (
    <Layout.Header
      style={{
        background: '#001529',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <div style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>
        APISIX 灰度路由管理平台
      </div>
      <Space>
        <Tooltip title={isHealthy ? '系统运行正常' : '系统异常'}>
          <Badge status={isHealthy ? 'success' : 'error'} offset={[-5, 0]}>
            <Button
              type="text"
              icon={isHealthy ? <CheckCircleOutlined /> : <CloudSyncOutlined />}
              style={{ color: 'white' }}
            >
              {isHealthy ? '已连接' : '连接中...'}
            </Button>
          </Badge>
        </Tooltip>
        <Button
          type="text"
          icon={<ReloadOutlined spin={loading} />}
          onClick={fetchHealth}
          style={{ color: 'white' }}
        >
          刷新
        </Button>
      </Space>
    </Layout.Header>
  );
};

export default Header;
