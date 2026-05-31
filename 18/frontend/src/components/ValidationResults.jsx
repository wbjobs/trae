import React, { useState } from 'react'

export default function ValidationResults({ results, reasoningChains }) {
  const [expandedChain, setExpandedChain] = useState(null)

  if (!results || results.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">✅</div>
        <h3>暂无校验结果</h3>
      </div>
    )
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass': return '✅'
      case 'fail': return '❌'
      case 'warn': return '⚠️'
      default: return '❓'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'pass': return '通过'
      case 'fail': return '失败'
      case 'warn': return '警告'
      default: return '未知'
    }
  }

  const getRuleDescription = (rule) => {
    const descriptions = {
      'end_date_after_start_date': '结束日期是否晚于开始日期',
      'liquidated_damages_not_exceed_30_percent': '违约金是否超过总金额30%',
      'sign_date_before_start_date': '签订日期是否早于开始日期',
      'amount_positive': '合同金额是否为正数'
    }
    return descriptions[rule] || rule
  }

  return (
    <div className="validation-results">
      {results.map((result, idx) => {
        const chain = reasoningChains?.find(c => c.rule === result.rule)
        const isExpanded = expandedChain === idx

        return (
          <div
            key={idx}
            className={`validation-item ${result.status}`}
          >
            <div className="validation-header">
              <div className="validation-rule">
                {getStatusIcon(result.status)} {getRuleDescription(result.rule)}
              </div>
              <span className={`validation-status ${result.status}`}>
                {getStatusText(result.status)}
              </span>
            </div>

            <div className="validation-message">
              {result.message}
            </div>

            {result.evidence && result.evidence.suggestion && (
              <div style={{
                marginTop: '10px',
                padding: '10px',
                background: 'rgba(0,0,0,0.05)',
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#666'
              }}>
                💡 <strong>建议：</strong>{result.evidence.suggestion}
              </div>
            )}

            {chain && chain.steps && chain.steps.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <button
                  onClick={() => setExpandedChain(isExpanded ? null : idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    padding: 0
                  }}
                >
                  {isExpanded ? '▼ 隐藏推理链' : '▶ 查看推理链'}
                </button>

                {isExpanded && (
                  <div className="reasoning-chain">
                    <h4>🔗 推理过程</h4>
                    <div className="reasoning-steps">
                      {chain.steps.map((step, stepIdx) => (
                        <div key={stepIdx} className="reasoning-step">
                          <span className="step-action">[{stepIdx + 1}] {step.action}:</span>
                          <span className="step-detail">{step.detail}</span>
                        </div>
                      ))}
                      <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px dashed #ddd',
                        fontWeight: 600,
                        color: chain.conclusion.includes('PASS') ? '#22c55e' : 
                               chain.conclusion.includes('FAIL') ? '#ef4444' : '#f59e0b'
                      }}>
                        结论: {chain.conclusion}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div style={{
        marginTop: '20px',
        padding: '15px',
        background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%)',
        borderRadius: '10px',
        fontSize: '0.9rem'
      }}>
        <h4 style={{ color: '#667eea', marginBottom: '10px' }}>📊 校验统计</h4>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span>
            ✅ 通过: {results.filter(r => r.status === 'pass').length}
          </span>
          <span>
            ⚠️ 警告: {results.filter(r => r.status === 'warn').length}
          </span>
          <span>
            ❌ 失败: {results.filter(r => r.status === 'fail').length}
          </span>
          <span>
            总计: {results.length} 项规则
          </span>
        </div>
      </div>
    </div>
  )
}
