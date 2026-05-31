import { useEffect, useState } from 'react';
import {
  Plus,
  Shield,
  Clock,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  X,
  Check,
} from 'lucide-react';
import {
  getPermissionGroups,
  createPermissionGroup,
  getTimeRules,
  addTimeRule,
  deleteTimeRule,
} from '@/services/api';
import { PermissionGroup, TimeRule, DAY_OF_WEEK_LABELS, WORK_DAYS, WEEKEND, DayOfWeek } from '@/types';
import clsx from 'clsx';

export default function PermissionGroups() {
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [timeRules, setTimeRules] = useState<Record<string, TimeRule[]>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [newRuleDay, setNewRuleDay] = useState<DayOfWeek>(1);
  const [newRuleStartTime, setNewRuleStartTime] = useState('09:00');
  const [newRuleEndTime, setNewRuleEndTime] = useState('18:00');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await getPermissionGroups();
      setGroups(data);
    } catch (error) {
      console.error('Failed to load permission groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeRules = async (groupId: string) => {
    try {
      const rules = await getTimeRules(groupId);
      setTimeRules((prev) => ({ ...prev, [groupId]: rules }));
    } catch (error) {
      console.error('Failed to load time rules:', error);
    }
  };

  const handleToggleGroup = async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
    } else {
      setExpandedGroup(groupId);
      if (!timeRules[groupId]) {
        await loadTimeRules(groupId);
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setSaving(true);
    try {
      await createPermissionGroup(newGroupName, newGroupDesc);
      await loadGroups();
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = async () => {
    if (!selectedGroupId) return;
    setSaving(true);
    try {
      await addTimeRule({
        permissionGroupId: selectedGroupId,
        dayOfWeek: newRuleDay,
        startTime: newRuleStartTime,
        endTime: newRuleEndTime,
        timezone: 'Asia/Shanghai',
        description: newRuleDesc,
      });
      await loadTimeRules(selectedGroupId);
      setShowAddRuleModal(false);
      setNewRuleDesc('');
    } catch (error) {
      console.error('Failed to add time rule:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (groupId: string, ruleId: string) => {
    if (!confirm('确定要删除此时间段规则吗？')) return;
    try {
      await deleteTimeRule(ruleId);
      await loadTimeRules(groupId);
    } catch (error) {
      console.error('Failed to delete time rule:', error);
    }
  };

  const addWorkDayRules = async (groupId: string) => {
    setSaving(true);
    try {
      for (const day of WORK_DAYS) {
        await addTimeRule({
          permissionGroupId: groupId,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '18:00',
          timezone: 'Asia/Shanghai',
          description: '工作日',
        });
      }
      await loadTimeRules(groupId);
    } catch (error) {
      console.error('Failed to add work day rules:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">管理权限组和时间段访问规则</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建权限组
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))
        ) : groups.length === 0 ? (
          <div className="card p-12 text-center">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">暂无权限组</p>
            <p className="text-sm text-gray-400 mt-1">点击上方按钮创建第一个权限组</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="card overflow-hidden">
              <div
                className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => handleToggleGroup(group.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{group.name}</h3>
                    {group.description && (
                      <p className="text-sm text-gray-500">{group.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Users className="w-4 h-4" />
                    {group.card_count} 张卡片
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    {timeRules[group.id]?.length || 0} 条规则
                  </div>
                  {expandedGroup === group.id ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {expandedGroup === group.id && (
                <div className="border-t border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-700">时间段规则</h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addWorkDayRules(group.id)}
                        className="btn-secondary text-sm py-1.5"
                      >
                        快速添加工作日
                      </button>
                      <button
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setShowAddRuleModal(true);
                        }}
                        className="btn-primary text-sm py-1.5"
                      >
                        添加规则
                      </button>
                    </div>
                  </div>

                  {!timeRules[group.id] || timeRules[group.id].length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                      暂无时间段规则，将允许全天候访问
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {timeRules[group.id].map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <span className="px-2 py-1 rounded bg-primary-100 text-primary-700 text-sm font-medium">
                              {DAY_OF_WEEK_LABELS[rule.day_of_week as DayOfWeek] || '每天'}
                            </span>
                            <span className="text-gray-600">
                              {rule.start_time} - {rule.end_time}
                            </span>
                            {rule.description && (
                              <span className="text-sm text-gray-400">({rule.description})</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteRule(group.id, rule.id)}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">新建权限组</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  权限组名称
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="例如：全体员工"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述说明
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="可选：描述此权限组的用途"
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={saving || !newGroupName.trim()}
                className={clsx(
                  'btn-primary',
                  (saving || !newGroupName.trim()) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">添加时间段规则</h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  星期
                </label>
                <select
                  value={newRuleDay}
                  onChange={(e) => setNewRuleDay(Number(e.target.value) as DayOfWeek)}
                  className="input-field"
                >
                  {Object.entries(DAY_OF_WEEK_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    开始时间
                  </label>
                  <input
                    type="time"
                    value={newRuleStartTime}
                    onChange={(e) => setNewRuleStartTime(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    结束时间
                  </label>
                  <input
                    type="time"
                    value={newRuleEndTime}
                    onChange={(e) => setNewRuleEndTime(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述说明
                </label>
                <input
                  type="text"
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  placeholder="可选：例如 工作时间"
                  className="input-field"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleAddRule}
                disabled={saving}
                className={clsx('btn-primary', saving && 'opacity-50 cursor-not-allowed')}
              >
                {saving ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
