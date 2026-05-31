import React from 'react'
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Descriptions,
  Divider,
} from 'antd'
import {
  SaveOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'

const Settings = () => {
  const [form] = Form.useForm()

  const handleSave = (values) => {
    console.log('Settings saved:', values)
    message.success('设置已保存（示例）')
  }

  return (
    <div>
      <Card
        title="系统配置"
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => form.submit()}
          >
            保存
          </Button>
        }
      >
        <Descriptions
          column={2}
          size="middle"
          bordered
          style={{ marginBottom: 24 }}
        >
          <Descriptions.Item label="系统名称">
            Dapr Wasm State Manager
          </Descriptions.Item>
          <Descriptions.Item label="版本">
            1.0.0
          </Descriptions.Item>
          <Descriptions.Item label="存储类型">
            内存存储 / Redis
          </Descriptions.Item>
          <Descriptions.Item label="Wasm 运行时">
            wazero
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">存储配置</Divider>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            storeType: localStorage.getItem('STORE_TYPE') || 'memory',
            redisAddr: localStorage.getItem('REDIS_ADDR') || 'localhost:6379',
            redisPassword: '',
            redisKeyPrefix: 'dapr',
            pluginDir: './plugins',
            port: '8080',
          }}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="storeType"
            label="存储类型"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'memory', label: '内存存储' },
                { value: 'redis', label: 'Redis' },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.storeType !== currentValues.storeType
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('storeType') === 'redis' ? (
                <>
                  <Form.Item
                    name="redisAddr"
                    label="Redis 地址"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="localhost:6379" />
                  </Form.Item>
                  <Form.Item name="redisPassword" label="Redis 密码">
                    <Input.Password placeholder="可选" />
                  </Form.Item>
                  <Form.Item name="redisKeyPrefix" label="Key 前缀">
                    <Input placeholder="dapr" />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>

          <Divider orientation="left">Wasm 插件配置</Divider>

          <Form.Item
            name="pluginDir"
            label="插件目录"
            rules={[{ required: true }]}
          >
            <Input placeholder="./plugins" />
          </Form.Item>

          <Divider orientation="left">服务配置</Divider>

          <Form.Item
            name="port"
            label="服务端口"
            rules={[{ required: true }]}
          >
            <Input placeholder="8080" />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="API 文档"
        style={{ marginTop: 16 }}
      >
        <Descriptions
          column={1}
          size="small"
          bordered
        >
          <Descriptions.Item label="状态管理 API">
            <Space direction="vertical">
              <code>POST /api/v1/state/get</code>
              <code>POST /api/v1/state/set</code>
              <code>POST /api/v1/state/delete</code>
              <code>POST /api/v1/state/bulk_get</code>
              <code>POST /api/v1/state/bulk_set</code>
              <code>POST /api/v1/state/bulk_delete</code>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="监控 API">
            <Space direction="vertical">
              <code>GET /api/v1/metrics</code>
              <code>POST /api/v1/metrics/reset</code>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="插件 API">
            <Space direction="vertical">
              <code>GET /api/v1/plugins</code>
              <code>POST /api/v1/plugins/upload</code>
              <code>POST /api/v1/plugins/activate</code>
              <code>POST /api/v1/plugins/deactivate</code>
              <code>POST /api/v1/plugins/delete</code>
              <code>GET /api/v1/plugins/active</code>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  )
}

export default Settings
