import React, { useState } from 'react'

export default function LayoutFeatures({ features, structure }) {
  const [showRaw, setShowRaw] = useState(false)

  if (!features) {
    return (
      <div className="empty-state">
        <div className="icon">📊</div>
        <h3>暂无布局特征</h3>
      </div>
    )
  }

  const structureFeatures = features.structure_features || {}
  const semanticFeatures = features.semantic_features || {}
  const layoutVectors = features.layout_vectors || []

  const renderJSON = (obj, indent = 0) => {
    const indentStr = '  '.repeat(indent)
    
    if (obj === null || obj === undefined) {
      return <span className="json-string">null</span>
    }
    
    if (typeof obj === 'string') {
      return <span className="json-string">"{obj}"</span>
    }
    
    if (typeof obj === 'number') {
      return <span className="json-number">{obj}</span>
    }
    
    if (typeof obj === 'boolean') {
      return <span className="json-key">{obj.toString()}</span>
    }
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return <span>[]</span>
      }
      return (
        <div>
          <span>[</span>
          <div style={{ marginLeft: `${indent + 1}ch` }}>
            {obj.map((item, idx) => (
              <div key={idx}>
                {renderJSON(item, indent + 1)}
                {idx < obj.length - 1 && <span>,</span>}
              </div>
            ))}
          </div>
          <span>{indentStr}]</span>
        </div>
      )
    }
    
    if (typeof obj === 'object') {
      const keys = Object.keys(obj)
      if (keys.length === 0) {
        return <span>{}</span>
      }
      return (
        <div>
          <span>{'{'}</span>
          <div style={{ marginLeft: `${indent + 1}ch` }}>
            {keys.map((key, idx) => (
              <div key={key}>
                <span className="json-key">"{key}"</span>
                <span>: </span>
                {renderJSON(obj[key], indent + 1)}
                {idx < keys.length - 1 && <span>,</span>}
              </div>
            ))}
          </div>
          <span>{indentStr}{'}'}</span>
        </div>
      )
    }
    
    return <span>{String(obj)}</span>
  }

  return (
    <div>
      <div className="structure-info" style={{ marginBottom: '20px' }}>
        <div className="structure-item">
          <div className="label">文档哈希</div>
          <div className="value" style={{ fontSize: '0.8rem' }}>
            {features.document_hash?.substring(0, 12)}...
          </div>
        </div>
        
        <div className="structure-item">
          <div className="label">文档类型</div>
          <div className="value">{semanticFeatures.document_type || 'unknown'}</div>
        </div>
        
        <div className="structure-item">
          <div className="label">标题层级</div>
          <div className="value">
            {structureFeatures.heading_hierarchy?.has_hierarchy 
              ? `L${structureFeatures.heading_hierarchy?.max_level || 1}` 
              : '无'}
          </div>
        </div>
        
        <div className="structure-item">
          <div className="label">关键区块</div>
          <div className="value">
            {semanticFeatures.key_sections?.length || 0} 个
          </div>
        </div>
      </div>

      {semanticFeatures.contract_keywords && semanticFeatures.contract_keywords.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', background: '#f8f9ff', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: '#667eea' }}>🏷️ 检测到的合同关键词</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {semanticFeatures.contract_keywords.map((kw, idx) => (
              <span
                key={idx}
                style={{
                  padding: '4px 12px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {layoutVectors.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', background: '#f8f9ff', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: '#667eea' }}>📐 页面布局特征向量</h4>
          {layoutVectors.map((vec, idx) => (
            <div key={idx} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '5px' }}>
                第 {vec.page_number} 页 - 嵌入向量:
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                background: '#1e1e1e',
                color: '#b5cea8',
                padding: '10px',
                borderRadius: '6px',
                overflowX: 'auto'
              }}>
                [{vec.vector_embedding?.map(v => v.toFixed(4)).join(', ')}]
              </div>
              <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#888' }}>
                元素统计: 标题 {vec.element_counts?.headings || 0} | 
                段落 {vec.element_counts?.paragraphs || 0} | 
                列表 {vec.element_counts?.lists || 0} | 
                表格 {vec.element_counts?.tables || 0}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          style={{
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500
          }}
        >
          {showRaw ? '隐藏原始特征数据' : '📋 查看完整特征数据'}
        </button>

        {showRaw && (
          <div className="feature-vectors" style={{ marginTop: '15px', maxHeight: '300px', overflow: 'auto' }}>
            {renderJSON(features)}
          </div>
        )}
      </div>
    </div>
  )
}
