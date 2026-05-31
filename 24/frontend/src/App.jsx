import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import ExecutionPlanVisualizer from './components/ExecutionPlanVisualizer.jsx'

const EXAMPLES = [
  {
    title: '1. 节点属性过滤',
    code: "MATCH (n:Person {name: 'Alice'})\nRETURN n.name, n.age"
  },
  {
    title: '2. 关系类型过滤',
    code: "MATCH (n:Person)-[r:KNOWS]->(m:Person)\nRETURN n.name, m.name"
  },
  {
    title: '3. 变长路径匹配',
    code: "MATCH (n:Person)-[r:KNOWS*1..3]->(m:Person)\nRETURN n.name AS start, m.name AS end"
  },
  {
    title: '4. 多关系类型',
    code: "MATCH (n)-[r:KNOWS|FOLLOWS]->(m)\nWHERE n.age > 25\nRETURN n.name, m.name"
  },
  {
    title: '5. 混合过滤条件',
    code: "MATCH (n:Person {city: 'Beijing'})-[r:KNOWS*2]->(m)\nWHERE m.age < 30\nRETURN n.name, m.name"
  }
]

const EXPLANATIONS = {
  'Seq Scan': '全表扫描：逐行读取表中的所有数据，性能较差，建议添加索引',
  'Sequential Scan': '全表扫描：逐行读取表中的所有数据，性能较差，建议添加索引',
  'Index Scan': '索引扫描：使用索引定位数据，性能较好',
  'Index Only Scan': '仅索引扫描：直接从索引获取数据，性能最优',
  'Hash Join': '哈希连接：先构建哈希表再进行匹配，适合大数据量',
  'Nested Loop': '嵌套循环连接：外层循环逐行，内层循环查找，适合小数据量',
  'Merge Join': '归并连接：对已排序的数据进行合并，适合有序数据',
  'CTE Scan': 'CTE扫描：扫描公共表表达式的结果',
  'WorkTable Scan': '工作表扫描：扫描递归CTE的中间结果',
  'Hash': '哈希操作：构建哈希表用于后续连接操作',
  'Sort': '排序操作：对结果集进行排序',
  'Unique': '去重操作：移除重复行'
}

