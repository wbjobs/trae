import React, { useState } from 'react';
import { Modal, Input, Button, Space, Tag, Spin, Result } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { rulesApi } from '../services/api';
import { GrayRule, TestRuleResult } from '../types';

interface TestRuleModalProps {
  visible: boolean;
  rule: GrayRule | null;
  onClose: () => void;
}

const TestRuleModal: React.FC<TestRuleModalProps> = ({ visible, rule, onClose }) => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestRuleResult | null>(null);

  const handleTest = async () => {
    if (!rule || !userId) return;

    setLoading(true);
    setResult(null);
    try {
      const testResult = await rulesApi.test(rule.id, userId);
      setResult(testResult);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUserId('');
    setResult(null);
    onClose();
  };

  return (
    <Modal
      title={`测试规则: ${rule?.name || ''}`}
      open={visible}
      onCancel={handleClose}
      footer={[
        <Button key="close" onClick={handleClose}>
          关闭
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: '#888', marginBottom: 8 }}>
          输入用户 ID 来测试该规则是否匹配
        </p>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            prefix={<UserOutlined />}
            placeholder="请输入用户 ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onPressEnter={handleTest}
          />
          <Button type="primary" onClick={handleTest} loading={loading}>
            测试
          </Button>
        </Space.Compact>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      )}

      {result && !loading && (
        <div
          className={`test-result ${
            result.matches ? 'test-result-success' : 'test-result-fail'
          }`}
        >
          <Result
            status={result.matches ? 'success' : 'info'}
            title={
              result.matches
                ? `匹配成功，将路由到 ${result.upstreamType?.toUpperCase()}`
                : '未匹配到任何条件'
            }
            subTitle={
              result.matches
                ? '该用户会被路由到指定的上游服务'
                : '该用户不会被此规则匹配'
            }
          />

          {result.hashValue !== undefined && (
            <div style={{ marginTop: 16 }}>
              <Tag color="blue">哈希值: {result.hashValue}</Tag>
              <Tag color="purple">
                百分比阈值: {result.percentage}%
              </Tag>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default TestRuleModal;
