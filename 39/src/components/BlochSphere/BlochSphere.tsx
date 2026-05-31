import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useQuantumStore } from '@/store/quantumStore';
import { stateToBlochVector } from '@/utils/blochCalculations';
import type { BlochVector } from '@/types/quantum';

const StateVector = ({ vector }: { vector: BlochVector }) => {
  const lineRef = useRef<any>(null);
  const points = useMemo(
    () => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(vector.x, vector.z, vector.y),
    ],
    [vector]
  );

  useFrame(() => {
    if (lineRef.current) {
      const positions = lineRef.current.geometry.attributes.position;
      positions.setXYZ(0, 0, 0, 0);
      positions.setXYZ(1, vector.x, vector.z, vector.y);
      positions.needsUpdate = true;
    }
  });

  return (
    <>
      <Line
        ref={lineRef}
        points={points}
        color="#64ffda"
        lineWidth={3}
        transparent
        opacity={0.9}
      />
      <mesh position={[vector.x, vector.z, vector.y]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#64ffda" />
      </mesh>
    </>
  );
};

const Axes = () => {
  const axisLength = 1.2;

  return (
    <group>
      <Line
        points={[
          [0, 0, 0],
          [axisLength, 0, 0],
        ]}
        color="#ff5555"
        lineWidth={1}
      />
      <Text position={[axisLength + 0.1, 0, 0]} fontSize={0.1} color="#ff5555">
        X
      </Text>

      <Line
        points={[
          [0, 0, 0],
          [0, axisLength, 0],
        ]}
        color="#50fa7b"
        lineWidth={1}
      />
      <Text position={[0, axisLength + 0.1, 0]} fontSize={0.1} color="#50fa7b">
        Z
      </Text>

      <Line
        points={[
          [0, 0, 0],
          [0, 0, axisLength],
        ]}
        color="#bd93f9"
        lineWidth={1}
      />
      <Text position={[0, 0, axisLength + 0.1]} fontSize={0.1} color="#bd93f9">
        Y
      </Text>
    </group>
  );
};

const StateLabels = () => {
  return (
    <group>
      <Text position={[0, 1.1, 0]} fontSize={0.08} color="#64ffda">
        |0⟩
      </Text>
      <Text position={[0, -1.1, 0]} fontSize={0.08} color="#ff5555">
        |1⟩
      </Text>
    </group>
  );
};

const Meridians = () => {
  const segments = 32;
  const radius = 1;

  const createCirclePoints = (rotationY: number) => {
    const points: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      points.push([
        x * Math.cos(rotationY),
        y,
        x * Math.sin(rotationY),
      ]);
    }
    return points;
  };

  return (
    <group>
      <Line
        points={createCirclePoints(0)}
        color="#44475a"
        lineWidth={0.5}
        transparent
        opacity={0.5}
      />
      <Line
        points={createCirclePoints(Math.PI / 2)}
        color="#44475a"
        lineWidth={0.5}
        transparent
        opacity={0.5}
      />
      <Line
        points={createCirclePoints(Math.PI / 4)}
        color="#44475a"
        lineWidth={0.5}
        transparent
        opacity={0.3}
      />
      <Line
        points={createCirclePoints((3 * Math.PI) / 4)}
        color="#44475a"
        lineWidth={0.5}
        transparent
        opacity={0.3}
      />
    </group>
  );
};

const Equator = () => {
  const segments = 64;
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle), 0, Math.sin(angle)]);
  }
  return (
    <Line
      points={points}
      color="#6272a4"
      lineWidth={1}
      transparent
      opacity={0.6}
    />
  );
};

const Scene = () => {
  const { simulationResult, selectedQubit, circuit } = useQuantumStore();

  const blochVector = useMemo(() => {
    if (!simulationResult) {
      return { x: 0, y: 0, z: 1 };
    }

    const stateVector = simulationResult.stateVector;
    const qubitCount = circuit.qubitCount;
    const mask = 1 << (qubitCount - 1 - selectedQubit);

    let alpha = { real: 0, imag: 0 };
    let beta = { real: 0, imag: 0 };

    for (let i = 0; i < stateVector.length; i++) {
      if ((i & mask) === 0) {
        alpha.real += stateVector[i].real;
        alpha.imag += stateVector[i].imag;
      } else {
        beta.real += stateVector[i].real;
        beta.imag += stateVector[i].imag;
      }
    }

    const norm = Math.sqrt(
      alpha.real * alpha.real + alpha.imag * alpha.imag +
      beta.real * beta.real + beta.imag * beta.imag
    );

    if (norm > 0) {
      alpha.real /= norm;
      alpha.imag /= norm;
      beta.real /= norm;
      beta.imag /= norm;
    }

    return stateToBlochVector(alpha, beta);
  }, [simulationResult, selectedQubit, circuit.qubitCount]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} />

      <Sphere args={[1, 32, 32]}>
        <meshPhysicalMaterial
          color="#1a1a2e"
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.9}
        />
      </Sphere>

      <Meridians />
      <Equator />
      <Axes />
      <StateLabels />
      <StateVector vector={blochVector} />

      <OrbitControls
        enablePan={false}
        minDistance={1.5}
        maxDistance={4}
        autoRotate={false}
      />
    </>
  );
};

const BlochSphere = () => {
  return (
    <div className="w-full h-full bg-[#0a0e1a] rounded-lg overflow-hidden">
      <Canvas camera={{ position: [2, 1.5, 2], fov: 50 }}>
        <color attach="background" args={['#0a0e1a']} />
        <Scene />
      </Canvas>
    </div>
  );
};

export default BlochSphere;
