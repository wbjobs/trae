import React, { useState } from 'react'

export default function DocumentViewer({ pages, highlights, documentStructure }) {
  const [hoveredHighlight, setHoveredHighlight] = useState(null)

  if (!pages || pages.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🖼️</div>
        <h3>暂无文档预览</h3>
      </div>
    )
  }

  const pageHighlights = highlights?.filter(h => h.page === 1) || []

  return (
    <div className="document-viewer">
      <div className="document-image-container">
        <img
          src={`data:image/png;base64,${pages[0]}`}
          alt="Document page 1"
          className="document-image"
          style={{ maxWidth: '100%', minWidth: '400px' }}
        />
        
        <div className="highlight-layer">
          {pageHighlights.map((highlight, idx) => {
            const bbox = highlight.bbox || []
            const scaleX = 1
            const scaleY = 1
            
            return (
              <div
                key={idx}
                className="highlight-box"
                style={{
                  left: `${bbox[0] * scaleX}px`,
                  top: `${bbox[1] * scaleY}px`,
                  width: `${(bbox[2] - bbox[0]) * scaleX}px`,
                  height: `${(bbox[3] - bbox[1]) * scaleY}px`,
                  borderColor: highlight.color,
                  backgroundColor: `${highlight.color}20`,
                  zIndex: hoveredHighlight === idx ? 20 : 1
                }}
                onMouseEnter={() => setHoveredHighlight(idx)}
                onMouseLeave={() => setHoveredHighlight(null)}
              >
                <span className="highlight-label">
                  {highlight.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {documentStructure && (
        <div style={{ marginTop: '15px', padding: '15px', background: '#f8f9ff', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: '#667eea' }}>📐 文档结构分析</h4>
          <div className="structure-info">
            <div className="structure-item">
              <div className="label">标题数量</div>
              <div className="value">{documentStructure.headings?.length || 0}</div>
            </div>
            <div className="structure-item">
              <div className="label">段落数量</div>
              <div className="value">{documentStructure.paragraphs?.length || 0}</div>
            </div>
            <div className="structure-item">
              <div className="label">列表数量</div>
              <div className="value">{documentStructure.lists?.length || 0}</div>
            </div>
            <div className="structure-item">
              <div className="label">表格数量</div>
              <div className="value">{documentStructure.tables?.length || 0}</div>
            </div>
          </div>
          
          {documentStructure.headings?.length > 0 && (
            <div style={{ marginTop: '15px' }}>
              <h5 style={{ marginBottom: '8px', color: '#555' }}>检测到的标题：</h5>
              <div style={{ fontSize: '0.85rem', color: '#666' }}>
                {documentStructure.headings.map((h, i) => (
                  <div key={i} style={{ padding: '4px 0', paddingLeft: `${(h.level - 1) * 15}px` }}>
                    {h.level === 1 ? '📌' : '📍'} {h.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
