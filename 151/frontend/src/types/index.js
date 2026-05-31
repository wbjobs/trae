export const GameServerPhase = {
  RUNNING: 'Running',
  UPGRADING: 'Upgrading',
  MIGRATING: 'Migrating',
  DRAINING: 'Draining',
  CANARY: 'Canary',
  ROLLINGBACK: 'RollingBack',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed'
}

export const CanaryDecision = {
  PENDING: 'Pending',
  PROMOTE: 'Promote',
  ROLLBACK: 'Rollback',
  OBSERVE: 'Observe'
}

export const CanaryPhase = {
  PREPARING: 'Preparing',
  OBSERVING: 'Observing',
  DECIDING: 'Deciding',
  PROMOTING: 'Promoting',
  ROLLINGBACK: 'RollingBack',
  COMPLETED: 'Completed'
}

export const MigrationState = {
  PENDING: 'Pending',
  MIGRATING: 'Migrating',
  COMPLETED: 'Completed',
  FAILED: 'Failed'
}

export function getPhaseColor(phase) {
  const colors = {
    [GameServerPhase.RUNNING]: '#67C23A',
    [GameServerPhase.UPGRADING]: '#E6A23C',
    [GameServerPhase.MIGRATING]: '#409EFF',
    [GameServerPhase.DRAINING]: '#8E44AD',
    [GameServerPhase.CANARY]: '#1890FF',
    [GameServerPhase.ROLLINGBACK]: '#FA8C16',
    [GameServerPhase.SUCCEEDED]: '#67C23A',
    [GameServerPhase.FAILED]: '#F56C6C'
  }
  return colors[phase] || '#909399'
}

export function getPhaseText(phase) {
  const texts = {
    [GameServerPhase.RUNNING]: '运行中',
    [GameServerPhase.UPGRADING]: '升级中',
    [GameServerPhase.MIGRATING]: '迁移中',
    [GameServerPhase.DRAINING]: '排空端口中',
    [GameServerPhase.CANARY]: '金丝雀升级中',
    [GameServerPhase.ROLLINGBACK]: '回滚中',
    [GameServerPhase.SUCCEEDED]: '升级完成',
    [GameServerPhase.FAILED]: '失败'
  }
  return texts[phase] || phase
}

export function getCanaryDecisionColor(decision) {
  const colors = {
    [CanaryDecision.PENDING]: '#909399',
    [CanaryDecision.PROMOTE]: '#52C41A',
    [CanaryDecision.ROLLBACK]: '#F5222D',
    [CanaryDecision.OBSERVE]: '#FAAD14'
  }
  return colors[decision] || '#909399'
}

export function getCanaryDecisionText(decision) {
  const texts = {
    [CanaryDecision.PENDING]: '等待决策',
    [CanaryDecision.PROMOTE]: '全量升级',
    [CanaryDecision.ROLLBACK]: '回滚',
    [CanaryDecision.OBSERVE]: '继续观察'
  }
  return texts[decision] || decision
}

export function getCanaryPhaseText(phase) {
  const texts = {
    [CanaryPhase.PREPARING]: '准备中',
    [CanaryPhase.OBSERVING]: '观察中',
    [CanaryPhase.DECIDING]: '决策中',
    [CanaryPhase.PROMOTING]: '全量升级中',
    [CanaryPhase.ROLLINGBACK]: '回滚中',
    [CanaryPhase.COMPLETED]: '已完成'
  }
  return texts[phase] || phase
}

export function getMigrationStateColor(state) {
  const colors = {
    [MigrationState.PENDING]: '#909399',
    [MigrationState.MIGRATING]: '#409EFF',
    [MigrationState.COMPLETED]: '#67C23A',
    [MigrationState.FAILED]: '#F56C6C'
  }
  return colors[state] || '#909399'
}

export function getMigrationStateText(state) {
  const texts = {
    [MigrationState.PENDING]: '待迁移',
    [MigrationState.MIGRATING]: '迁移中',
    [MigrationState.COMPLETED]: '已完成',
    [MigrationState.FAILED]: '失败'
  }
  return texts[state] || state
}
