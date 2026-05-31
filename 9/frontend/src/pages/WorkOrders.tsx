import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { workOrderApi, alertApi, operatorApi, Operator } from '../services/api'
import dayjs from 'dayjs'
import type { WorkOrder, WorkOrderStatus, WorkOrderPriority, Alert } from '../types'

const WorkOrders = () => {
  const { workOrders, setWorkOrders, currentDevice, activeAlerts } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<WorkOrderStatus | 'all'>('all')
  const [loading, setLoading] = useState(false)
  const [autoDispatch, setAutoDispatch] = useState(true)
  const [operators, setOperators] = useState<Operator[]>([])
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as WorkOrderPriority,
    assigned_to: '',
    alert_id: '',
    fault_type: '',
  })

  useEffect(() => {
    loadWorkOrders()
    loadOperators()
  }, [currentDevice])

  const loadWorkOrders = async () => {
    try {
      const orders = await workOrderApi.getAll(currentDevice?.device_id)
      setWorkOrders(orders)
    } catch (error) {
      console.error('Failed to load work orders:', error)
    }
  }

  const loadOperators = async () => {
    try {
      const ops = await operatorApi.getAll()
      setOperators(ops)
    } catch (error) {
      console.error('Failed to load operators:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setDispatchMessage(null)

    try {
      const orderData = {
        ...formData,
        device_id: currentDevice?.device_id || '',
      }

      if (autoDispatch) {
        const result = await workOrderApi.createWithDispatch(orderData, true)
        if (result.dispatch) {
          setDispatchMessage(result.dispatch.message)
        }
      } else {
        await workOrderApi.create(orderData)
      }

      loadWorkOrders()
      setShowForm(false)
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        assigned_to: '',
        alert_id: '',
        fault_type: '',
      })
    } catch (error) {
      console.error('Failed to create work order:', error)
      setDispatchMessage('创建工单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (orderId: string, status: WorkOrderStatus) => {
    try {
      await workOrderApi.update(orderId, { status })
      loadWorkOrders()
    } catch (error) {
      console.error('Failed to update work order:', error)
    }
  }

  const handleAutoReassign = async (orderId: string) => {
    setLoading(true)
    try {
      const result = await workOrderApi.reassign(orderId, undefined, true)
      if (result.success) {
        setDispatchMessage(result.message)
        loadWorkOrders()
      } else {
        setDispatchMessage(result.message)
      }
    } catch (error) {
      console.error('Failed to reassign work order:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('确定要删除这个工单吗？')) return
    try {
      await workOrderApi.delete(orderId)
      loadWorkOrders()
    } catch (error) {
      console.error('Failed to delete work order:', error)
    }
  }

  const filteredOrders =
    filter === 'all'
      ? workOrders
      : workOrders.filter((o) => o.status === filter)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-900/50 text-amber-300',
      in_progress: 'bg-blue-900/50 text-blue-300',
      completed: 'bg-emerald-900/50 text-emerald-300',
      cancelled: 'bg-slate-700 text-slate-400',
    }
    const labels: Record<string, string> = {
      pending: '待处理',
      in_progress: '处理中',
      completed: '已完成',
      cancelled: '已取消',
    }
    return (
      <span className={`px-2 py-1 rounded text-xs ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      high: 'bg-red-900/50 text-red-300 border-red-700',
      medium: 'bg-amber-900/50 text-amber-300 border-amber-700',
      low: 'bg-slate-700 text-slate-400 border-slate-600',
    }
    const labels: Record<string, string> = {
      high: '高',
      medium: '中',
      low: '低',
    }
    return (
      <span className={`px-2 py-1 rounded text-xs border ${styles[priority] || styles.medium}`}>
        {labels[priority] || priority}
      </span>
    )
  }

  const getOperatorName = (operatorId: string) => {
    const op = operators.find((o) => o.operator_id === operatorId)
    return op?.name || operatorId
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">运维工单</h1>
          <p className="text-slate-400 mt-1">
            管理设备的运维工单，包括创建、分配和处理
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={loadWorkOrders}
            disabled={loading}
          >
            🔄 刷新
          </button>
          <button className="btn-success" onClick={() => setShowForm(true)}>
            + 新建工单
          </button>
        </div>
      </div>

      {dispatchMessage && (
        <div className={`card p-4 mb-6 ${
          dispatchMessage.includes('成功') || dispatchMessage.includes('已分配')
            ? 'border-emerald-700 bg-emerald-900/20'
            : 'border-amber-700 bg-amber-900/20'
        }`}>
          <p className="text-slate-300">{dispatchMessage}</p>
        </div>
      )}

      {operators.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">运维人员</h3>
          <div className="grid grid-cols-4 gap-4">
            {operators.map((op) => (
              <div
                key={op.id}
                className={`p-3 rounded-lg border ${
                  op.workload > 3
                    ? 'bg-red-900/20 border-red-700'
                    : op.workload > 1
                    ? 'bg-amber-900/20 border-amber-700'
                    : 'bg-emerald-900/20 border-emerald-700'
                }`}
              >
                <div className="text-white font-medium">{op.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {op.specialization?.join(', ') || '综合维修'}
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-slate-500">
                    工作负荷: {op.workload}
                  </span>
                  <span className="text-yellow-400">
                    {'★'.repeat(Math.floor(op.rating))}
                    {op.rating.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">新建工单</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDispatch}
                  onChange={(e) => setAutoDispatch(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-slate-300">启用自动派单</span>
              </label>
              {autoDispatch && (
                <span className="text-xs text-emerald-400">
                  系统将根据区域、专业和工作量自动分配
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">工单标题</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="label">优先级</label>
                <select
                  className="input-field"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: e.target.value as WorkOrderPriority,
                    })
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">描述</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </div>
              {!autoDispatch && (
                <div>
                  <label className="label">分配给</label>
                  <select
                    className="input-field"
                    value={formData.assigned_to}
                    onChange={(e) =>
                      setFormData({ ...formData, assigned_to: e.target.value })
                    }
                  >
                    <option value="">-- 请选择 --</option>
                    {operators.map((op) => (
                      <option key={op.operator_id} value={op.operator_id}>
                        {op.name} ({op.specialization?.[0] || '综合维修'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">故障类型</label>
                <select
                  className="input-field"
                  value={formData.fault_type}
                  onChange={(e) =>
                    setFormData({ ...formData, fault_type: e.target.value })
                  }
                >
                  <option value="">-- 请选择 --</option>
                  <option value="temperature">温度异常</option>
                  <option value="pressure">压力异常</option>
                  <option value="rotation_speed">转速异常</option>
                  <option value="vibration">振动超标</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="label">关联告警（可选）</label>
                <select
                  className="input-field"
                  value={formData.alert_id}
                  onChange={(e) =>
                    setFormData({ ...formData, alert_id: e.target.value })
                  }
                >
                  <option value="">-- 不关联 --</option>
                  {activeAlerts.map((alert) => (
                    <option key={alert.id} value={alert.id}>
                      {alert.device_id} - {alert.message}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? '创建中...' : '创建工单'}
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                onClick={() => setShowForm(false)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-3xl font-bold text-white">{workOrders.length}</div>
          <div className="text-sm text-slate-400 mt-1">工单总数</div>
        </div>
        <div className="card p-4 border-amber-700">
          <div className="text-3xl font-bold text-amber-400">
            {workOrders.filter((o) => o.status === 'pending').length}
          </div>
          <div className="text-sm text-slate-400 mt-1">待处理</div>
        </div>
        <div className="card p-4 border-blue-700">
          <div className="text-3xl font-bold text-blue-400">
            {workOrders.filter((o) => o.status === 'in_progress').length}
          </div>
          <div className="text-sm text-slate-400 mt-1">处理中</div>
        </div>
        <div className="card p-4 border-emerald-700">
          <div className="text-3xl font-bold text-emerald-400">
            {workOrders.filter((o) => o.status === 'completed').length}
          </div>
          <div className="text-sm text-slate-400 mt-1">已完成</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            {(['all', 'pending', 'in_progress', 'completed', 'cancelled'] as const).map(
              (f) => (
                <button
                  key={f}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' && '全部'}
                  {f === 'pending' && '待处理'}
                  {f === 'in_progress' && '处理中'}
                  {f === 'completed' && '已完成'}
                  {f === 'cancelled' && '已取消'}
                </button>
              )
            )}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <div className="text-4xl mb-2">📋</div>
            <p>暂无工单</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredOrders.map((order) => (
              <div key={order.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getPriorityBadge(order.priority)}
                      {getStatusBadge(order.status)}
                      <span className="text-white font-medium">{order.title}</span>
                    </div>
                    <p className="text-slate-300 text-sm mb-3">{order.description}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>
                        设备: <span className="text-white">{order.device_id}</span>
                      </span>
                      {order.assigned_to && (
                        <span>
                          分配给:{' '}
                          <span className="text-white">
                            {getOperatorName(order.assigned_to)}
                          </span>
                        </span>
                      )}
                      {order.fault_type && (
                        <span>
                          故障: <span className="text-white">{order.fault_type}</span>
                        </span>
                      )}
                      <span>
                        创建: {dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {order.status === 'pending' && (
                      <>
                        <button
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm"
                          onClick={() => handleAutoReassign(order.id)}
                          disabled={loading}
                        >
                          自动派单
                        </button>
                        <button
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                          onClick={() =>
                            handleUpdateStatus(order.id, 'in_progress')
                          }
                        >
                          开始处理
                        </button>
                      </>
                    )}
                    {order.status === 'in_progress' && (
                      <button
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm"
                        onClick={() => handleUpdateStatus(order.id, 'completed')}
                      >
                        完成
                      </button>
                    )}
                    {order.status !== 'completed' && (
                      <button
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                        onClick={() => handleDelete(order.id)}
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkOrders
