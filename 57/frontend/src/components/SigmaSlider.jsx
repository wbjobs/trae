import { useState, useEffect, useRef } from 'react'

const API_BASE = 'http://localhost:8000/api'

export default function SigmaSlider({ currentSigma, onSigmaChange, min = 1, max = 5, step = 0.1, disabled = false }) {
  const [localSigma, setLocalSigma] = useState(currentSigma)
  const [isDragging, setIsDragging] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!isDragging) {
      setLocalSigma(currentSigma)
    }
  }, [currentSigma, isDragging])

  const updateSigma = async (value) => {
    setIsUpdating(true)
    try {
      const response = await fetch(`${API_BASE}/sigma`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sigma: value })
      })

      if (response.ok) {
        const data = await response.json()
        onSigmaChange(data.sigma, true)
      }
    } catch (error) {
      console.error('更新Sigma失败:', error)
      onSigmaChange(value, false)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSliderChange = (e) => {
    const value = parseFloat(e.target.value)
    setLocalSigma(value)
    onSigmaChange(value, false)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      updateSigma(value)
    }, 300)
  }

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    updateSigma(localSigma)
  }

  const getSigmaColor = (sigma) => {
    if (sigma <= 2) return '#ef4444'
    if (sigma <= 3) return '#f59e0b'
    if (sigma <= 4) return '#10b981'
    return '#3b82f6'
  }

  const color = getSigmaColor(localSigma)
  const percentage = ((localSigma - min) / (max - min)) * 100

  return (
    <div style={{
      background: 'rgba(30, 30, 50, 0.8)',
      borderRadius: '12px',
      padding: '16px 20px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      marginBottom: '16px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div>
          <div style={{
            fontSize: '12px',
            color: '#71717a',
            marginBottom: '2px'
          }}>
            异常检测阈值 (Sigma σ)
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px'
          }}>
            <span style={{
              fontSize: '24px',
              fontWeight: 700,
              color: color
            }}>
              {localSigma.toFixed(1)}σ
            </span>
            {isUpdating && (
              <span style={{
                fontSize: '12px',
                color: '#f59e0b'
              }}>
                同步中...
              </span>
            )}
          </div>
        </div>
        <div style={{
          textAlign: 'right',
          fontSize: '11px',
          color: '#71717a'
        }}>
          <div>更低 = 更敏感</div>
          <div>更高 = 更宽松</div>
        </div>
      </div>

      <div style={{
        position: 'relative',
        padding: '8px 0'
      }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #ef4444, #f59e0b, #10b981, #3b82f6)',
          borderRadius: '2px',
          transform: 'translateY(-50%)',
          opacity: 0.3
        }} />
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          width: `${percentage}%`,
          height: '4px',
          background: color,
          borderRadius: '2px',
          transform: 'translateY(-50%)',
          transition: isDragging ? 'none' : 'width 0.2s ease'
        }} />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localSigma}
          onChange={handleSliderChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          disabled={disabled}
          style={{
            position: 'relative',
            width: '100%',
            height: '24px',
            appearance: 'none',
            background: 'transparent',
            cursor: 'pointer',
            zIndex: 1
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '8px',
        fontSize: '10px',
        color: '#71717a'
      }}>
        <span>{min}σ</span>
        <span style={{ color: '#a1a1aa' }}>2σ</span>
        <span style={{ color: '#a1a1aa' }}>3σ (默认)</span>
        <span style={{ color: '#a1a1aa' }}>4σ</span>
        <span>{max}σ</span>
      </div>

      <div style={{
        marginTop: '12px',
        padding: '8px 12px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#a1a1aa'
      }}>
        <span style={{ color: color, fontWeight: 600 }}>当前规则：</span>
        价格偏离均值超过 <span style={{ color: color, fontWeight: 600 }}>{localSigma.toFixed(1)} 个标准差</span> 即判定为异常
      </div>
    </div>
  )
}
