import React, { useState, useEffect } from 'react';
import {
  Button,
  Space,
  Modal,
  message,
  Popconfirm,
  Input,
  Select,
  Tag,
  Form,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  ImportOutlined,
  ExportOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { rulesApi } from '../services/api';
import { GrayRule } from '../types';
import RuleCard from '../components/RuleCard';
import TestRuleModal from '../components/TestRuleModal';

const Rules: React.FC = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState<GrayRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testingRule, setTestingRule] = useState<GrayRule | null>(null);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await rulesApi.getAll();
      setRules(data);
    } catch (error) {
      message.error('加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleEdit = (rule: GrayRule) => {
    navigate(`/rules/${rule.id}/edit`);
  };

  const handleDelete = async (rule: GrayRule) => {
    try {
      await rulesApi.delete(rule.id);
      message.success('规则删除成功');
      loadRules();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '删除失败');
    }
  };

  const handleToggle = async (rule: GrayRule, enabled: boolean) => {
    try {
      await rulesApi.toggle(rule.id, enabled);
      message.success(`规则已${enabled ? '启用' : '禁用'}`);
      loadRules();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '操作失败');
    }
  };

  const handleTest = (rule: GrayRule) => {
    setTestingRule(rule);
    setTestModalVisible(true);
  };

  const handleExport = async () => {
    try {
      const rulesData = await rulesApi.exportRules();
      const blob = new Blob([JSON.stringify(rulesData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gray-rules.json';
      a.click();
      URL.revokeObjectURL(url);
      message.success('规则导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const rulesData = JSON.parse(event.target?.result as string);
          await rulesApi.importRules(rulesData);
          message.success('规则导入成功');
          loadRules();
        } catch (error) {
          message.error('导入失败，请检查文件格式');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredRules = rules.filter((rule) => {
    if (searchText && !rule.name.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (filterType !== 'all' && rule.upstream.type !== filterType) {
      return false;
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'enabled' && !rule.enabled) return false;
      if (filterStatus === 'disabled' && rule.enabled) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>灰度规则</h1>
          <p style={{ color: '#888', marginTop: 8 }}>管理灰度路由规则配置</p>
        </div>
        <Space>
          <Button icon={<ImportOutlined />} onClick={handleImport}>
            导入
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadRules} loading={loading}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/rules/new')}
          >
            新建规则
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', gap: 16 }}>
        <Input
        placeholder="搜索规则名称"
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ width: 240 }}
        allowClear
      />
      <Select
        value={filterType}
        onChange={setFilterType}
        style={{ width: 120 }}
        options={[
          { value: 'all', label: '全部版本' },
          { value: 'v1', label: 'V1' },
          { value: 'v2', label: 'V2' },
          { value: 'canary', label: 'Canary' },
        ]}
      />
      <Select
        value={filterStatus}
        onChange={setFilterStatus}
        style={{ width: 120 }}
        options={[
          { value: 'all', label: '全部状态' },
          { value: 'enabled', label: '已启用' },
          { value: 'disabled', label: '已禁用' },
        ]}
      />
    </div>

      {filteredRules.length > 0 ? (
        filteredRules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onTest={handleTest}
          />
        ))
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: 80,
            background: 'white',
            borderRadius: 8,
            color: '#999',
          }}
        >
          {loading ? '加载中...' : '暂无规则，点击"新建规则"开始创建'}
        </div>
      )}

      <TestRuleModal
        visible={testModalVisible}
        rule={testingRule}
        onClose={() => setTestModalVisible(false)}
      />
    </div>
  );
};

export default Rules;
