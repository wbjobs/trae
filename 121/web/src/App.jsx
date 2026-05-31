import React, { useState, useEffect } from 'react';
import { Layout, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import BackupList from './components/BackupList.jsx';
import BackupDetail from './components/BackupDetail.jsx';

const { Header, Content } = Layout;
const { Title } = Typography;

export default function App() {
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setSelectedBackup(null);
  };

  const handleSelect = (backup) => {
    setSelectedBackup(backup);
  };

  const handleBack = () => {
    setSelectedBackup(null);
  };

  return (
    <Layout className="app-container">
      <Header className="app-header">
        <DatabaseOutlined style={{ fontSize: 24, marginRight: 12, color: '#1677ff' }} />
        <Title level={3} style={{ margin: 0 }}>数据库备份管理</Title>
      </Header>
      <Content className="app-content">
        {selectedBackup ? (
          <BackupDetail
            backup={selectedBackup}
            onBack={handleBack}
            refreshKey={refreshKey}
            onRefresh={handleRefresh}
          />
        ) : (
          <BackupList
            onSelect={handleSelect}
            refreshKey={refreshKey}
            onRefresh={handleRefresh}
          />
        )}
      </Content>
    </Layout>
  );
}
