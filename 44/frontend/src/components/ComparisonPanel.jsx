import React from 'react'

function ComparisonPanel({ comparisonResult, molecule1, molecule2, onBackToSingle, onClearComparison }) {
  const { similarity, rmsd, summary, high_diff_atoms } = comparisonResult

  const getSimilarityColor = (sim) => {
    if (sim >= 0.8) return '#27ae60'
    if (sim >= 0.6) return '#f39c12'
    if (sim >= 0.4) return '#e67e22'
    return '#e74c3c'
  }

  const getRMSDColor = (rmsd) => {
    if (rmsd <= 1.0) return '#27ae60'
    if (rmsd <= 2.0) return '#f39c12'
    if (rmsd <= 3.0) return '#e67e22'
    return '#e74c3c'
  }

  return (
    <div className="control-panel">
      <h2>结构对比结果</h2>

      <div className="control-section">
        <div style={{
          background: 'rgba(52, 152, 219, 0.2)',
          border: '1px solid #3498db',
          borderRadius: '6px',
          padding: '10px',
          marginBottom: '10px',
        }}>
          <p style={{ fontSize: '13px', color: '#3498db' }}>
            分子 1: {molecule1?.filename || '未命名'}
          </p>
          <p style={{ fontSize: '11px', color: '#a0a0a0' }}>
            原子数: {summary?.total_atoms_1 || 0}
          </p>
        </div>
        <div style={{
          background: 'rgba(231, 76, 60, 0.2)',
          border: '1px solid #e74c3c',
          borderRadius: '6px',
          padding: '10px',
        }}>
          <p style={{ fontSize: '13px', color: '#e74c3c' }}>
            分子 2: {molecule2?.filename || '未命名'} (已对齐)
          </p>
          <p style={{ fontSize: '11px', color: '#a0a0a0' }}>
            原子数: {summary?.total_atoms_2 || 0}
          </p>
        </div>
      </div>

      <div className="control-section">
        <h3>相似度评分</h3>
        <div style={{
          background: '#0f3460',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: getSimilarityColor(similarity),
            marginBottom: '8px',
          }}>
            {(similarity * 100).toFixed(1)}%
          </div>
          <p style={{ fontSize: '13px', color: '#a0a0a0' }}>
            结构相似度
          </p>
        </div>
      </div>

      <div className="control-section">
        <h3>RMSD (均方根偏差)</h3>
        <div className="stats-info">
          <p style={{ fontSize: '14px' }}>
            总体 RMSD：
            <span style={{ color: getRMSDColor(rmsd), fontWeight: 'bold' }}>
              {rmsd.toFixed(3)} Å
            </span>
          </p>
          <p>平均 RMSD：<span>{summary?.mean_rmsd?.toFixed(3) || '0.000'} Å</span></p>
          <p>中位 RMSD：<span>{summary?.median_rmsd?.toFixed(3) || '0.000'} Å</span></p>
          <p>最大 RMSD：<span>{summary?.max_rmsd?.toFixed(3) || '0.000'} Å</span></p>
        </div>
      </div>

      <div className="control-section">
        <h3>对比统计</h3>
        <div className="stats-info">
          <p>匹配原子数：<span>{summary?.common_atoms || 0}</span></p>
          <p>高差异原子：
            <span style={{ color: '#e74c3c' }}>{summary?.high_diff_atoms || 0}</span>
          </p>
          <p>中差异原子：
            <span style={{ color: '#f39c12' }}>{summary?.medium_diff_atoms || 0}</span>
          </p>
          <p>低差异原子：
            <span style={{ color: '#27ae60' }}>{summary?.low_diff_atoms || 0}</span>
          </p>
        </div>
      </div>

      {high_diff_atoms && high_diff_atoms.length > 0 && (
        <div className="control-section">
          <h3>高差异区域 (Top 20)</h3>
          <div style={{
            maxHeight: '250px',
            overflowY: 'auto',
            background: '#0f3460',
            borderRadius: '6px',
            padding: '8px',
          }}>
            {high_diff_atoms.slice(0, 20).map((diff, index) => (
              <div key={index} style={{
                padding: '6px 8px',
                marginBottom: '4px',
                background: 'rgba(231, 76, 60, 0.1)',
                borderRadius: '4px',
                fontSize: '11px',
                borderLeft: `3px solid ${diff.rmsd > 3 ? '#e74c3c' : diff.rmsd > 2 ? '#f39c12' : '#e67e22'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {diff.atom2?.chain || '-'} {diff.atom2?.residue_name || '-'}
                    {diff.atom2?.residue_seq || '-'} {diff.atom2?.name || '-'}
                  </span>
                  <span style={{
                    fontWeight: 'bold',
                    color: diff.rmsd > 3 ? '#e74c3c' : diff.rmsd > 2 ? '#f39c12' : '#e67e22',
                  }}>
                    {diff.rmsd.toFixed(2)} Å
                  </span>
                </div>
              </div>
            ))}
            {high_diff_atoms.length > 20 && (
              <p style={{ textAlign: 'center', color: '#a0a0a0', fontSize: '11px', marginTop: '8px' }}>
                还有 {high_diff_atoms.length - 20} 个高差异原子
              </p>
            )}
          </div>
        </div>
      )}

      <div className="control-section">
        <h3>图例</h3>
        <div className="stats-info" style={{ fontSize: '12px' }}>
          <p style={{ marginBottom: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#3498db', borderRadius: '50%', marginRight: '8px' }}></span>
            分子 1 (参考)
          </p>
          <p style={{ marginBottom: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#e74c3c', borderRadius: '50%', marginRight: '8px' }}></span>
            分子 2 (已对齐)
          </p>
          <p>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#ffff00', borderRadius: '50%', marginRight: '8px' }}></span>
            高差异区域
          </p>
        </div>
      </div>

      <div className="control-section">
        <button className="btn btn-secondary" onClick={onBackToSingle}>
          返回单分子视图
        </button>
        <button
          className="btn btn-secondary"
          onClick={onClearComparison}
          style={{ marginTop: '8px' }}
        >
          清除对比结果
        </button>
      </div>
    </div>
  )
}

export default ComparisonPanel
