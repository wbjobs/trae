import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const CHAIN_COLORS = [
  '#e94560', '#4ecdc4', '#45b7d1', '#96ceb4',
  '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe',
  '#00b894', '#e17055', '#74b9ff', '#fab1a0',
]

const SECONDARY_STRUCTURE_COLORS = {
  helix: '#FF6B6B',
  sheet: '#4ECDC4',
  coil: '#95A5A6',
  turn: '#F39C12',
}

const RESIDUE_COLORS = {
  ALA: '#8CFF8C', ARG: '#00007C', ASN: '#FF7C70', ASP: '#A00042',
  CYS: '#FFFF70', GLN: '#FF4C4C', GLU: '#660000', GLY: '#FFFFFF',
  HIS: '#7070FF', ILE: '#004C00', LEU: '#455E45', LYS: '#4747B8',
  MET: '#B8A042', PHE: '#534C52', PRO: '#525252', SER: '#FF7042',
  THR: '#B84C00', TRP: '#4F4600', TYR: '#8C704C', VAL: '#FF8C00',
}

const MoleculeViewer = forwardRef(({ moleculeData, comparisonData }, ref) => {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const controlsRef = useRef(null)
  const molecule1GroupRef = useRef(null)
  const molecule2GroupRef = useRef(null)
  const raycasterRef = useRef(null)
  const mouseRef = useRef(null)
  const animationIdRef = useRef(null)
  const needsRenderRef = useRef(true)
  const dummyRef = useRef(new THREE.Object3D())
  const currentDataRef = useRef(null)

  const [hoveredAtom, setHoveredAtom] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [showFPS, setShowFPS] = useState(false)
  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), current: 0 })

  useImperativeHandle(ref, () => ({
    resetView: () => {
      if (controlsRef.current) {
        controlsRef.current.reset()
        requestRender()
      }
    },
    setColorMode: (mode) => {
      if (currentDataRef.current && !comparisonData) {
        updateAtomColors(mode, currentDataRef.current)
      }
    },
    highlightChain: (chain) => {
      if (currentDataRef.current) {
        highlightAtoms(currentDataRef.current, (atom) => atom.chain === chain)
      }
    },
    highlightResidue: (residueKey) => {
      if (currentDataRef.current) {
        const [chain, seq, name] = residueKey.split('_')
        highlightAtoms(currentDataRef.current, (atom) =>
          atom.chain === chain &&
          atom.residue_seq === parseInt(seq) &&
          atom.residue_name === name
        )
      }
    },
    highlightSecondaryStructure: (type) => {
      if (currentDataRef.current) {
        highlightAtoms(currentDataRef.current, (atom) => atom.secondary_structure === type)
      }
    },
    clearHighlight: () => {
      clearAllHighlights()
    },
    toggleFPS: () => {
      setShowFPS(prev => !prev)
    },
  }))

  const requestRender = () => {
    needsRenderRef.current = true
  }

  const getQualitySettings = (numAtoms) => {
    const totalAtoms = comparisonData ? numAtoms * 2 : numAtoms
    if (totalAtoms > 10000) {
      return { atomSegments: 6, bondSegments: 4, shadows: false, pixelRatio: Math.min(window.devicePixelRatio, 1) }
    } else if (totalAtoms > 5000) {
      return { atomSegments: 8, bondSegments: 5, shadows: false, pixelRatio: Math.min(window.devicePixelRatio, 1.5) }
    } else if (totalAtoms > 2000) {
      return { atomSegments: 10, bondSegments: 6, shadows: true, pixelRatio: window.devicePixelRatio }
    } else {
      return { atomSegments: 16, bondSegments: 8, shadows: true, pixelRatio: window.devicePixelRatio }
    }
  }

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 10000)
    camera.position.set(0, 0, 50)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 5
    controls.maxDistance = 500
    controlsRef.current = controls

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 50, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 1024
    directionalLight.shadow.mapSize.height = 1024
    scene.add(directionalLight)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3)
    directionalLight2.position.set(-50, -50, -50)
    scene.add(directionalLight2)

    molecule1GroupRef.current = new THREE.Group()
    scene.add(molecule1GroupRef.current)

    molecule2GroupRef.current = new THREE.Group()
    scene.add(molecule2GroupRef.current)

    raycasterRef.current = new THREE.Raycaster()
    mouseRef.current = new THREE.Vector2()

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      const controlsUpdated = controls.update()
      if (needsRenderRef.current || controlsUpdated) {
        renderer.render(scene, camera)
        needsRenderRef.current = false
        fpsRef.current.frames++
        const now = performance.now()
        if (now - fpsRef.current.lastTime >= 1000) {
          fpsRef.current.current = fpsRef.current.frames
          fpsRef.current.frames = 0
          fpsRef.current.lastTime = now
        }
      }
    }
    animate()

    const handleResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
      requestRender()
    }
    window.addEventListener('resize', handleResize)

    const handleMouseMove = (event) => {
      const rect = containerRef.current.getBoundingClientRect()
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      setMousePos({ x: event.clientX, y: event.clientY })
      checkHover()
    }
    renderer.domElement.addEventListener('mousemove', handleMouseMove)

    const handleInteraction = () => {
      requestRender()
    }
    renderer.domElement.addEventListener('mousedown', handleInteraction)
    renderer.domElement.addEventListener('wheel', handleInteraction)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      renderer.domElement.removeEventListener('mousedown', handleInteraction)
      renderer.domElement.removeEventListener('wheel', handleInteraction)
      cancelAnimationFrame(animationIdRef.current)
      disposeAll()
      renderer.dispose()
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    if (!sceneRef.current) return
    renderMolecules()
  }, [moleculeData, comparisonData])

  const disposeAll = () => {
    if (molecule1GroupRef.current) {
      while (molecule1GroupRef.current.children.length > 0) {
        const child = molecule1GroupRef.current.children[0]
        molecule1GroupRef.current.remove(child)
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    }
    if (molecule2GroupRef.current) {
      while (molecule2GroupRef.current.children.length > 0) {
        const child = molecule2GroupRef.current.children[0]
        molecule2GroupRef.current.remove(child)
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    }
    currentDataRef.current = null
  }

  const renderMolecules = () => {
    disposeAll()

    if (comparisonData) {
      renderComparison(comparisonData)
    } else if (moleculeData) {
      currentDataRef.current = moleculeData
      renderSingleMolecule(moleculeData, molecule1GroupRef.current, 'molecule1')
    }

    requestRender()
  }

  const renderComparison = (data) => {
    const { molecule1, molecule2, comparisonResult } = data

    if (molecule1) {
      currentDataRef.current = molecule1
      renderSingleMolecule(molecule1, molecule1GroupRef.current, 'molecule1', true, new THREE.Color(0x3498db), 0.8)
    }

    if (molecule2) {
      renderSingleMolecule(molecule2, molecule2GroupRef.current, 'molecule2', true, new THREE.Color(0xe74c3c), 0.8)
    }

    if (comparisonResult && comparisonResult.high_diff_atoms) {
      highlightDifferences(comparisonResult.high_diff_atoms)
    }
  }

  const renderSingleMolecule = (data, group, id, overrideColor = false, color = null, opacity = 1.0) => {
    const { atoms, bonds } = data
    if (!atoms || atoms.length === 0) return

    const quality = getQualitySettings(atoms.length)

    const center = calculateCenter(atoms)
    const maxRadius = Math.max(...atoms.map(a => a.radius || 1))
    const averageRadius = atoms.reduce((sum, a) => sum + (a.radius || 1), 0) / atoms.length

    const centeredAtoms = atoms.map((atom, index) => ({
      ...atom,
      centeredX: atom.x - center.x,
      centeredY: atom.y - center.y,
      centeredZ: atom.z - center.z,
    }))

    const atomsGroup = new THREE.Group()
    group.add(atomsGroup)

    const uniqueRadii = [...new Set(atoms.map(a => (a.radius || 1) * 0.4))]
    const atomData = {
      atoms: centeredAtoms,
      instancedMeshes: [],
      originalColors: [],
      highlightStates: [],
    }

    const colorFn = (atom, index) => {
      if (overrideColor && color) {
        return color
      }
      return getAtomColor(atom, index, 'element')
    }

    if (uniqueRadii.length <= 5) {
      createInstancedAtomsByRadius(centeredAtoms, quality, atomsGroup, atomData, colorFn, opacity)
    } else {
      createSingleInstancedAtoms(centeredAtoms, averageRadius * 0.4, quality, atomsGroup, atomData, colorFn, opacity)
    }

    if (bonds && bonds.length > 0) {
      const bondsGroup = new THREE.Group()
      group.add(bondsGroup)
      createInstancedBonds(centeredAtoms, bonds, maxRadius, quality, bondsGroup, overrideColor ? color : new THREE.Color(0x888888))
    }

    group.userData = { id, atomData }

    const maxDim = Math.max(
      Math.max(...atoms.map(a => Math.abs(a.x - center.x))),
      Math.max(...atoms.map(a => Math.abs(a.y - center.y))),
      Math.max(...atoms.map(a => Math.abs(a.z - center.z)))
    )
    const distance = maxDim * 2.5
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, distance)
      cameraRef.current.far = distance * 10
      cameraRef.current.updateProjectionMatrix()
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }

  const createInstancedAtomsByRadius = (atoms, quality, group, atomData, colorFn, opacity) => {
    const radiusGroups = {}
    atoms.forEach((atom, index) => {
      const radius = (atom.radius || 1) * 0.4
      if (!radiusGroups[radius]) {
        radiusGroups[radius] = []
      }
      radiusGroups[radius].push(index)
    })

    Object.entries(radiusGroups).forEach(([radius, indices]) => {
      const r = parseFloat(radius)
      const geometry = new THREE.SphereGeometry(r, quality.atomSegments, quality.atomSegments)
      const material = new THREE.MeshPhongMaterial({
        shininess: 80,
        specular: 0x222222,
        vertexColors: true,
        transparent: opacity < 1,
        opacity: opacity,
      })

      const instancedMesh = new THREE.InstancedMesh(geometry, material, indices.length)
      instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(indices.length * 3), 3)

      const dummy = dummyRef.current
      indices.forEach((atomIndex, i) => {
        const atom = atoms[atomIndex]
        dummy.position.set(atom.centeredX, atom.centeredY, atom.centeredZ)
        dummy.updateMatrix()
        instancedMesh.setMatrixAt(i, dummy.matrix)

        const color = colorFn(atom, atomIndex)
        const threeColor = color instanceof THREE.Color ? color : new THREE.Color(color)
        instancedMesh.instanceColor.setXYZ(i, threeColor.r, threeColor.g, threeColor.b)
        atomData.originalColors[atomIndex] = threeColor.clone()
        atomData.highlightStates[atomIndex] = { highlighted: false, dimmed: false }
      })

      instancedMesh.instanceColor.needsUpdate = true
      instancedMesh.castShadow = quality.shadows
      instancedMesh.receiveShadow = quality.shadows
      instancedMesh.userData = { atomIndices: indices, isAtom: true }

      group.add(instancedMesh)
      atomData.instancedMeshes.push(instancedMesh)
    })
  }

  const createSingleInstancedAtoms = (atoms, baseRadius, quality, group, atomData, colorFn, opacity) => {
    const geometry = new THREE.SphereGeometry(1, quality.atomSegments, quality.atomSegments)
    const material = new THREE.MeshPhongMaterial({
      shininess: 80,
      specular: 0x222222,
      vertexColors: true,
      transparent: opacity < 1,
      opacity: opacity,
    })

    const instancedMesh = new THREE.InstancedMesh(geometry, material, atoms.length)
    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(atoms.length * 3), 3)

    const dummy = dummyRef.current
    atoms.forEach((atom, index) => {
      const scale = (atom.radius || 1) * 0.4
      dummy.position.set(atom.centeredX, atom.centeredY, atom.centeredZ)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      instancedMesh.setMatrixAt(index, dummy.matrix)

      const color = colorFn(atom, index)
      const threeColor = color instanceof THREE.Color ? color : new THREE.Color(color)
      instancedMesh.instanceColor.setXYZ(index, threeColor.r, threeColor.g, threeColor.b)
      atomData.originalColors[index] = threeColor.clone()
      atomData.highlightStates[index] = { highlighted: false, dimmed: false }
    })

    instancedMesh.instanceColor.needsUpdate = true
    instancedMesh.castShadow = quality.shadows
    instancedMesh.receiveShadow = quality.shadows
    instancedMesh.userData = { atomIndices: atoms.map((_, i) => i), isAtom: true }

    group.add(instancedMesh)
    atomData.instancedMeshes.push(instancedMesh)
  }

  const createInstancedBonds = (atoms, bonds, maxRadius, quality, group, color) => {
    const bondRadius = maxRadius * 0.15
    const geometry = new THREE.CylinderGeometry(bondRadius, bondRadius, 1, quality.bondSegments, 1)
    geometry.translate(0, 0.5, 0)

    const material = new THREE.MeshPhongMaterial({
      color: color,
      shininess: 40,
    })

    const instancedMesh = new THREE.InstancedMesh(geometry, material, bonds.length)
    const dummy = dummyRef.current
    const up = new THREE.Vector3(0, 1, 0)

    bonds.forEach((bond, index) => {
      const atom1 = atoms[bond.atom1]
      const atom2 = atoms[bond.atom2]
      if (!atom1 || !atom2) return

      const start = new THREE.Vector3(atom1.centeredX, atom1.centeredY, atom1.centeredZ)
      const end = new THREE.Vector3(atom2.centeredX, atom2.centeredY, atom2.centeredZ)
      const direction = new THREE.Vector3().subVectors(end, start)
      const length = direction.length()

      dummy.position.copy(start)
      dummy.scale.set(1, length, 1)
      dummy.quaternion.setFromUnitVectors(up, direction.clone().normalize())
      dummy.updateMatrix()
      instancedMesh.setMatrixAt(index, dummy.matrix)
    })

    instancedMesh.castShadow = quality.shadows
    instancedMesh.receiveShadow = quality.shadows
    instancedMesh.userData = { isBond: true }
    group.add(instancedMesh)
  }

  const highlightDifferences = (highDiffAtoms) => {
    if (!molecule2GroupRef.current) return

    molecule2GroupRef.current.traverse((child) => {
      if (child.isInstancedMesh && child.userData.isAtom) {
        const { atomIndices } = child.userData
        const diffAtomIndices = new Set(highDiffAtoms.map(d => d.atom2_index))
        atomIndices.forEach((atomIndex, i) => {
          if (diffAtomIndices.has(atomIndex)) {
            const color = new THREE.Color(0xffff00)
            child.instanceColor.setXYZ(i, color.r, color.g, color.b)
          }
        })
        child.instanceColor.needsUpdate = true
      }
    })
  }

  const getAtomColor = (atom, index, mode) => {
    switch (mode) {
      case 'chain':
        const chainIndex = atom.chain.charCodeAt(0) - 65
        return CHAIN_COLORS[chainIndex % CHAIN_COLORS.length]
      case 'secondary':
        return SECONDARY_STRUCTURE_COLORS[atom.secondary_structure] || '#95A5A6'
      case 'residue':
        return RESIDUE_COLORS[atom.residue_name] || '#FFFFFF'
      case 'element':
      default:
        return atom.color || '#FFFFFF'
    }
  }

  const updateAtomColors = (mode, data) => {
    if (!molecule1GroupRef.current) return

    const userData = molecule1GroupRef.current.userData
    if (!userData.atomData) return

    const { atomData } = userData
    atomData.instancedMeshes.forEach((instancedMesh) => {
      const { atomIndices } = instancedMesh.userData
      atomIndices.forEach((atomIndex, i) => {
        const atom = data.atoms[atomIndex]
        if (atom) {
          const color = new THREE.Color(getAtomColor(atom, atomIndex, mode))
          instancedMesh.instanceColor.setXYZ(i, color.r, color.g, color.b)
          atomData.originalColors[atomIndex] = color.clone()
        }
      })
      instancedMesh.instanceColor.needsUpdate = true
    })

    clearAllHighlights()
    requestRender()
  }

  const highlightAtoms = (data, predicate) => {
    if (!molecule1GroupRef.current) return

    const userData = molecule1GroupRef.current.userData
    if (!userData.atomData) return

    const { atomData } = userData
    atomData.instancedMeshes.forEach((instancedMesh) => {
      const { atomIndices } = instancedMesh.userData
      atomIndices.forEach((atomIndex, i) => {
        const atom = data.atoms[atomIndex]
        const isHighlighted = predicate(atom)

        let targetColor
        if (isHighlighted) {
          targetColor = new THREE.Color(0xffff00)
          atomData.highlightStates[atomIndex] = { highlighted: true, dimmed: false }
        } else {
          targetColor = atomData.originalColors[atomIndex].clone().multiplyScalar(0.2)
          atomData.highlightStates[atomIndex] = { highlighted: false, dimmed: true }
        }

        instancedMesh.instanceColor.setXYZ(i, targetColor.r, targetColor.g, targetColor.b)
      })
      instancedMesh.instanceColor.needsUpdate = true
    })

    molecule1GroupRef.current.traverse((child) => {
      if (child.isInstancedMesh && child.userData.isBond) {
        child.material.opacity = 0.1
        child.material.transparent = true
      }
    })

    requestRender()
  }

  const clearAllHighlights = () => {
    if (molecule1GroupRef.current) {
      const userData = molecule1GroupRef.current.userData
      if (userData.atomData) {
        const { atomData } = userData
        atomData.instancedMeshes.forEach((instancedMesh) => {
          const { atomIndices } = instancedMesh.userData
          atomIndices.forEach((atomIndex, i) => {
            const color = atomData.originalColors[atomIndex]
            if (color) {
              instancedMesh.instanceColor.setXYZ(i, color.r, color.g, color.b)
            }
            atomData.highlightStates[atomIndex] = { highlighted: false, dimmed: false }
          })
          instancedMesh.instanceColor.needsUpdate = true
        })
      }

      molecule1GroupRef.current.traverse((child) => {
        if (child.isInstancedMesh && child.userData.isBond) {
          child.material.opacity = 1
          child.material.transparent = false
        }
      })
    }

    if (molecule2GroupRef.current) {
      molecule2GroupRef.current.traverse((child) => {
        if (child.isInstancedMesh && child.userData.isBond) {
          child.material.opacity = 1
          child.material.transparent = false
        }
      })
    }

    requestRender()
  }

  const checkHover = () => {
    if (!raycasterRef.current || !cameraRef.current) return

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

    const meshes = []
    if (molecule1GroupRef.current) {
      molecule1GroupRef.current.traverse((child) => {
        if (child.isInstancedMesh && child.userData.isAtom) {
          meshes.push(child)
        }
      })
    }
    if (molecule2GroupRef.current) {
      molecule2GroupRef.current.traverse((child) => {
        if (child.isInstancedMesh && child.userData.isAtom) {
          meshes.push(child)
        }
      })
    }

    const intersects = raycasterRef.current.intersectObjects(meshes, false)

    if (intersects.length > 0) {
      const hit = intersects[0]
      const instancedMesh = hit.object
      const { instanceId } = hit
      const atomIndices = instancedMesh.userData.atomIndices
      const globalAtomIndex = atomIndices[instanceId]

      let atoms = null
      if (comparisonData) {
        if (molecule1GroupRef.current.children.some(g => g.children.includes(instancedMesh)) {
          atoms = comparisonData.molecule1?.atoms
        } else {
          atoms = comparisonData.molecule2?.atoms
        }
      } else if (currentDataRef.current) {
        atoms = currentDataRef.current.atoms
      }

      if (atoms) {
        const atom = atoms[globalAtomIndex]
        setHoveredAtom(atom)
        document.body.style.cursor = 'pointer'
        return
      }
    }

    setHoveredAtom(null)
    document.body.style.cursor = 'default'
  }

  const calculateCenter = (atoms) => {
    let sumX = 0, sumY = 0, sumZ = 0
    atoms.forEach(atom => {
      sumX += atom.x
      sumY += atom.y
      sumZ += atom.z
    })
    return {
      x: sumX / atoms.length,
      y: sumY / atoms.length,
      z: sumZ / atoms.length,
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {showFPS && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: '#00ff00',
          padding: '4px 8px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          zIndex: 1000,
        }}>
          FPS: {fpsRef.current.current}
        </div>
      )}

      {hoveredAtom && (
        <div
          className="atom-info-popup"
          style={{
            left: mousePos.x + 15,
            top: mousePos.y + 15,
          }}
        >
          <h4>原子信息</h4>
          <p>元素：<span>{hoveredAtom.element}</span></p>
          <p>原子名：<span>{hoveredAtom.name}</span></p>
          <p>残基：<span>{hoveredAtom.residue_name}</span></p>
          <p>链：<span>{hoveredAtom.chain}</span></p>
          <p>残基序号：<span>{hoveredAtom.residue_seq}</span></p>
          <p>二级结构：<span>{hoveredAtom.secondary_structure}</span></p>
          <p>坐标：<span>({hoveredAtom.x.toFixed(2)}, {hoveredAtom.y.toFixed(2)}, {hoveredAtom.z.toFixed(2)})</span></p>
        </div>
      )}
    </div>
  )
})

MoleculeViewer.displayName = 'MoleculeViewer'

export default MoleculeViewer