export default function App() {
  const [cypherCode, setCypherCode] = useState(EXAMPLES[0].code)
  const [sqlCode, setSqlCode] = useState('')
  const [parsedInfo, setParsedInfo] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const [explainPlan, setExplainPlan] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [activeTab, setActiveTab] = useState('sql')

  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const debounceTimerRef = useRef(null)

  const setMarkers = useCallback((markers) => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monacoRef.current.editor.setModelMarkers(model, 'cypher-validator', markers)
      }
    }
  }, [])

  const validateCypher = useCallback(async (code) => {
    if (!code.trim()) {
      setValidationError(null)
      setMarkers([])
      return
    }

    setIsValidating(true)
    try {
      const response = await axios.post('/api/validate', {
        cypher: code
      })

      if (!response.data.valid) {
        setValidationError(response.data.error)
        const markers = []
        const lines = code.split('\n')
        const errorLine = response.data.error_line || 1
        const errorCol = response.data.error_column || 1

        markers.push({
          severity: monacoRef.current.MarkerSeverity.Error,
          startLineNumber: errorLine,
          startColumn: errorCol,
          endLineNumber: errorLine,
          endColumn: lines[errorLine - 1]?.length + 1 || errorCol + 1,
          message: response.data.error
        })
        setMarkers(markers)
      } else {
        setValidationError(null)
        setMarkers([])
      }
    } catch (err) {
      console.error('Validation error:', err)
    } finally {
      setIsValidating(false)
    }
  }, [setMarkers])

  const handleCodeChange = useCallback((value) => {
    const newCode = value || ''
    setCypherCode(newCode)
    setError(null)
    setSqlCode('')
    setParsedInfo(null)
    setExplainPlan(null)
    setSelectedNode(null)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      validateCypher(newCode)
    }, 500)
  }, [validateCypher])

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    monaco.languages.register({ id: 'cypher' })
    monaco.languages.setMonarchTokensProvider('cypher', {
      keywords: [
        'MATCH', 'WHERE', 'RETURN', 'AS', 'AND', 'OR', 'NOT',
        'IS', 'NULL', 'TRUE', 'FALSE', 'ORDER', 'BY', 'ASC',
        'DESC', 'LIMIT', 'SKIP', 'DISTINCT', 'WITH', 'UNWIND',
        'OPTIONAL', 'CREATE', 'DELETE', 'SET', 'REMOVE',
        'MERGE', 'ON', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
      ],
      operators: ['=', '<>', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', '^'],
      tokenizer: {
        root: [
          [/[a-zA-Z_][a-zA-Z0-9_]*/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }],
          [/".*?"/, 'string'],
          [/'.*?'/, 'string'],
          [/\d+/, 'number'],
          [/[():,\[\]{}|]/, 'delimiter'],
          [/@operators/, 'operator'],
          [/--.*/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
        ],
        comment: [
          [/[^\/*]+/, 'comment'],
          [/\/\*/, 'comment', '@push'],
          [/\*\//, 'comment', '@pop'],
          [/[\/*]/, 'comment']
        ]
      }
    })

    validateCypher(EXAMPLES[0].code)
  }, [validateCypher])

  const handleTranslate = useCallback(async () => {
    if (!cypherCode.trim()) {
      setError('请输入Cypher查询')
      return
    }

    setLoading(true)
    setError(null)
    setSqlCode('')
    setParsedInfo(null)
    setExplainPlan(null)
    setSelectedNode(null)

    try {
      const response = await axios.post('/api/translate', {
        cypher: cypherCode,
        include_explain: true
      })

      if (response.data.error) {
        setError(response.data.error)
      } else {
        setSqlCode(response.data.sql)
        setParsedInfo(response.data.parsed)
        setExplainPlan(response.data.explain_plan)
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || '翻译失败')
    } finally {
      setLoading(false)
    }
  }, [cypherCode])

  const handleExampleClick = (example) => {
    setCypherCode(example.code)
    setSqlCode('')
    setError(null)
    setParsedInfo(null)
    setValidationError(null)
    setExplainPlan(null)
    setSelectedNode(null)
    setMarkers([])
    validateCypher(example.code)
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleTranslate()
    }
  }

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const getNodeExplanation = (nodeType) => {
    for (const [key, value] of Object.entries(EXPLANATIONS)) {
      if (nodeType && nodeType.includes(key)) {
        return value
      }
    }
    return '执行计划节点'
  }

  return (
    <div className="app" onKeyDown={handleKeyDown}>
      <header className="header">
        <div>
          <h1>🔄 Cypher to PostgreSQL 翻译器</h1>
          <p className="subtitle">将图查询语言自动转译为递归CTE查询</p>
        </div>
      </header>

      <main className="main-content">
        <div className="schema-info">
          <h3>📋 目标数据库 Schema</h3>
          <div className="schema-tables">
            <div className="schema-table">
              <div className="table-name">nodes</div>
              <div className="column"><span className="col-name">id</span> <span className="col-type">INT</span></div>
              <div className="column"><span className="col-name">label</span> <span className="col-type">VARCHAR</span></div>
              <div className="column"><span className="col-name">properties</span> <span className="col-type">JSONB</span></div>
            </div>
            <div className="schema-table">
              <div className="table-name">edges</div>
              <div className="column"><span className="col-name">from_node</span> <span className="col-type">INT</span></div>
              <div className="column"><span className="col-name">to_node</span> <span className="col-type">INT</span></div>
              <div className="column"><span className="col-name">type</span> <span className="col-type">VARCHAR</span></div>
              <div className="column"><span className="col-name">properties</span> <span className="col-type">JSONB</span></div>
            </div>
          </div>
        </div>

        <div className="examples-section">
          <h3>📝 示例查询（点击加载）</h3>
          <div className="examples-grid">
            {EXAMPLES.map((example, idx) => (
              <div
                key={idx}
                className="example-card"
                onClick={() => handleExampleClick(example)}
              >
                <div className="example-title">{example.title}</div>
                <div className="example-code">{example.code}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="action-bar">
          <button
            className="translate-btn"
            onClick={handleTranslate}
            disabled={loading || validationError}
          >
            {loading ? (
              <>
                <span className="loading"></span>
                翻译中...
              </>
            ) : (
              <>
                <span>⚡</span>
                翻译 (Ctrl+Enter)
              </>
            )}
          </button>
          {isValidating && (
            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              <span className="loading" style={{ marginRight: '0.5rem' }}></span>
              语法检查中...
            </span>
          )}
          {!isValidating && !validationError && cypherCode.trim() && (
            <span style={{ color: '#6ee7b7', fontSize: '0.875rem' }}>
              ✅ 语法正确
            </span>
          )}
        </div>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {validationError && !error && (
          <div className="error-message">
            ⚠️ 语法错误: {validationError}
          </div>
        )}

        <div className="editor-section">
          <div className="editor-panel">
            <div className="panel-header">
              <h2><span className="icon">📜</span> Cypher 查询</h2>
              {validationError && (
                <span style={{ color: '#f87171', fontSize: '0.75rem' }}>
                  ❌ 语法错误
                </span>
              )}
              {!validationError && cypherCode.trim() && (
                <span style={{ color: '#6ee7b7', fontSize: '0.75rem' }}>
                  ✓ 语法正确
                </span>
              )}
            </div>
            <div className="editor-wrapper">
              <Editor
                height="100%"
                language="cypher"
                theme="vs-dark"
                value={cypherCode}
                onChange={handleCodeChange}
                onMount={handleEditorDidMount}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  automaticLayout: true,
                  wordWrap: 'on',
                  padding: { top: 10, bottom: 10 },
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                  renderWhitespace: 'selection'
                }}
              />
            </div>
          </div>

          <div className="editor-panel">
            <div className="panel-header" style={{ paddingBottom: 0 }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`tab-btn ${activeTab === 'sql' ? 'active' : ''}`}
                  onClick={() => setActiveTab('sql')}
                >
                  🗄️ SQL
                </button>
                <button
                  className={`tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                  onClick={() => setActiveTab('plan')}
                >
                  📊 执行计划
                  {explainPlan?.has_full_scan && (
                    <span style={{
                      marginLeft: '0.25rem',
                      color: '#ff6b6b',
                      fontSize: '0.7rem'
                    }}>
                      ⚠️
                    </span>
                  )}
                </button>
              </div>
              {activeTab === 'sql' && sqlCode && (
                <span style={{ color: '#6ee7b7', fontSize: '0.75rem' }}>
                  ✓ 已生成
                </span>
              )}
              {activeTab === 'plan' && explainPlan && (
                <span style={{ color: '#6ee7b7', fontSize: '0.75rem' }}>
                  {explainPlan.summary?.node_count} 个节点
                </span>
              )}
            </div>
            <div className="editor-wrapper">
              {activeTab === 'sql' ? (
                <Editor
                  height="100%"
                  language="sql"
                  theme="vs-dark"
                  value={sqlCode}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    automaticLayout: true,
                    wordWrap: 'on',
                    readOnly: true,
                    padding: { top: 10, bottom: 10 },
                    scrollBeyondLastLine: false,
                    fontFamily: 'Monaco, Menlo, "Courier New", monospace'
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                  {explainPlan ? (
                    <>
                      <ExecutionPlanVisualizer
                        planData={explainPlan}
                        onNodeClick={setSelectedNode}
                      />
                      {explainPlan.has_full_scan && (
                        <div className="plan-warning">
                          ⚠️ 检测到全表扫描，可能存在性能问题
                        </div>
                      )}
                      {selectedNode && (
                        <div className="node-detail-panel">
                          <div className="node-detail-header">
                            <span className="node-detail-title">
                              {selectedNode.is_full_scan ? '🔴' : '🟢'} {selectedNode.label}
                            </span>
                            <button
                              className="close-btn"
                              onClick={() => setSelectedNode(null)}
                            >
                              ✕
                            </button>
                          </div>
                          <div className="node-detail-body">
                            <div className="detail-row">
                              <span className="detail-label">类型:</span>
                              <span className="detail-value">{selectedNode.node_type}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">预估成本:</span>
                              <span className="detail-value">{selectedNode.cost}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">预估行数:</span>
                              <span className="detail-value">{selectedNode.rows.toLocaleString()}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">全表扫描:</span>
                              <span className={`detail-value ${selectedNode.is_full_scan ? 'danger' : 'success'}`}>
                                {selectedNode.is_full_scan ? '是' : '否'}
                              </span>
                            </div>
                            <div className="detail-row" style={{ marginTop: '0.75rem' }}>
                              <span className="detail-label">说明:</span>
                            </div>
                            <div className="detail-explanation">
                              {getNodeExplanation(selectedNode.node_type)}
                            </div>
                            {selectedNode.is_full_scan && (
                              <div className="detail-suggestion">
                                💡 建议：在相关列上创建索引以优化查询性能
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#6b7280',
                      fontSize: '0.875rem'
                    }}>
                      点击"翻译"按钮生成执行计划
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {parsedInfo && (
          <div className="schema-info">
            <h3>🔍 解析结构</h3>
            <pre style={{
              fontFamily: 'Monaco, Menlo, monospace',
              fontSize: '0.8rem',
              color: '#9ca3af',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {JSON.stringify(parsedInfo, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  )
}
