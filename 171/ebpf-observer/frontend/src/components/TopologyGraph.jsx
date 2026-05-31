export default function TopologyGraph({ topology }) {
  const { nodes, edges } = topology

  const nodePositions = calculatePositions(nodes)

  return (
    <div className="topology">
      <h2>TCP 重传率拓扑图</h2>
      <div className="topology-container">
        <svg viewBox="0 0 800 600" className="topology-svg">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
          </defs>

          {edges.map((edge, idx) => {
            const src = nodePositions[edge.src_service]
            const dst = nodePositions[edge.dst_service]
            if (!src || !dst) return null

            const retransColor = getRetransColor(edge.retransmit_rate)
            const strokeWidth = Math.max(1, edge.retransmit_rate * 20)

            return (
              <g key={idx}>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={dst.x}
                  y2={dst.y}
                  stroke={retransColor}
                  strokeWidth={strokeWidth}
                  markerEnd="url(#arrowhead)"
                  opacity="0.8"
                />
                <text
                  x={(src.x + dst.x) / 2}
                  y={(src.y + dst.y) / 2 - 5}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                >
                  {(edge.retransmit_rate * 100).toFixed(2)}%
                </text>
              </g>
            )
          })}

          {nodes.map((node) => {
            const pos = nodePositions[node.service_name]
            if (!pos) return null

            return (
              <g key={node.service_name}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="25"
                  fill={getNodeColor(node.health_score)}
                  stroke="#1e293b"
                  strokeWidth="2"
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize="10"
                  fontWeight="bold"
                >
                  {node.service_name.substring(0, 8)}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 40}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                >
                  {node.health_score.toFixed(0)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#10b981' }}></span>
          健康 (80-100)
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#f59e0b' }}></span>
          警告 (60-80)
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#ef4444' }}></span>
          异常 (0-60)
        </div>
      </div>
    </div>
  )
}

function calculatePositions(nodes) {
  const positions = {}
  const centerX = 400
  const centerY = 300
  const radius = 220

  nodes.forEach((node, idx) => {
    const angle = (idx / nodes.length) * 2 * Math.PI - Math.PI / 2
    positions[node.service_name] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }
  })

  return positions
}

function getNodeColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

function getRetransColor(rate) {
  if (rate < 0.01) return '#10b981'
  if (rate < 0.05) return '#f59e0b'
  return '#ef4444'
}
