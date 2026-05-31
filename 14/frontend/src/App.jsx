import React, { useState, useEffect, useCallback } from 'react'
import MeshViewer from './MeshViewer'
import {
  getInitialMesh,
  refineByClick,
  refineByEstimator,
  resetMesh,
  healthCheck
} from './api'

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    background: '#0f0f1e'
  },
  canvas: {
    flex: 1,
    position: 'relative'
  },
  sidebar: {
    width: '320px',
    background: '#1a1a2e',
    color: 'white',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    borderLeft: '1px solid #2a2a4e',
    overflowY: 'auto'
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '10px',
    color: '#4da6ff'
  },
  subtitle: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '15px'
  },
  section: {
    background: '#252540',
    borderRadius: '8px',
    padding: '15px'
  },
  button: {
    width: '100%',
    padding: '10px 15px',
    marginBottom: '8px',
    background: '#4da6ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background 0.2s'
  },
  buttonSecondary: {
    background: '#2a4a6a'
  },
  buttonDanger: {
    background: '#a64d4d'
  },
  buttonDisabled: {
    background: '#333',
    cursor: 'not-allowed',
    opacity: 0.6
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '13px'
  },
  statLabel: {
    color: '#888'
  },
  statValue: {
    color: '#4da6ff',
    fontWeight: '500'
  },
  dropdown: {
    width: '100%',
    padding: '10px',
    background: '#2a2a4e',
    color: 'white',
    border: '1px solid #3a3a5e',
    borderRadius: '6px',
    fontSize: '13px',
    marginTop: '8px',
    cursor: 'pointer'
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: '#aaa'
  },
  input: {
    width: '100%',
    padding: '10px',
    background: '#2a2a4e',
    color: 'white',
    border: '1px solid #3a3a5e',
    borderRadius: '6px',
    fontSize: '13px',
    marginTop: '8px'
  },
  label: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '5px',
    display: 'block'
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#4da6ff',
    fontSize: '16px'
  }
}

