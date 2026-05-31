import { useRef, useCallback, useEffect } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'

cytoscape.use(dagre)

const defaultStylesheet = [
  {
    selector: 'node',
    style: {
      'background-color': (ele) => ele.data('color') || '#4ecdc4',
      'border-width': 2,
      'border-color': (ele) => ele.data('is_full_scan') ? '#ff4757' : '#2c3e50',
      'label': (ele) => ele.data('label'),
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '11px',
      'color': '#ffffff',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      'width': (ele) => {
        const baseSize = ele.data('is_full_scan') ? 80 : 60
        return baseSize
      },
      'height': (ele) => {
        const baseSize = ele.data('is_full_scan') ? 80 : 60
        return baseSize
      },
      'shadow-blur': (ele) => ele.data('is_full_scan') ? 15 : 5,
      'shadow-color': (ele) => ele.data('is_full_scan') ? '#ff6b6b' : '#4ecdc4',
      'shadow-opacity': 0.5
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#7f8c8d',
      'target-arrow-color': '#7f8c8d',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 1.2,
      'opacity': 0.8
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#f39c12',
      'shadow-blur': 20,
      'shadow-color': '#f39c12',
      'shadow-opacity': 0.8
    }
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#f39c12',
      'target-arrow-color': '#f39c12',
      'width': 4
    }
  }
]

export default function ExecutionPlanVisualizer({ planData, onNodeClick }) {
  const cyRef = useRef(null)

  const transformToCytoscape = useCallback((plan) => {
    if (!plan || !plan.nodes) return { nodes: [], edges: [] }

    const elements = []

    plan.nodes.forEach(node => {
      elements.push({
        data: {
          id: node.id,
          label: node.label,
          node_type: node.node_type,
          is_full_scan: node.is_full_scan,
          cost: node.cost,
          rows: node.rows,
          details: node.details,
          color: node.is_full_scan ? '#ff6b6b' : '#4ecdc4'
        }
      })
    })

    plan.edges.forEach(edge => {
      elements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target
        }
      })
    })

    return elements
  }, [])

  const handleCyInit = useCallback((cy) => {
    cyRef.current = cy

    cy.on('tap', 'node', (event) => {
      const node = event.target
      if (onNodeClick) {
        onNodeClick(node.data())
      }
    })

    cy.on('tap', (event) => {
      if (event.target === cy) {
        if (onNodeClick) {
          onNodeClick(null)
        }
      }
    })
  }, [onNodeClick])

  useEffect(() => {
    if (cyRef.current && planData) {
      cyRef.current.resize()
      cyRef.current.fit(undefined, 50)
    }
  }, [planData])

  if (!planData || !planData.nodes || planData.nodes.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#6b7280',
        fontSize: '0.875rem'
      }}>
        暂无执行计划数据
      </div>
    )
  }

  const elements = transformToCytoscape(planData)

  const layout = {
    name: 'dagre',
    rankDir: 'TB',
    nodeDimensionsIncludeLabels: true,
    spacingFactor: 1.5,
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 30
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '100%' }}
        stylesheet={defaultStylesheet}
        layout={layout}
        cy={handleCyInit}
        wheelSensitivity={0.3}
        minZoom={0.5}
        maxZoom={2}
      />
    </div>
  )
}
