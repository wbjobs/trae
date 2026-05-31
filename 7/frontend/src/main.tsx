import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import AppLayout from '@/components/Layout';
import DataSources from '@/pages/DataSources';
import Dashboard from '@/pages/Dashboard';
import AnomalyDetection from '@/pages/AnomalyDetection';
import Alerts from '@/pages/Alerts';
import ShareView from '@/pages/ShareView';
import './index.css';

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/share/:token" element={<ShareView />} />
          <Route
            path="*"
            element={
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/datasources" element={<DataSources />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/anomaly-detection" element={<AnomalyDetection />} />
                  <Route path="/alerts" element={<Alerts />} />
                </Routes>
              </AppLayout>
            }
          />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
