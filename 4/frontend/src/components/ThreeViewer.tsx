import { useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { GeometryPreview, ResultData } from '@/types';

interface GeometryMeshProps {
  preview: GeometryPreview | null;
}

const GeometryMesh = ({ preview }: GeometryMeshProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  const { geometry, edgeGeometry } = useMemo(() => {
    if (!preview || !preview.vertices || preview.vertices.length === 0) {
      return { geometry: new THREE.BufferGeometry(), edgeGeometry: new THREE.BufferGeometry() };
    }

    const positions: number[] = [];
    const indices: number[] = [];

    preview.vertices.forEach(v => {
      positions.push(v[0], v[1], v[2] || 0);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    if (preview.faces && preview.faces.length > 0) {
      preview.faces.forEach(face => {
        if (face.length === 3) {
          indices.push(face[0], face[1], face[2]);
        } else if (face.length === 4) {
          indices.push(face[0], face[1], face[2]);
          indices.push(face[0], face[2], face[3]);
        }
      });
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
    }

    const edgeGeometry = new THREE.EdgesGeometry(geometry);

    return { geometry, edgeGeometry };
  }, [preview]);

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#4fc3f7"
          side={THREE.DoubleSide}
          flatShading
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>
      <lineSegments ref={edgesRef} geometry={edgeGeometry}>
        <lineBasicMaterial color="#00bcd4" linewidth={1} />
      </lineSegments>
    </group>
  );
};

interface ResultMeshProps {
  data: ResultData | null;
  fieldName: string;
}

const ResultMesh = ({ data, fieldName }: ResultMeshProps) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, colors } = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) {
      return { geometry: new THREE.BufferGeometry(), colors: [] };
    }

    const positions: number[] = [];
    const indices: number[] = [];

    data.nodes.forEach(v => {
      positions.push(v[0], v[1], v[2] || 0);
    });

    if (data.elements && data.elements.length > 0) {
      data.elements.forEach(elemBlock => {
        if (elemBlock.connectivity) {
          elemBlock.connectivity.forEach(conn => {
            if (conn.length === 3) {
              indices.push(conn[0], conn[1], conn[2]);
            } else if (conn.length === 4) {
              indices.push(conn[0], conn[1], conn[2]);
              indices.push(conn[0], conn[2], conn[3]);
            }
          });
        }
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    if (indices.length > 0) {
      geometry.setIndex(indices);
    }
    geometry.computeVertexNormals();

    const field = data.fields?.[fieldName];
    let colors: number[] = [];

    if (field && field.data) {
      const values = field.data;
      const numComp = field.num_components || 1;

      let scalarValues: number[] = [];
      if (numComp === 1) {
        scalarValues = values;
      } else {
        for (let i = 0; i < values.length; i += numComp) {
          let mag = 0;
          for (let j = 0; j < numComp; j++) {
            mag += values[i + j] ** 2;
          }
          scalarValues.push(Math.sqrt(mag));
        }
      }

      const min = field.min ?? Math.min(...scalarValues);
      const max = field.max ?? Math.max(...scalarValues);

      scalarValues.forEach(v => {
        const t = max === min ? 0.5 : (v - min) / (max - min);
        const r = Math.max(0, Math.min(1, 4 * t - 2));
        const g = Math.max(0, Math.min(1, -4 * Math.abs(t - 0.5) + 2));
        const b = Math.max(0, Math.min(1, 2 - 4 * t));
        colors.push(r, g, b);
      });

      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    return { geometry, colors };
  }, [data, fieldName]);

  const hasColors = colors.length > 0;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={hasColors ? '#ffffff' : '#ff7043'}
        vertexColors={hasColors}
        side={THREE.DoubleSide}
        flatShading
        metalness={0.05}
        roughness={0.9}
        emissive={hasColors ? '#000000' : '#1a0000'}
        emissiveIntensity={0.1}
      />
    </mesh>
  );
};

interface VectorFieldProps {
  data: ResultData | null;
  fieldName: string;
  scale: number;
}

const VectorField = ({ data, fieldName, scale = 1.0 }: VectorFieldProps) => {
  const groupRef = useRef<THREE.Group>(null);

  const arrows = useMemo(() => {
    if (!data || !data.nodes) return [];

    const field = data.fields?.[fieldName];
    if (!field || field.type !== 'vector' || field.num_components !== 3) return [];

    const arrows: { position: [number, number, number]; direction: [number, number, number] }[] = [];
    const step = Math.max(1, Math.floor(data.nodes.length / 100));

    for (let i = 0; i < data.nodes.length; i += step) {
      const node = data.nodes[i];
      const idx = i * 3;
      const dx = field.data[idx] || 0;
      const dy = field.data[idx + 1] || 0;
      const dz = field.data[idx + 2] || 0;
      const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (mag > 1e-6) {
        arrows.push({
          position: [node[0], node[1], node[2] || 0],
          direction: [dx / mag, dy / mag, dz / mag]
        });
      }
    }

    return arrows;
  }, [data, fieldName]);

  return (
    <group ref={groupRef}>
      {arrows.map((arrow, i) => {
        const dir = new THREE.Vector3(...arrow.direction);
        const origin = new THREE.Vector3(...arrow.position);
        const length = scale * 0.1;
        return (
          <arrowHelper
            key={i}
            args={[dir, origin, length, 0xffff00, 0.02, 0.01]}
          />
        );
      })}
    </group>
  );
};

interface ThreeViewerProps {
  geometryPreview: GeometryPreview | null;
  resultData: ResultData | null;
  selectedField: string;
  showVectors: boolean;
  vectorScale: number;
}

const ThreeViewer = ({
  geometryPreview,
  resultData,
  selectedField,
  showVectors,
  vectorScale
}: ThreeViewerProps) => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas>
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
        <OrbitControls enableDamping dampingFactor={0.05} />

        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 10, 10]} intensity={1.0} castShadow />
        <directionalLight position={[-10, 10, -10]} intensity={0.7} />
        <directionalLight position={[0, -10, 0]} intensity={0.5} />
        <pointLight position={[10, 0, 10]} intensity={0.4} />
        <pointLight position={[-10, 0, -10]} intensity={0.4} />
        <hemisphereLight args={['#ffffff', '#444444', 0.5]} />

        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#2a3f5f"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3f5a80"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
        />

        {!resultData && geometryPreview && (
          <GeometryMesh preview={geometryPreview} />
        )}

        {resultData && (
          <>
            <ResultMesh data={resultData} fieldName={selectedField} />
            {showVectors && (
              <VectorField data={resultData} fieldName={selectedField} scale={vectorScale} />
            )}
          </>
        )}

        <axesHelper args={[2]} />
      </Canvas>
    </div>
  );
};

export default ThreeViewer;
