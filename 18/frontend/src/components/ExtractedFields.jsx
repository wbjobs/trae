import React from 'react'

export default function ExtractedFields({ fields }) {
  if (!fields) {
    return (
      <div className="empty-state">
        <div className="icon">🔍</div>
        <h3>暂无提取结果</h3>
      </div>
    )
  }

  const parties = fields.parties || {}
  const amount = fields.amount || {}
  const dates = fields.dates || {}
  const damages = fields.liquidated_damages || {}

  return (
    <div className="extracted-fields">
      <div className="field-card">
        <div className="field-label">🏢 合同双方</div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ fontSize: '0.9rem', color: '#333' }}>
            <span style={{ fontWeight: 600, color: '#667eea' }}>甲方：</span>
            {parties.party_a || '未识别'}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#333' }}>
            <span style={{ fontWeight: 600, color: '#764ba2' }}>乙方：</span>
            {parties.party_b || '未识别'}
          </div>
        </div>
      </div>

      <div className="field-card">
        <div className="field-label">💰 合同金额</div>
        <div className="field-value">
          {amount.currency || '¥'} {amount.value || '0.00'}
        </div>
        {amount.text && (
          <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '5px' }}>
            {amount.text}
          </div>
        )}
      </div>

      <div className="field-card">
        <div className="field-label">📅 关键日期</div>
        <div style={{ display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
          <div>
            <span style={{ fontWeight: 600, color: '#667eea' }}>开始日期：</span>
            <span style={{ color: '#333' }}>{dates.start_date || '未识别'}</span>
          </div>
          <div>
            <span style={{ fontWeight: 600, color: '#764ba2' }}>结束日期：</span>
            <span style={{ color: '#333' }}>{dates.end_date || '未识别'}</span>
          </div>
          <div>
            <span style={{ fontWeight: 600, color: '#9333ea' }}>签订日期：</span>
            <span style={{ color: '#333' }}>{dates.sign_date || '未识别'}</span>
          </div>
        </div>
      </div>

      <div className="field-card">
        <div className="field-label">⚖️ 违约金条款</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="field-value" style={{ fontSize: '1.5rem' }}>
            {damages.percentage || '0%'}
          </div>
          {damages.percentage && parseFloat(damages.percentage) > 30 && (
            <span style={{
              padding: '3px 10px',
              background: '#fef3c7',
              color: '#92400e',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              ⚠ 超过30%
            </span>
          )}
        </div>
        {damages.text && (
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px', lineHeight: 1.5 }}>
            {damages.text}
          </div>
        )}
      </div>
    </div>
  )
}
