import React, { useState, useEffect } from 'react';
import { RuleGroup, ExtensionSettings, Rule } from '../types';
import { ApiClient } from '../utils/api';
import { getRules, setRules } from '../utils/storage';

interface Props {
  settings: ExtensionSettings;
  groups: RuleGroup[];
  activeGroupId: string;
  onGroupsChange: (groups: RuleGroup[]) => void;
  onActiveGroupChange: (groupId: string) => void;
  onRulesReload: () => void;
}

const GroupSelector: React.FC<Props> = ({
  settings,
  groups,
  activeGroupId,
  onGroupsChange,
  onActiveGroupChange,
  onRulesReload,
}) => {
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RuleGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [switching, setSwitching] = useState(false);

  const api = new ApiClient(settings);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    try {
      const newGroup = await api.createGroup(groupName.trim(), groupDescription.trim() || undefined);
      const updatedGroups = [...groups, newGroup];
      onGroupsChange(updatedGroups);
      setShowGroupForm(false);
      setGroupName('');
      setGroupDescription('');
    } catch (error) {
      console.error('Create group error:', error);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !groupName.trim()) return;
    try {
      const updated = await api.updateGroup(editingGroup.id, groupName.trim(), groupDescription.trim() || undefined);
      const updatedGroups = groups.map(g => (g.id === updated.id ? updated : g));
      onGroupsChange(updatedGroups);
      setShowGroupForm(false);
      setEditingGroup(null);
      setGroupName('');
      setGroupDescription('');
    } catch (error) {
      console.error('Update group error:', error);
    }
  };

  const handleDeleteGroup = async (group: RuleGroup) => {
    if (group.isActive) {
      alert('Cannot delete active group');
      return;
    }
    if (!confirm(`Delete group "${group.name}"?`)) return;

    try {
      await api.deleteGroup(group.id);
      const updatedGroups = groups.filter(g => g.id !== group.id);
      onGroupsChange(updatedGroups);
    } catch (error) {
      console.error('Delete group error:', error);
    }
  };

  const handleSwitchGroup = async (group: RuleGroup) => {
    if (group.id === activeGroupId || switching) return;
    setSwitching(true);
    try {
      await api.activateGroup(group.id);
      const rules = await api.getRules();
      await setRules(rules);
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES', rules });

      const updatedGroups = groups.map(g => ({
        ...g,
        isActive: g.id === group.id,
      }));
      onGroupsChange(updatedGroups);
      onActiveGroupChange(group.id);
      onRulesReload();
    } catch (error) {
      console.error('Switch group error:', error);
    } finally {
      setSwitching(false);
    }
  };

  const openEditForm = (group: RuleGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setShowGroupForm(true);
  };

  return (
    <div className="mb-16">
      <div className="flex justify-between items-center mb-8">
        <span className="form-label">Active Rule Group</span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setEditingGroup(null);
            setGroupName('');
            setGroupDescription('');
            setShowGroupForm(true);
          }}
        >
          + New Group
        </button>
      </div>

      <div className="rule-card">
        <select
          className="form-select"
          value={activeGroupId}
          onChange={e => {
            const group = groups.find(g => g.id === e.target.value);
            if (group) handleSwitchGroup(group);
          }}
          disabled={switching}
        >
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name} {group.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-12">
        {groups.map(group => (
          <div key={group.id} className={`rule-card ${group.id === activeGroupId ? '' : 'disabled'}`}>
            <div className="rule-header">
              <div>
                <span className="rule-name">{group.name}</span>
                {group.id === activeGroupId && (
                  <span className="badge badge-status success ml-8">Active</span>
                )}
              </div>
            </div>
            {group.description && (
              <div className="text-xs text-muted mb-8">{group.description}</div>
            )}
            <div className="rule-actions">
              {group.id !== activeGroupId && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSwitchGroup(group)}
                  disabled={switching}
                >
                  Switch
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => openEditForm(group)}>
                Edit
              </button>
              {group.id !== activeGroupId && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteGroup(group)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showGroupForm && (
        <div className="modal-overlay" onClick={() => setShowGroupForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingGroup ? 'Edit Group' : 'New Group'}
              </span>
              <button className="modal-close" onClick={() => setShowGroupForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  className="form-input"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g., Development"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  value={groupDescription}
                  onChange={e => setGroupDescription(e.target.value)}
                  placeholder="e.g., Rules for dev environment"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGroupForm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupSelector;
