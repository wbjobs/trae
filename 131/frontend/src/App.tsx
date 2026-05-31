import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Rules from './pages/Rules';
import RuleEditor from './pages/RuleEditor';
import Settings from './pages/Settings';
import Sampling from './pages/Sampling';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar />
        <Layout>
          <Header />
          <Content style={{ margin: '24px' }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/rules/new" element={<RuleEditor />} />
              <Route path="/rules/:id/edit" element={<RuleEditor />} />
              <Route path="/sampling" element={<Sampling />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Router>
  );
};

export default App;
