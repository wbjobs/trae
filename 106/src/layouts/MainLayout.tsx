import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { PasswordList } from '../components/PasswordList';
import { PasswordDetail } from '../components/PasswordDetail';
import { AddPasswordModal } from '../components/AddPasswordModal';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { EmergencyContactsPanel } from '../components/EmergencyContactsPanel';
import { Plus } from 'lucide-react';
import { useAppStore } from '../store';
import './MainLayout.css';

export default function MainLayout() {
  const [activeView, setActiveView] = useState<'passwords' | 'analysis' | 'settings' | 'emergency'>('passwords');
  const [showAddModal, setShowAddModal] = useState(false);
  const selectedPassword = useAppStore((state) => state.selectedPassword);
  const setSelectedPassword = useAppStore((state) => state.setSelectedPassword);

  return (
    <div className="main-layout">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <div className="main-content">
        {activeView === 'passwords' && (
          <div className="passwords-view">
            <div className="passwords-header">
              <h2>密码库</h2>
              <button
                className="add-password-btn"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={20} />
                添加密码
              </button>
            </div>

            <div className="passwords-container">
              <PasswordList
                onSelect={(pwd) => setSelectedPassword(pwd)}
                selectedId={selectedPassword?.id}
              />
              <PasswordDetail
                password={selectedPassword}
                onClose={() => setSelectedPassword(null)}
              />
            </div>
          </div>
        )}

        {activeView === 'analysis' && <AnalysisPanel />}

        {activeView === 'emergency' && (
          <EmergencyContactsPanel onBack={() => setActiveView('passwords')} />
        )}

        {activeView === 'settings' && <SettingsPanel />}
      </div>

      {showAddModal && (
        <AddPasswordModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
