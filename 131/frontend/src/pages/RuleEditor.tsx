import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Button,
  Space,
  Row,
  Col,
  Divider,
  Tag,
  message,
  Tooltip,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { rulesApi } from '../services/api';
import { GrayRule, CreateRuleRequest, UpstreamNode } from '../types';

const RuleEditor: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && id) {
      loadRule(id);
    }
  }, [isEdit, id]);

  const loadRule = async (ruleId: string) => {
    setLoading(true);
    try {
      const rule = await rulesApi.getById(ruleId);
      form.setFieldsValue({
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        priority: rule.priority,
        match: rule.match || {},
        upstream: {
          ...rule.upstream,
          nodes: rule.upstream.nodes || [{ host: '', port: 80, weight: 1 }],
        },
      });
    } catch (error) {
      message.error('加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const request: CreateRuleRequest = {
        name: values.name,
        description: values.description,
        enabled: values.enabled,
        priority: values.priority,
        match: values.match,
        upstream: {
          ...values.upstream,
          nodes: values.upstream.nodes?.filter(
            (node: UpstreamNode) => node.host && node.port
          ),
        },
      };

      if (isEdit && id) {
        await rulesApi.update(id, request);
        message.success('规则更新成功');
      } else {
        await rulesApi.create(request);
        message.success('规则创建成功');
      }

      navigate('/rules');
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(error?.response?.data?.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/rules')}
          />
          <div>
            <h1 style={{ margin: 0 }}>{isEdit ? '编辑规则' : '新建规则'}</h1>
            <p style={{ color: '#888', marginTop: 4 }}>
              配置灰度路由规则，支持按请求头、用户ID等条件匹配
            </p>
          </div>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
      ) : (
        <Card className="card-shadow">
          <Alert
            message="规则配置说明"
            description="规则按优先级从高到低匹配，第一个匹配的规则将被应用。如果没有匹配到任何规则，将使用默认上游。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              enabled: true,
              priority: 0,
              match: {
                header: 'x-version',
                user_id_header: 'x-user-id',
              },
              upstream: {
                type: 'v1',
                nodes: [{ host: '', port: 80, weight: 1 }],
              },
            }}
          >
            <div className="form-section">
              <div className="form-section-title">基本信息</div>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="name"
                    label="规则名称"
                    rules={[{ required: true, message: '请输入规则名称' }]}
                  >
                    <Input placeholder="请输入规则名称" maxLength={100} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="description" label="描述">
                    <Input.TextArea
                      placeholder="请输入规则描述"
                      maxLength={500}
                      rows={1}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item name="enabled" label="启用状态" valuePropName="checked">
                    <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="priority"
                    label={
                      <Tooltip title="数值越大优先级越高，优先匹配">
                        优先级
                        <InfoCircleOutlined
                          style={{ color: '#999', marginLeft: 4 }}
                        />
                      </Tooltip>
                    }
                  >
                    <InputNumber style={{ width: '100%' }} min={0} max={9999} />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            <Divider />

            <div className="form-section">
              <div className="form-section-title">
                匹配条件
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  可选
                </Tag>
              </div>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name={['match', 'header']} label="请求头名称">
                    <Input placeholder="例如: x-version" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name={['match', 'value']} label="请求头值">
                    <Input placeholder="例如: v2" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name={['match', 'percentage']}
                    label={
                      <Tooltip title="0-100，表示匹配的流量百分比">
                        流量百分比
                        <InfoCircleOutlined
                          style={{ color: '#999', marginLeft: 4 }}
                        />
                      </Tooltip>
                    }
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      max={100}
                      placeholder="0-100"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['match', 'hash_key']} label="哈希密钥">
                    <Input placeholder="用于一致性哈希的密钥" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name={['match', 'user_id_header']}
                    label="用户ID请求头"
                  >
                    <Input placeholder="例如: x-user-id" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name={['match', 'user_ids']}
                label="白名单用户ID"
                tooltip="指定的用户ID将始终匹配此规则"
              >
                <Select
                  mode="tags"
                  placeholder="输入用户ID后按回车添加"
                  style={{ width: '100%' }}
                  tokenSeparators={[',']}
                />
              </Form.Item>
            </div>

            <Divider />

            <div className="form-section">
              <div className="form-section-title">
                上游配置
                <Tag color="red" style={{ marginLeft: 8 }}>
                  必填
                </Tag>
              </div>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name={['upstream', 'type']}
                    label="上游版本"
                    rules={[{ required: true, message: '请选择上游版本' }]}
                  >
                    <Select
                      options={[
                        { value: 'v1', label: 'V1 (稳定版)' },
                        { value: 'v2', label: 'V2 (新版本)' },
                        { value: 'canary', label: 'Canary (金丝雀)' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['upstream', 'upstream_id']} label="上游ID">
                    <Input placeholder="引用现有上游ID，或手动配置节点" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.List name={['upstream', 'nodes']}>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <div key={field.key} className="node-item">
                        <Row gutter={8} align="middle">
                          <Col xs={10}>
                            <Form.Item
                              name={[field.name, 'host']}
                              rules={[{ required: true, message: '主机地址' }]}
                              noStyle
                            >
                              <Input placeholder="主机地址" />
                            </Form.Item>
                          </Col>
                          <Col xs={6}>
                            <Form.Item
                              name={[field.name, 'port']}
                              rules={[{ required: true, message: '端口' }]}
                              noStyle
                            >
                              <InputNumber
                                placeholder="端口"
                                min={1}
                                max={65535}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={6}>
                            <Form.Item
                              name={[field.name, 'weight']}
                              noStyle
                            >
                              <InputNumber
                                placeholder="权重"
                                min={1}
                                max={100}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={2}>
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => remove(field.name)}
                            />
                          </Col>
                        </Row>
                      </div>
                    ))}
                    <Form.Item>
                      <Button
                        type="dashed"
                        onClick={() => add({ host: '', port: 80, weight: 1 })}
                        icon={<PlusOutlined />}
                        block
                      >
                        添加节点
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>
            </div>

            <Divider />

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  loading={saving}
                >
                  保存
                </Button>
                <Button onClick={() => navigate('/rules')}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}
    </div>
  );
};

export default RuleEditor;