function App() {
  const [mesh, setMesh] = useState(null)
  const [solution, setSolution] = useState(null)
  const [eta, setEta] = useState(null)
  const [statistics, setStatistics] = useState(null)
  const [colormap, setColormap] = useState('viridis')
  const [showCloud, setShowCloud] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refining, setRefining] = useState(false)
  const [refinementLevels, setRefinementLevels] = useState(1)
  const [error, setError] = useState(null)

  const loadInitialMesh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getInitialMesh()
      setMesh(data.mesh)
      setSolution(data.u)
      setEta(data.eta)
      setStatistics(data.statistics)
    } catch (err) {
      console.error('Failed to load initial mesh:', err)
      setError('无法连接到后端服务器。请确保后端服务已启动 (端口 5000)')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialMesh()
  }, [loadInitialMesh])

  const handleCellClick = useCallback(async (x, y) => {
    if (refining) return
    setRefining(true)
    setError(null)
    try {
      const data = await refineByClick(x, y, refinementLevels)
      setMesh(data.mesh)
      setSolution(data.u)
      setEta(data.eta)
      setStatistics(data.statistics)
    } catch (err) {
      console.error('Refinement failed:', err)
      setError('加密失败: ' + err.message)
    } finally {
      setRefining(false)
    }
  }, [refining, refinementLevels])

  const handleEstimatorRefine = useCallback(async () => {
    if (refining) return
    setRefining(true)
    setError(null)
    try {
      const data = await refineByEstimator()
      setMesh(data.mesh)
      setSolution(data.u)
      setEta(data.eta)
      setStatistics(data.statistics)
    } catch (err) {
      console.error('Estimator refinement failed:', err)
      setError('基于误差估计的加密失败: ' + err.message)
    } finally {
      setRefining(false)
    }
  }, [refining])

  const handleReset = useCallback(async () => {
    if (refining) return
    setRefining(true)
    setError(null)
    try {
      const data = await resetMesh()
      setMesh(data.mesh)
      setSolution(data.u)
      setEta(data.eta)
      setStatistics(data.statistics)
    } catch (err) {
      console.error('Reset failed:', err)
      setError('重置失败: ' + err.message)
    } finally {
      setRefining(false)
    }
  }, [refining])

  return (
    <div style={styles.container}>
      <div style={styles.canvas}>
        {loading ? (
          <div style={styles.loading}>
            {error ? error : '加载中...'}
          </div>
        ) : (
          <MeshViewer
            mesh={mesh}
            solution={showCloud ? solution : null}
            colormap={colormap}
            showCloud={showCloud}
            onCellClick={handleCellClick}
          />
        )}
        {refining && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#4da6ff',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            zIndex: 100
          }}>
            正在加密网格并重新求解...
          </div>
        )}
      </div>

      <div style={styles.sidebar}>
        <div>
          <div style={styles.title}>自适应有限元求解</div>
          <div style={styles.subtitle}>
            求解泊松方程 -Δu = f<br/>
            精确解: u = sin(πx)sin(πy)
          </div>
        </div>

        {error && (
          <div style={{
            background: '#3a1a1a',
            border: '1px solid #5a2a2a',
            borderRadius: '8px',
            padding: '12px',
            color: '#ff8888',
            fontSize: '12px'
          }}>
            {error}
          </div>
        )}

        {statistics && (
          <div style={styles.section}>
            <div style={{ ...styles.title, fontSize: '14px', marginBottom: '12px' }}>
              统计信息
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>加密步数</span>
              <span style={styles.statValue}>{statistics.refinement_step}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>节点数</span>
              <span style={styles.statValue}>{statistics.num_nodes}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>单元数</span>
              <span style={styles.statValue}>{statistics.num_cells}</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>L2 误差</span>
              <span style={styles.statValue}>
                {statistics.l2_error ? statistics.l2_error.toExponential(4) : '-'}
              </span>
            </div>
          </div>
        )}

        <div style={styles.section}>
          <div style={{ ...styles.title, fontSize: '14px', marginBottom: '12px' }}>
            控制选项
          </div>

          <div style={styles.label}>点击加密层数</div>
          <input
            type="number"
            min="1"
            max="5"
            value={refinementLevels}
            onChange={(e) => setRefinementLevels(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
            style={styles.input}
          />

          <div style={{ ...styles.label, marginTop: '15px' }}>颜色映射</div>
          <select
            value={colormap}
            onChange={(e) => setColormap(e.target.value)}
            style={styles.dropdown}
          >
            <option value="viridis">Viridis</option>
            <option value="plasma">Plasma</option>
            <option value="jet">Jet</option>
          </select>

          <div style={{ ...styles.checkbox, marginTop: '15px' }}>
            <input
              type="checkbox"
              checked={showCloud}
              onChange={(e) => setShowCloud(e.target.checked)}
            />
            <span>显示解的云图</span>
          </div>
        </div>

        <div style={styles.section}>
          <div style={{ ...styles.title, fontSize: '14px', marginBottom: '12px' }}>
            操作
          </div>

          <div style={{ ...styles.label, fontSize: '11px', marginBottom: '8px' }}>
            点击网格上的任意位置进行局部加密
          </div>

          <button
            onClick={handleEstimatorRefine}
            disabled={refining || loading}
            style={{
              ...styles.button,
              ...(refining || loading ? styles.buttonDisabled : {})
            }}
          >
            基于后验误差自动加密
          </button>

          <button
            onClick={handleReset}
            disabled={refining || loading}
            style={{
              ...styles.button,
              ...styles.buttonDanger,
              ...(refining || loading ? styles.buttonDisabled : {})
            }}
          >
            重置到初始网格
          </button>
        </div>

        <div style={styles.section}>
          <div style={{ ...styles.title, fontSize: '14px', marginBottom: '12px' }}>
            说明
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.6', color: '#888' }}>
            <p style={{ marginBottom: '8px' }}>
              <strong style={{ color: '#aaa' }}>后验误差估计器:</strong><br/>
              结合梯度跳变项和残差项
            </p>
            <p style={{ marginBottom: '8px' }}>
              <strong style={{ color: '#aaa' }}>标记策略:</strong><br/>
              Dörfler 标记法 (30% 总误差)
            </p>
            <p>
              <strong style={{ color: '#aaa' }}>加密方法:</strong><br/>
              最长边二分法 (含传播)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
