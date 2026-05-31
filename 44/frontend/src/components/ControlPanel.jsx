import React, { useState } from 'react'

function ControlPanel({
  moleculeData,
  molecule2,
  molecule1Filename,
  molecule2Filename,
  onFileUpload,
  onLoadSample,
  onClearMolecule,
  onResetView,
  onColorModeChange,
  onHighlightChain,
  onHighlightResidue,
  onHighlightSecondaryStructure,
  onClearHighlight,
  onToggleFPS,
  showFPS,
  onCompare,
  comparing,
  canCompare,
  matchBy,
  onMatchByChange,
  rmsdThreshold,
  onRmsdThresholdChange,
}) {
  const [colorMode, setColorMode] = useState('element')
  const fileInput1Ref = React.useRef(null)
  const fileInput2Ref = React.useRef(null)

  const handleColorModeChange = (mode) => {
    setColorMode(mode)
    onColorModeChange(mode)
  }

  return (
    <div className="control-panel">
      <h2>控制面板</h2>

      <div className="control-section">
        <h3>分子 1</h3>
        <div style={{
          background: 'rgba(52, 152, 219, 0.2)',
          border: '1px solid #3498db',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '10px',
        }}>
          <p style={{ fontSize: '13px', marginBottom: '8px', color: '#3498db' }}>
            {molecule1Filename || '未加载'}
          </p>
          <input
            type="file"
            accept=".pdb"
            onChange={(e) => onFileUpload(e.target.files[0], 1)}
            ref={fileInput1Ref}
            className="file-input"
          />
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              className="btn"
              style={{ flex: 1, marginBottom: 0, padding: '6px 12px', fontSize: '12px' }}
              onClick={() => fileInput1Ref.current?.click()}
            >
              上传
            </button>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, marginBottom: 0, padding: '6px 12px', fontSize: '12px' }}
              onClick={() => onLoadSample(1)}
            >
              示例
            </button>
          </div>
          {molecule1Filename && (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', padding: '6px 12px', fontSize: '12px' }}
              onClick={() => onClearMolecule(1)}
            >
              清除
            </button>
          )}
        </div>
      </div>

      <div className="control-section">
        <h3>分子 2</h3>
        <div style={{
          background: 'rgba(231, 76, 60, 0.2)',
          border: '1px solid #e74c3c',
          borderRadius: '6px',
          padding: '12px',
        }}>
          <p style={{ fontSize: '13px', marginBottom: '8px', color: '#e74c3c' }}>
            {molecule2Filename || '未加载'}
          </p>
          <input
            type="file"
            accept=".pdb"
            onChange={(e) => onFileUpload(e.target.files[0], 2)}
            ref={fileInput2Ref}
            className="file-input"
          />
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              className="btn"
              style={{ flex: 1, marginBottom: 0, padding: '6px 12px', fontSize: '12px' }}
              onClick={() => fileInput2Ref.current?.click()}
            >
              上传
            </button>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, marginBottom: 0, padding: '6px 12px', fontSize: '12px' }}
              onClick={() => onLoadSample(2)}
            >
              示例
            </button>
          </div>
          {molecule2Filename && (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', padding: '6px 12px', fontSize: '12px' }}
              onClick={() => onClearMolecule(2)}
            >
              清除
            </button>
          )}
        </div>
      </div>

      {canCompare && (
        <div className="control-section">
          <h3>结构对比</h3>
          <div className="slider-container">
            <label>匹配方式：</label>
            <select
              value={matchBy}
              onChange={(e) => onMatchByChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#0f3460',
                color: 'white',
                border: '1px solid #1a4a8a',
                borderRadius: '4px',
                fontSize: '13px',
              }}
            >
              <option value="residue">按残基+原子名匹配</option>
              <option value="element">按元素匹配</option>
            </select>
          </div>
          <div className="slider-container">
            <label>RMSD 阈值：{rmsdThreshold.toFixed(1)} Å</label>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={rmsdThreshold}
              onChange={(e) => onRmsdThresholdChange(parseFloat(e.target.value))}
            />
          </div>
          <button
            className="btn"
            onClick={onCompare}
            disabled={comparing}
            style={{
              background: comparing ? '#666' : '#27ae60',
              cursor: comparing ? 'not-allowed' : 'pointer',
            }}
          >
            {comparing ? '对比中...' : '开始结构对比'}
          </button>
        </div>
      )}

      {moleculeData && !molecule2 && (
        <>
          <div className="control-section">
            <h3>显示设置</h3>
            <div className="checkbox-container">
              <label>着色模式：</label>
            </div>
            <div className="highlight-controls">
              <button
                className={`highlight-btn ${colorMode === 'element' ? 'active' : ''}`}
                onClick={() => handleColorModeChange('element')}
              >
                元素
              </button>
              <button
                className={`highlight-btn ${colorMode === 'chain' ? 'active' : ''}`}
                onClick={() => handleColorModeChange('chain')}
              >
                链
              </button>
              <button
                className={`highlight-btn ${colorMode === 'secondary' ? 'active' : ''}`}
                onClick={() => handleColorModeChange('secondary')}
              >
                二级结构
              </button>
              <button
                className={`highlight-btn ${colorMode === 'residue' ? 'active' : ''}`}
                onClick={() => handleColorModeChange('residue')}
              >
                残基
              </button>
            </div>
          </div>

          <div className="control-section">
            <h3>视图操作</h3>
            <button className="btn btn-secondary" onClick={onResetView}>
              重置视图
            </button>
            <div className="checkbox-container" style={{ marginTop: '12px' }}>
              <input
                type="checkbox"
                id="fpsToggle"
                checked={showFPS}
                onChange={onToggleFPS}
              />
              <label htmlFor="fpsToggle">显示 FPS 性能监控</label>
            </div>
          </div>

          <div className="control-section">
            <h3>分子统计</h3>
            <div className="stats-info">
              <p>原子数：<span>{moleculeData.stats?.num_atoms || 0}</span></p>
              <p>化学键数：<span>{moleculeData.stats?.num_bonds || 0}</span></p>
              <p>链数：<span>{moleculeData.stats?.num_chains || 0}</span></p>
              <p>残基数：<span>{moleculeData.stats?.num_residues || 0}</span></p>
            </div>
          </div>

          {moleculeData.stats?.element_counts && (
            <div className="control-section">
              <h3>元素组成</h3>
              <div className="stats-info">
                {Object.entries(moleculeData.stats.element_counts).map(([element, count]) => (
                  <p key={element}>
                    {element}：<span>{count}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {moleculeData.chains && Object.keys(moleculeData.chains).length > 0 && (
            <div className="control-section">
              <h3>高亮链</h3>
              <div className="highlight-controls">
                {Object.keys(moleculeData.chains).map((chain) => (
                  <button
                    key={chain}
                    className="highlight-btn"
                    onClick={() => onHighlightChain(chain)}
                  >
                    链 {chain}
                  </button>
                ))}
                <button
                  className="highlight-btn"
                  onClick={onClearHighlight}
                >
                  清除
                </button>
              </div>
            </div>
          )}

          {moleculeData.stats?.secondary_structure_counts && (
            <div className="control-section">
              <h3>二级结构</h3>
              <div className="highlight-controls">
                {Object.entries(moleculeData.stats.secondary_structure_counts).map(([type, count]) => (
                  <button
                    key={type}
                    className="highlight-btn"
                    onClick={() => onHighlightSecondaryStructure(type)}
                  >
                    {type === 'helix' ? 'α-螺旋' : type === 'sheet' ? 'β-折叠' : type === 'turn' ? '转角' : '无规卷曲'}
                    <span style={{ marginLeft: '4px' }}>({count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="control-section">
        <h3>操作提示</h3>
        <div className="stats-info" style={{ fontSize: '12px' }}>
          <p style={{ marginBottom: '8px' }}>🖱️ 左键拖拽：旋转</p>
          <p style={{ marginBottom: '8px' }}>🖱️ 滚轮：缩放</p>
          <p style={{ marginBottom: '8px' }}>🖱️ 右键拖拽：平移</p>
          <p>🖱️ 悬停原子：查看信息</p>
        </div>
      </div>
    </div>
  )
}

export default ControlPanel
