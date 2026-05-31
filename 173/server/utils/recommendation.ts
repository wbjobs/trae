// 智能工单分派算法 - 基于加权评分模型
// 评分维度:
// 1. 当前负载 (30%) - 未完成工单数越少越好
// 2. 历史平均处理时长 (30%) - 处理时间越短越好
// 3. SLA 达标率 (25%) - 达标率越高越好
// 4. 处理经验 (15%) - 已处理工单越多越有经验

import { sql } from '../database/client'

export interface AgentPerformance {
  id: string
  name: string
  email: string
  current_load: number
  avg_resolve_minutes: number | null
  sla_rate: number | null
  total_completed: number
  score: number
  recommendation_reason: string[]
}

export interface RecommendationResult {
  recommended: AgentPerformance | null
  candidates: AgentPerformance[]
}

const WEIGHTS = {
  load: 0.30,
  speed: 0.30,
  sla: 0.25,
  experience: 0.15
}

export const getAgentPerformance = async (): Promise<AgentPerformance[]> => {
  const query = `
    SELECT
        u.id,
        u.name,
        u.email,
        COUNT(DISTINCT CASE WHEN t.status IN ('pending', 'processing', 'reviewing') THEN t.id END) as current_load,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as total_completed,
        AVG(CASE WHEN t.status = 'completed' AND t.resolved_at IS NOT NULL AND t.responded_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (t.resolved_at - t.responded_at)) / 60.0 END) as avg_resolve_minutes,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' AND t.sla_resolve_at IS NOT NULL
            AND t.resolved_at <= t.sla_resolve_at THEN t.id END)::float /
        NULLIF(COUNT(DISTINCT CASE WHEN t.status = 'completed' AND t.sla_resolve_at IS NOT NULL THEN t.id END), 0)::float as sla_rate
    FROM users u
    LEFT JOIN tickets t ON t.assignee_id = u.id
    WHERE u.role IN ('admin', 'agent')
    GROUP BY u.id, u.name, u.email
    ORDER BY u.name
  `
  return sql(query)
}

const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 0.5
  return (value - min) / (max - min)
}

const normalizeLoad = (value: number, min: number, max: number): number => {
  if (max === min) return 0.5
  return 1 - (value - min) / (max - min)
}

export const calculateScores = (agents: AgentPerformance[]): AgentPerformance[] => {
  if (agents.length === 0) return agents

  const loads = agents.map(a => a.current_load)
  const speeds = agents.map(a => a.avg_resolve_minutes ?? 120)
  const slas = agents.map(a => a.sla_rate ?? 0)
  const experiences = agents.map(a => a.total_completed)

  const minLoad = Math.min(...loads)
  const maxLoad = Math.max(...loads, 1)
  const minSpeed = Math.min(...speeds)
  const maxSpeed = Math.max(...speeds, 1)
  const minSla = Math.min(...slas, 0)
  const maxSla = Math.max(...slas, 1)
  const minExp = Math.min(...experiences)
  const maxExp = Math.max(...experiences, 1)

  return agents.map(agent => {
    const loadScore = normalizeLoad(agent.current_load, minLoad, maxLoad)
    const speedScore = normalizeLoad(agent.avg_resolve_minutes ?? 120, minSpeed, maxSpeed)
    const slaScore = normalize(agent.sla_rate ?? 0, minSla, maxSla)
    const expScore = normalize(agent.total_completed, minExp, maxExp)

    const score =
      loadScore * WEIGHTS.load +
      speedScore * WEIGHTS.speed +
      slaScore * WEIGHTS.sla +
      expScore * WEIGHTS.experience

    const reasons: string[] = []

    if (agent.current_load <= minLoad + 1) {
      reasons.push(`当前负载较轻 (${agent.current_load} 个工单)`)
    }

    if (agent.avg_resolve_minutes !== null) {
      if (agent.avg_resolve_minutes <= 60) {
        reasons.push(`处理速度快 (平均 ${Math.round(agent.avg_resolve_minutes)} 分钟)`)
      } else if (agent.avg_resolve_minutes <= 120) {
        reasons.push(`处理速度中等 (平均 ${Math.round(agent.avg_resolve_minutes)} 分钟)`)
      }
    } else {
      reasons.push('暂无历史处理记录')
    }

    if (agent.sla_rate !== null) {
      if (agent.sla_rate >= 0.9) {
        reasons.push(`SLA 达标率高 (${Math.round(agent.sla_rate * 100)}%)`)
      } else if (agent.sla_rate >= 0.7) {
        reasons.push(`SLA 达标率良好 (${Math.round(agent.sla_rate * 100)}%)`)
      }
    }

    if (agent.total_completed >= 10) {
      reasons.push(`经验丰富 (已处理 ${agent.total_completed} 个工单)`)
    }

    return {
      ...agent,
      score: Math.round(score * 100),
      recommendation_reason: reasons.slice(0, 3)
    }
  }).sort((a, b) => b.score - a.score)
}

export const getRecommendation = async (): Promise<RecommendationResult> => {
  const agents = await getAgentPerformance()
  const scoredAgents = calculateScores(agents)
  return {
    recommended: scoredAgents[0] || null,
    candidates: scoredAgents
  }
}
