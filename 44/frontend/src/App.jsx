import React, { useState, useRef, useCallback } from 'react'
import MoleculeViewer from './components/MoleculeViewer.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import ComparisonPanel from './components/ComparisonPanel.jsx'
import axios from 'axios'

function App() {
  const [molecule1, setMolecule1] = useState(null)
  const [molecule2, setMolecule2] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showFPS, setShowFPS] = useState(false)
  const [viewMode, setViewMode] = useState('single')
  const [comparisonResult, setComparisonResult] = useState(null)
  const [comparing, setComparing] = useState(false)
  const [matchBy, setMatchBy] = useState('residue')
  const [rmsdThreshold, setRmsdThreshold] = useState(2.0)
  const viewerRef = useRef(null)

  const handleFileUpload = useCallback(async (file, targetMolecule = 1) => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await axios.post('/api/parse-pdb', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      if (targetMolecule === 1) {
        setMolecule1({ data: response.data, filename: file.name })
      } else {
        setMolecule2({ data: response.data, filename: file.name })
      }
      setComparisonResult(null)
    } catch (err) {
      setError('解析 PDB 文件失败：' + (err.response?.data?.error || err.message))
      console.error('Error parsing PDB:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLoadSample = useCallback(async (targetMolecule = 1) => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get('/api/sample-pdb')
      const result = await axios.post('/api/parse-pdb-content', {
        content: response.data.content,
      })
      if (targetMolecule === 1) {
        setMolecule1({ data: result.data, filename: 'example.pdb' })
      } else {
        setMolecule2({ data: result.data, filename: 'example.pdb' })
      }
      setComparisonResult(null)
    } catch (err) {
      setError('加载示例文件失败：' + (err.response?.data?.error || err.message))
      console.error('Error loading sample:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleClearMolecule = useCallback((targetMolecule = 1) => {
    if (targetMolecule === 1) {
      setMolecule1(null)
    } else {
      setMolecule2(null)
    }
    setComparisonResult(null)
  }, [])

  const handleCompareStructures = useCallback(async () => {
    if (!molecule1 || !molecule2) {
      setError('请先加载两个分子结构')
      return
    }

    setComparing(true)
    setError(null)
    try {
      const response = await axios.post('/api/compare-structures', {
        molecule1: molecule1.data,
        molecule2: molecule2.data,
        match_by: matchBy,
        rmsd_threshold: rmsdThreshold,
      })

      if (response.data.comparison) {
        setComparisonResult(response.data)
        setViewMode('comparison')
      } else {
        setError('结构对比失败：' + (response.data.message || '未知错误'))
      }
    } catch (err) {
      setError('结构对比失败：' + (err.response?.data?.error || err.message))
      console.error('Error comparing structures:', err)
    } finally {
      setComparing(false)
    }
  }, [molecule1, molecule2, matchBy, rmsdThreshold])

  const handleResetView = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.resetView()
    }
  }, [])

  const handleColorModeChange = useCallback((mode) => {
    if (viewerRef.current) {
      viewerRef.current.setColorMode(mode)
    }
  }, [])

  const handleHighlightChain = useCallback((chain) => {
    if (viewerRef.current) {
      viewerRef.current.highlightChain(chain)
    }
  }, [])

  const handleHighlightResidue = useCallback((residueKey) => {
    if (viewerRef.current) {
      viewerRef.current.highlightResidue(residueKey)
    }
  }, [])

  const handleHighlightSecondaryStructure = useCallback((type) => {
    if (viewerRef.current) {
      viewerRef.current.highlightSecondaryStructure(type)
    }
  }, [])

  const handleClearHighlight = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.clearHighlight()
    }
  }, [])

  const handleToggleFPS = useCallback(() => {
    setShowFPS(prev => !prev)
    if (viewerRef.current) {
      viewerRef.current.toggleFPS()
    }
  }, [])

  const getViewerData = () => {
    if (viewMode === 'comparison' && comparisonResult) {
      return {
        molecule1: molecule1?.data,
        molecule2: comparisonResult.aligned_molecule_2,
        comparisonResult: comparisonResult,
      }
    }
    return {
      molecule1: molecule1?.data,
      molecule2: molecule2?.data,
      comparisonResult: null,
    }
  }

  const getCurrentMolecule = () => {
    if (viewMode === 'single' || !molecule2) {
      return molecule1?.data || null
    }
    return molecule1?.data || null
  }

  return (
    <div className="app">
      <div className="viewer-container">
        <div className="header">
          <h1>分子结构可视化工具</h1>
          <p>
            {viewMode === 'comparison'
              ? '结构对比模式 - 分子1 (蓝) vs 分子2 (红)'
              : '基于 Three.js + WebGL 的 PDB 分子可视化'}
          </p>
        </div>

        {viewMode === 'comparison' && (
          <div style={{
            position: 'absolute',
            top: '70px',
            left: '20px',
            right: '340px',
            display: 'flex',
            gap: '20px',
            zIndex: 10,
            flexWrap: 'wrap',
          }}>
            <div style={{
              background: 'rgba(52, 152, 219, 0.9)',
              padding: '8px 16px',
              borderRadius: '4px',
              fontSize: '13px',
              color: 'white',
            }}>
              分子1: {molecule1?.filename || '未加载'}
            </div>
            <div style={{
              background: 'rgba(231, 76, 60, 0.9)',
              padding: '8px 16px',
              borderRadius: '4px',
              fontSize: '13px',
              color: 'white',
            }}>
              分子2: {molecule2?.filename || '未加载'} (已对齐)
            </div>
          </div>
        )}

        <MoleculeViewer
          ref={viewerRef}
          moleculeData={getCurrentMolecule()}
          comparisonData={viewMode === 'comparison' ? getViewerData() : null}
        />
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}
        {comparing && (
          <div className="loading-overlay">
            <div style={{ textAlign: 'center' }}>
              <div className="loading-spinner"></div>
              <p style={{ marginTop: '16px', fontSize: '16px' }}>正在进行结构对齐和对比...</p>
            </div>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(233, 69, 96, 0.9)',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '400px',
            textAlign: 'center',
            zIndex: 1001,
          }}>
            <p>{error}</p>
            <button
              className="btn btn-secondary"
              style={{ marginTop: '10px', width: 'auto' }}
              onClick={() => setError(null)}
            >
              关闭
            </button>
          </div>
        )}
      </div>

      {viewMode === 'comparison' && comparisonResult ? (
        <ComparisonPanel
          comparisonResult={comparisonResult}
          molecule1={molecule1}
          molecule2={molecule2}
          onBackToSingle={() => setViewMode('single')}
          onClearComparison={() => setComparisonResult(null)}
        />
      ) : (
        <ControlPanel
          moleculeData={molecule1?.data}
          molecule2={molecule2?.data}
          molecule1Filename={molecule1?.filename}
          molecule2Filename={molecule2?.filename}
          onFileUpload={handleFileUpload}
          onLoadSample={handleLoadSample}
          onClearMolecule={handleClearMolecule}
          onResetView={handleResetView}
          onColorModeChange={handleColorModeChange}
          onHighlightChain={handleHighlightChain}
          onHighlightResidue={handleHighlightResidue}
          onHighlightSecondaryStructure={handleHighlightSecondaryStructure}
          onClearHighlight={handleClearHighlight}
          onToggleFPS={handleToggleFPS}
          showFPS={showFPS}
          onCompare={handleCompareStructures}
          comparing={comparing}
          canCompare={!!(molecule1 && molecule2)}
          matchBy={matchBy}
          onMatchByChange={setMatchBy}
          rmsdThreshold={rmsdThreshold}
          onRmsdThresholdChange={setRmsdThreshold}
        />
      )}
    </div>
  )
}

export default App
