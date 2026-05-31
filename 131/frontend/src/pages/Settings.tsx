import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Tabs, Descriptions, Tag, Space } from 'antd';
import { SaveOutlined, ReloadOutlined, ApiOutlined } from '@ant-design/icons';
import { healthApi } from '../services/api';

const Settings: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await healthApi.getConfig();
      setConfig(data);
    } catch (error) {
      message.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await healthApi.publishConfig(config);
      message.success('配置发布成功');
      loadConfig();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>系统设置</h1>
        <p style={{ color: '#888', marginTop: 8 }}>管理灰度路由系统配置</p>
      </div>

      <Card
        title="系统信息"
        className="card-shadow"
        style={{ marginBottom: 24 }}
      >
        <Descriptions column={2} bordered size="middle">
          <Descriptions.Item label="系统名称">
            APISIX 灰度路由管理平台
          </Descriptions.Item>
          <Descriptions.Item label="版本">1.0.0</Descriptions.Item>
          <Descriptions.Item label="插件版本">v2.0</Descriptions.Item>
          <Descriptions.Item label="配置来源">
            <Tag color="green">etcd</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="热更新">
            <Tag color="green">已启用</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="双缓冲">
            <Tag color="green">已启用</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="当前配置"
        className="card-shadow"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadConfig} loading={loading}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              发布配置
            </Button>
          </Space>
        }
      >
        <Tabs
          items={[
            {
              key: 'rules',
              label: '规则配置',
              children: (
                <div>
                  <p>当前配置了 {config?.rules?.length || 0} 条规则</p>
                  <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
                    {JSON.stringify(config, null, 2)}
                  </pre>
                </div>
              ),
            },
            {
              key: 'advanced',
              label: '高级配置',
              children: (
                <div>
                  <Descriptions column={1} bordered size="middle">
                    <Descriptions.Item label="etcd 配置">
                      作为配置存储和热更新
                    </Descriptions.Item>
                    <Descriptions.Item label="热更新机制">
                      双缓冲 + 防抖（1秒）
                    </Descriptions.Item>
                    <Descriptions.Item label="配置验证">
                      保存前自动验证
                    </Descriptions.Item>
                    <Descriptions.Item label="降级策略">
                      etcd 不可用时使用内存缓存
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default Settings;
