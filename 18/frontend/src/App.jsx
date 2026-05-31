import React, { useState, useCallback } from 'react'
import axios from 'axios'
import DocumentViewer from './components/DocumentViewer.jsx'
import ExtractedFields from './components/ExtractedFields.jsx'
import ValidationResults from './components/ValidationResults.jsx'
import LayoutFeatures from './components/LayoutFeatures.jsx'
import LoadingOverlay from './components/LoadingOverlay.jsx'

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState(null)

  const loadingSteps = [
    '正在上传文档...',
    '正在分析文档结构...',
    '正在提取关键字段...',
    '正在生成布局特征...',
    '正在进行逻辑校验...',
    '正在生成高亮标注...'
  ]

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setAnalysisResult(null)
      setError(null)
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return

    setIsAnalyzing(true)
    setLoadingStep(0)
    setError(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const stepInterval = setInterval(() => {
        setLoadingStep(prev => {
          if (prev < loadingSteps.length - 1) {
            return prev + 1
          }
          return prev
        })
      }, 1000)

      const response = await axios.post('/api/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000
      })

      clearInterval(stepInterval)
      setLoadingStep(loadingSteps.length - 1)

      await new Promise(resolve => setTimeout(resolve, 500))

      setAnalysisResult(response.data)
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.response?.data?.detail || '分析过程中发生错误，请重试')
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false)
      }, 800)
    }
  }, [selectedFile, loadingSteps.length])

  return (
    <div className="app-container">
      <header className="header">
        <h1>📄 合同智能分析 Agent</h1>
        <p>基于 LayoutLMv3/Donut 的文档结构感知与 LLM 逻辑校验系统</p>
      </header>

      <main className="main-content">
        <section className="upload-section">
          <div className="file-input-wrapper">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
              onChange={handleFileChange}
            />
            <div className="upload-icon">📎</div>
            <div className="upload-text">
              {selectedFile ? selectedFile.name : '点击或拖拽上传合同文档'}
            </div>
            <div className="upload-hint">
              支持 PDF 和图片格式 (PNG, JPG, TIFF, BMP)
            </div>
          </div>

          <button
            className="analyze-btn"
            onClick={handleAnalyze}
            disabled={!selectedFile || isAnalyzing}
          >
            {isAnalyzing ? '分析中...' : '🚀 开始分析'}
          </button>

          {error && (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              ❌ {error}
            </div>
          )}
        </section>

        {analysisResult && (
          <div className="results-grid">
            <div className="panel">
              <h2>📑 文档预览与高亮标注</h2>
              <DocumentViewer
                pages={analysisResult.pages}
                highlights={analysisResult.highlight_regions}
                documentStructure={analysisResult.document_structure}
              />
            </div>

            <div className="panel">
              <h2>🔍 提取的关键字段</h2>
              <ExtractedFields fields={analysisResult.extracted_fields} />
            </div>

            <div className="panel">
              <h2>📊 布局特征向量</h2>
              <LayoutFeatures
                features={analysisResult.layout_features}
                structure={analysisResult.document_structure}
              />
            </div>

            <div className="panel full-width">
              <h2>✅ 逻辑校验结果与推理链</h2>
              <ValidationResults
                results={analysisResult.validation_results}
                reasoningChains={analysisResult.reasoning_chains}
              />
            </div>
          </div>
        )}

        {!analysisResult && !selectedFile && (
          <div className="panel empty-state">
            <div className="icon">📂</div>
            <h3>上传合同文档开始分析</h3>
            <p>系统将自动识别文档结构、提取关键字段并进行逻辑校验</p>
          </div>
        )}
      </main>

      {isAnalyzing && (
        <LoadingOverlay
          steps={loadingSteps}
          currentStep={loadingStep}
        />
      )}
    </div>
  )
}
