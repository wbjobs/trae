import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import CardList from '@/pages/CardList';
import CardRegister from '@/pages/CardRegister';
import PermissionGroups from '@/pages/PermissionGroups';
import AccessLogs from '@/pages/AccessLogs';
import RemoteControl from '@/pages/RemoteControl';
import Settings from '@/pages/Settings';
import SuspiciousCards from '@/pages/SuspiciousCards';
import Layout from '@/components/Layout';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="cards" element={<CardList />} />
        <Route path="cards/register" element={<CardRegister />} />
        <Route path="permissions" element={<PermissionGroups />} />
        <Route path="logs" element={<AccessLogs />} />
        <Route path="remote" element={<RemoteControl />} />
        <Route path="security" element={<SuspiciousCards />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
