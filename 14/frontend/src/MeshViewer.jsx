import React, { useMemo, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { valueToColor, arrayMinMax } from './utils'


function Triangles({ mesh, solution, colormap, showCloud, onCellClick }) {
  const meshRef = useRef()
  const edgesRef = useRef()

  const { positions, colors, indices, edgePositions } = useMemo(() => {
    if (!mesh || !mesh.cells || !mesh.nodes) {
      return {
        positions: new Float32Array(),
        colors: new Float32Array(),
        indices: new Uint32Array(),
        edgePositions: new Float32Array()
      }
    }

    const numCells = mesh.cells.length
    const numNodes = mesh.nodes.length

    const positions = new Float32Array(numNodes * 3)
    const colors = new Float32Array(numNodes * 3)
    const indices = new Uint32Array(numCells * 3)
    const edgePositions = new Float32Array(numCells * 6 * 3)

    for (let i = 0; i < numNodes; i++) {
      positions[i * 3] = mesh.nodes[i][0] - 0.5
      positions[i * 3 + 1] = mesh.nodes[i][1] - 0.5
      positions[i * 3 + 2] = 0
    }

    let { min, max } = arrayMinMax(solution || [])

    for (let i = 0; i < numCells; i++) {
      const cell = mesh.cells[i]
      indices[i * 3] = cell[0]
      indices[i * 3 + 1] = cell[1]
      indices[i * 3 + 2] = cell[2]

      for (let j = 0; j < 3; j++) {
        const nodeIdx = cell[j]
        const color = showCloud && solution
          ? valueToColor(solution[nodeIdx], min, max, colormap)
          : [0.4, 0.6, 0.9]
        colors[nodeIdx * 3] = color[0]
        colors[nodeIdx * 3 + 1] = color[1]
        colors[nodeIdx * 3 + 2] = color[2]
      }

      for (let j = 0; j < 3; j++) {
        const p0 = cell[j]
        const p1 = cell[(j + 1) % 3]
        const edgeIdx = (i * 6 + j * 2) * 3
        edgePositions[edgeIdx] = positions[p0 * 3]
        edgePositions[edgeIdx + 1] = positions[p0 * 3 + 1]
        edgePositions[edgeIdx + 2] = 0.001
        edgePositions[edgeIdx + 3] = positions[p1 * 3]
        edgePositions[edgeIdx + 4] = positions[p1 * 3 + 1]
        edgePositions[edgeIdx + 5] = 0.001
      }
    }

    return { positions, colors, indices, edgePositions }
  }, [mesh, solution, colormap, showCloud])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    return geo
  }, [positions, colors, indices])

  const edgeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3))
    return geo
  }, [edgePositions])

  const handleClick = (event) => {
    event.stopPropagation()
    if (!onCellClick) return
    const point = event.point
    const x = point.x + 0.5
    const y = point.y + 0.5
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      onCellClick(x, y)
    }
  }

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} onClick={handleClick}>
        <meshBasicMaterial vertexColors transparent opacity={0.95} />
      </mesh>
      <lineSegments ref={edgesRef} geometry={edgeGeometry}>
        <lineBasicMaterial color="#1a1a2e" linewidth={0.5} />
      </lineSegments>
    </group>
  )
}


function ColorBar({ solution, colormap }) {
  if (!solution || solution.length === 0) return null

  const { min, max } = arrayMinMax(solution)
  const numSteps = 50

  const positions = new Float32Array(numSteps * 2 * 3)
  const colors = new Float32Array(numSteps * 2 * 3)

  const x = 0.6
  const height = 0.8
  const width = 0.08
  const yStart = -height / 2

  for (let i = 0; i < numSteps; i++) {
    const t = i / (numSteps - 1)
    const y = yStart + t * height
    const color = valueToColor(min + t * (max - min), min, max, colormap)

    positions[i * 12] = x
    positions[i * 12 + 1] = y
    positions[i * 12 + 2] = 0
    positions[i * 12 + 3] = x + width
    positions[i * 12 + 4] = y
    positions[i * 12 + 5] = 0

    colors[i * 12] = color[0]
    colors[i * 12 + 1] = color[1]
    colors[i * 12 + 2] = color[2]
    colors[i * 12 + 3] = color[0]
    colors[i * 12 + 4] = color[1]
    colors[i * 12 + 5] = color[2]
  }

  const indices = new Uint32Array((numSteps - 1) * 6)
  for (let i = 0; i < numSteps - 1; i++) {
    const base = i * 2
    indices[i * 6] = base
    indices[i * 6 + 1] = base + 1
    indices[i * 6 + 2] = base + 2
    indices[i * 6 + 3] = base + 1
    indices[i * 6 + 4] = base + 3
    indices[i * 6 + 5] = base + 2
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <Text
        position={[x + width + 0.02, height / 2, 0]}
        color="white"
        fontSize={0.04}
        anchorX="left"
        anchorY="middle"
      >
        {max.toFixed(3)}
      </Text>
      <Text
        position={[x + width + 0.02, 0, 0]}
        color="white"
        fontSize={0.04}
        anchorX="left"
        anchorY="middle"
      >
        {((max + min) / 2).toFixed(3)}
      </Text>
      <Text
        position={[x + width + 0.02, -height / 2, 0]}
        color="white"
        fontSize={0.04}
        anchorX="left"
        anchorY="middle"
      >
        {min.toFixed(3)}
      </Text>
    </group>
  )
}


export default function MeshViewer({
  mesh,
  solution,
  colormap = 'viridis',
  showCloud = true,
  onCellClick
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 1.5], fov: 50 }}
      style={{ background: '#0f0f1e' }}
      gl={{ antialias: true }}
    >
      <Triangles
        mesh={mesh}
        solution={solution}
        colormap={colormap}
        showCloud={showCloud}
        onCellClick={onCellClick}
      />
      <ColorBar solution={solution} colormap={colormap} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={false}
        minZoom={0.5}
        maxZoom={3}
      />
    </Canvas>
  )
}
