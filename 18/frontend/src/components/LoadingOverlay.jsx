import React from 'react'

export default function LoadingOverlay({ steps, currentStep }) {
  return (
    <div className="loading-overlay">
      <div className="spinner"></div>
      <div className="loading-text">🤖 AI 正在分析文档...</div>
      
      <div className="loading-steps">
        {steps.map((step, idx) => {
          let className = 'loading-step'
          if (idx < currentStep) className += ' completed'
          else if (idx === currentStep) className += ' active'
          
          return (
            <div key={idx} className={className}>
              {idx < currentStep ? '✓' : idx === currentStep ? '⏳' : '○'} {step}
            </div>
          )
        })}
      </div>
    </div>
  )
}
