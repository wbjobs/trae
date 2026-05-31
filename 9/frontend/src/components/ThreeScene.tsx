import { useRef, Suspense, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Environment, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import type { ComponentInfo, DeviceData, Alert } from '../types'

interface ComponentProps {
  component: ComponentInfo
  position: [number, number, number]
  data?: DeviceData
  alerts: Alert[]
  onSelect: (componentId: string) => void
  selected: boolean
}

const ComponentMesh = ({
  component,
  position,
  data,
  alerts,
  onSelect,
  selected,
}: ComponentProps) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [scale, setScale] = useState(1)

  const componentAlerts = alerts.filter(
    (a) => a.component_id === component.component_id
  )
  const hasCritical = componentAlerts.some((a) => a.level === 'critical')
  const hasWarning = componentAlerts.some((a) => a.level === 'warning')
  const hasAlert = hasCritical || hasWarning

  let color = '#4a5568'
  if (hasCritical) color = '#ef4444'
  else if (hasWarning) color = '#f59e0b'
  if (selected) color = '#3b82f6'

  useFrame((state) => {
    if (meshRef.current && hasAlert) {
      const newScale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.05
      if (newScale !== scale) {
        setScale(newScale)
        meshRef.current.scale.set(newScale, newScale, newScale)
      }
    } else if (meshRef.current && scale !== 1) {
      setScale(1)
      meshRef.current.scale.set(1, 1, 1)
    }
  })

  const getShape = () => {
    switch (component.component_id) {
      case 'main_motor':
        return <boxGeometry args={[2, 1.5, 1.5]} />
      case 'gearbox':
        return <cylinderGeometry args={[0.8, 0.8, 1.2, 16]} />
      case 'bearing':
        return <sphereGeometry args={[0.5, 32, 32]} />
      default:
        return <boxGeometry args={[1, 1, 1]} />
    }
  }

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(component.component_id)
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {getShape()}
        <meshStandardMaterial
          color={color}
          emissive={hovered ? '#64748b' : color}
          emissiveIntensity={hovered ? 0.3 : 0.1}
        />
      </mesh>

      {(hovered || selected) && (
        <Html center position={[0, 1.5, 0]} distanceFactor={10}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl whitespace-nowrap">
            <div className="font-bold text-white text-sm">
              {component.name_cn || component.name}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              ID: {component.component_id}
            </div>
            {data && (
              <div className="mt-2 text-xs space-y-1">
                {data.temperature !== undefined && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">温度:</span>
                    <span className="text-emerald-400">
                      {data.temperature.toFixed(1)}°C
                    </span>
                  </div>
                )}
                {data.pressure !== undefined && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">压力:</span>
                    <span className="text-emerald-400">
                      {data.pressure.toFixed(1)} hPa
                    </span>
                  </div>
                )}
                {data.rotation_speed !== undefined && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">转速:</span>
                    <span className="text-emerald-400">
                      {data.rotation_speed.toFixed(1)} RPM
                    </span>
                  </div>
                )}
                {data.vibration !== undefined && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">振动:</span>
                    <span className="text-emerald-400">
                      {data.vibration.toFixed(2)}mm/s
                    </span>
                  </div>
                )}
              </div>
            )}
            {componentAlerts.length > 0 && (
              <div className="mt-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded ${
                    hasCritical
                      ? 'bg-red-900 text-red-300'
                      : 'bg-amber-900 text-amber-300'
                  }`}
                >
                  ⚠️ {componentAlerts.length} 个告警
                </span>
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

interface SceneContentProps {
  components: ComponentInfo[]
}

const SceneContent = ({ components }: SceneContentProps) => {
  const { deviceData, activeAlerts, selectedComponent, setSelectedComponent } =
    useStore()

  const componentPositions: Record<string, [number, number, number]> = {
    main_motor: [-2, 0, 0],
    gearbox: [0, 0, 0],
    bearing: [2, 0, 0],
  }

  const renderComponents = () => {
    if (!components || components.length === 0) {
      return (
        <>
          <ComponentMesh
            key="main_motor"
            component={{
              component_id: 'main_motor',
              name: 'Main Motor',
              name_cn: '主电机',
            }}
            position={[-2, 0, 0]}
            data={deviceData['main_motor']}
            alerts={activeAlerts}
            onSelect={setSelectedComponent}
            selected={selectedComponent === 'main_motor'}
          />
          <ComponentMesh
            key="gearbox"
            component={{
              component_id: 'gearbox',
              name: 'Gearbox',
              name_cn: '变速箱',
            }}
            position={[0, 0, 0]}
            data={deviceData['gearbox']}
            alerts={activeAlerts}
            onSelect={setSelectedComponent}
            selected={selectedComponent === 'gearbox'}
          />
          <ComponentMesh
            key="bearing"
            component={{
              component_id: 'bearing',
              name: 'Bearing',
              name_cn: '轴承',
            }}
            position={[2, 0, 0]}
            data={deviceData['bearing']}
            alerts={activeAlerts}
            onSelect={setSelectedComponent}
            selected={selectedComponent === 'bearing'}
          />
        </>
      )
    }

    return components.map((component) => (
      <ComponentMesh
        key={component.component_id}
        component={component}
        position={componentPositions[component.component_id] || [0, 0, 0]}
        data={deviceData[component.component_id]}
        alerts={activeAlerts}
        onSelect={setSelectedComponent}
        selected={selectedComponent === component.component_id}
      />
    ))
  }

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={50} />
      <OrbitControls enableDamping dampingFactor={0.05} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <pointLight position={[0, 10, 0]} intensity={0.5} />

      <Environment preset="city" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      <group onClick={() => setSelectedComponent(null)}>
        {renderComponents()}
      </group>

      <gridHelper args={[20, 20, '#374151', '#1f2937']} position={[0, -0.99, 0]} />
    </>
  )
}

interface ThreeSceneProps {
  components: ComponentInfo[]
}

const ThreeScene = ({ components }: ThreeSceneProps) => {
  return (
    <div className="w-full h-full">
      <Canvas shadows dpr={[1, 2]}>
        <Suspense fallback={null}>
          <SceneContent components={components} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default ThreeScene
