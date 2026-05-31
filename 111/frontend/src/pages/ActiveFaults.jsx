import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Card,
  Spin,
  Tooltip,
  Popconfirm,
  message,
} from 'antd'
import {
  ReloadOutlined,
  StopOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { faultsApi, experimentsApi } from '../api/index.js'

const { Title, Text } = Typography

const faultTypeColors = {
  delay: 'blue',
  abort: 'red',
  interrupt: 'orange',
  compound: 'geekblue',
}

const faultTypeLabels = {
  delay: 'DELAY',
  abort: 'ABORT',
  interrupt: 'INTERRUPT',
  compound: 'DELAY+ABORT',
}

export default function ActiveFaults() {
  const [loading, setLoading] = useState(false)
  const [faults, setFaults] = useState([])
  const [experiments, setExperiments] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [faultRes, expRes] = await Promise.all([
        faultsApi.list(),
        experimentsApi.list(),
      ])
      setFaults(faultRes.data)
      setExperiments(expRes.data.filter((e) => e.status === 'running' || e.status === 'paused'))
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleStopExperiment = async (experimentId) => {
    try {
      await experimentsApi.stop(experimentId)
      message.success('Experiment stopped')
      loadData()
    } catch (err) {
      message.error('Failed to stop experiment')
    }
  }

  const columns = [
    {
      title: 'Experiment ID',
      dataIndex: 'ExperimentID',
      key: 'experimentId',
      render: (id) => <Text code>{id.substring(0, 8)}...</Text>,
    },
    {
      title: 'Target',
      key: 'target',
      render: (_, record) => (
        <Text>
          {record.Target?.service}.{record.Target?.namespace}
        </Text>
      ),
    },
    {
      title: 'Fault Type',
      dataIndex: 'FaultType',
      key: 'faultType',
      render: (type, record) => {
        if (record.IsCompound) {
          return <Tag color="geekblue">DELAY+ABORT</Tag>
        }
        const label = faultTypeLabels[type] || type.toUpperCase()
        return <Tag color={faultTypeColors[type]}>{label}</Tag>
      },
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, record) => {
        if (record.IsCompound) {
          const parts = []
          if (record.DelayPercent > 0) {
            parts.push(`delay ${record.DelayMs}ms @ ${record.DelayPercent}%`)
          }
          if (record.AbortPercent > 0) {
            parts.push(`abort HTTP ${record.HTTPStatus} @ ${record.AbortPercent}%`)
          }
          return <Text>{parts.join(' + ') || 'compound'}</Text>
        }
        if (record.FaultType === 'delay') {
          return <Text>{record.DelayMs}ms @ {record.DelayPercent}%</Text>
        }
        if (record.FaultType === 'abort') {
          return <Text>HTTP {record.HTTPStatus} @ {record.AbortPercent}%</Text>
        }
        if (record.FaultType === 'interrupt') {
          return <Text>connection reset @ {record.InterruptPercent}%</Text>
        }
        return <Text>-</Text>
      },
    },
    {
      title: 'Applied At',
      dataIndex: 'AppliedAt',
      key: 'appliedAt',
      render: (t) => new Date(t).toLocaleString(),
    },
  ]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ marginTop: 0 }}>
          Active Faults
        </Title>
        <Button icon={<ReloadOutlined />} onClick={loadData}>
          Refresh
        </Button>
      </div>

      <Spin spinning={loading}>
        <Card title="Running Experiments" style={{ marginBottom: 16 }}>
          {experiments.length === 0 ? (
            <Text type="secondary">No active experiments</Text>
          ) : (
            <Space wrap>
              {experiments.map((exp) => (
                <Card
                  key={exp.id}
                  size="small"
                  title={exp.name}
                  extra={
                    <Popconfirm
                      title="Stop this experiment?"
                      onConfirm={() => handleStopExperiment(exp.id)}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<StopOutlined />}
                        size="small"
                      />
                    </Popconfirm>
                  }
                  style={{ width: 280 }}
                >
                  <div>
                    {exp.fault_type === 'compound' ? (
                      <Tag color="geekblue">DELAY+ABORT</Tag>
                    ) : (
                      <Tag color={faultTypeColors[exp.fault_type]}>
                        {faultTypeLabels[exp.fault_type] || exp.fault_type.toUpperCase()}
                      </Tag>
                    )}
                    <Tag
                      color={exp.status === 'running' ? 'processing' : 'warning'}
                    >
                      {exp.status.toUpperCase()}
                    </Tag>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">Targets: </Text>
                    {exp.targets.map((t) => (
                      <Tag key={`${t.service}-${t.namespace}`}>
                        {t.service}
                      </Tag>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    <Text type="secondary">Duration: {exp.duration}</Text>
                  </div>
                </Card>
              ))}
            </Space>
          )}
        </Card>

        <Card title="Fault Injections">
          <Table
            dataSource={faults}
            columns={columns}
            rowKey={(r) => `${r.ExperimentID}-${r.Target?.service}`}
            locale={{ emptyText: 'No active fault injections' }}
            pagination={false}
          />
        </Card>
      </Spin>
    </div>
  )
}
