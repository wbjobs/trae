import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class PipelineModel {
  constructor() {
    this.pipes = [];
    this.joints = [];
    this.valves = [];
    this.pumps = [];
    this.group = new THREE.Group();
    this.group.name = 'PipelineSystem';
    this.geometryCache = new Map();
    this.materialCache = new Map();
    this.maxPipes = 500;
  }

  getOrCreateGeometry(type, key, factory) {
    const cacheKey = `${type}_${key}`;
    if (!this.geometryCache.has(cacheKey)) {
      this.geometryCache.set(cacheKey, factory());
    }
    return this.geometryCache.get(cacheKey);
  }

  getOrCreateMaterial(key, factory) {
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, factory());
    }
    return this.materialCache.get(key);
  }

  createPipe(start, end, options = {}) {
    if (this.pipes.length >= this.maxPipes) {
      console.warn(`PipelineModel: 已达到最大管道数量限制 (${this.maxPipes})`);
      return null;
    }

    const {
      radius = 2,
      segments = 16,
      color = 0x4a90d9,
      metalness = 0.8,
      roughness = 0.2,
      id = null,
      name = '',
    } = options;

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.1) {
      console.warn('PipelineModel: 管道长度过小，跳过创建');
      return null;
    }

    const geoKey = `pipe_${radius.toFixed(1)}_${segments}`;
    const geometry = this.getOrCreateGeometry('cylinder', geoKey, () => {
      const geo = new THREE.CylinderGeometry(radius, radius, 1, segments);
      geo.rotateX(Math.PI / 2);
      return geo;
    });

    const matKey = `pipe_${color.toString(16)}_${metalness.toFixed(1)}_${roughness.toFixed(1)}`;
    const material = this.getOrCreateMaterial(matKey, () => 
      new THREE.MeshStandardMaterial({
        color: color,
        metalness: metalness,
        roughness: roughness,
      })
    );

    const pipe = new THREE.Mesh(geometry, material);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    pipe.frustumCulled = true;

    pipe.scale.z = length;
    pipe.position.copy(start.clone().add(end).multiplyScalar(0.5));
    pipe.lookAt(end);

    pipe.userData = {
      type: 'pipe',
      id: id || `pipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      start: start.clone(),
      end: end.clone(),
      length: length,
      radius: radius,
      pressure: 0,
      flowRate: 0,
      temperature: 25,
      isWarning: false,
      isFault: false,
    };

    this.pipes.push(pipe);
    this.group.add(pipe);

    return pipe;
  }

  createJoint(position, options = {}) {
    const {
      radius = 3,
      segments = 16,
      color = 0x6b8e23,
      id = null,
      name = '',
    } = options;

    const geoKey = `joint_${radius.toFixed(1)}_${segments}`;
    const geometry = this.getOrCreateGeometry('sphere', geoKey, () => 
      new THREE.SphereGeometry(radius, segments, segments)
    );

    const matKey = `joint_${color.toString(16)}`;
    const material = this.getOrCreateMaterial(matKey, () => 
      new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.7,
        roughness: 0.3,
      })
    );

    const joint = new THREE.Mesh(geometry, material);
    joint.position.copy(position);
    joint.castShadow = true;
    joint.receiveShadow = true;
    joint.frustumCulled = true;

    joint.userData = {
      type: 'joint',
      id: id || `joint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      connectedPipes: [],
      isWarning: false,
      isFault: false,
    };

    this.joints.push(joint);
    this.group.add(joint);

    return joint;
  }

  createValve(position, options = {}) {
    const {
      radius = 2.5,
      height = 6,
      color = 0xff6347,
      id = null,
      name = '',
      isOpen = true,
    } = options;

    const group = new THREE.Group();

    const bodyGeometry = new THREE.CylinderGeometry(radius, radius, height, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.8,
      roughness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const handleGeometry = new THREE.BoxGeometry(height * 1.2, 0.8, 0.8);
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.9,
      roughness: 0.1,
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.y = height / 2 + 0.5;
    handle.castShadow = true;
    group.add(handle);

    group.position.copy(position);

    group.userData = {
      type: 'valve',
      id: id || `valve_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      isOpen: isOpen,
      handle: handle,
      isWarning: false,
      isFault: false,
    };

    this.valves.push(group);
    this.group.add(group);

    return group;
  }

  createPump(position, options = {}) {
    const {
      radius = 4,
      height = 8,
      color = 0x9932cc,
      id = null,
      name = '',
      isRunning = false,
    } = options;

    const group = new THREE.Group();

    const bodyGeometry = new THREE.CylinderGeometry(radius, radius * 1.2, height, 20);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.7,
      roughness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const motorGeometry = new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, height * 0.6, 16);
    const motorMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f4f4f,
      metalness: 0.9,
      roughness: 0.1,
    });
    const motor = new THREE.Mesh(motorGeometry, motorMaterial);
    motor.position.y = height / 2 + height * 0.3;
    motor.castShadow = true;
    group.add(motor);

    const fanGeometry = new THREE.BoxGeometry(radius * 2, 0.5, 0.5);
    const fanMaterial = new THREE.MeshStandardMaterial({
      color: 0x4169e1,
      emissive: 0x4169e1,
      emissiveIntensity: isRunning ? 0.5 : 0,
    });
    const fan = new THREE.Mesh(fanGeometry, fanMaterial);
    fan.position.y = height / 2 + height * 0.3;
    group.add(fan);

    group.position.copy(position);

    group.userData = {
      type: 'pump',
      id: id || `pump_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      isRunning: isRunning,
      fan: fan,
      power: 0,
      isWarning: false,
      isFault: false,
    };

    this.pumps.push(group);
    this.group.add(group);

    return group;
  }

  createElbowJoint(start, bendPoint, end, options = {}) {
    const { radius = 2, segments = 16, color = 0x4a90d9 } = options;

    this.createPipe(start, bendPoint, options);
    this.createPipe(bendPoint, end, options);

    return this.createJoint(bendPoint, { radius: radius * 1.2, color: 0x5a9bd9 });
  }

  createTJoint(position, directions, options = {}) {
    const joint = this.createJoint(position, { radius: options.radius ? options.radius * 1.3 : 2.6, ...options });

    directions.forEach(dir => {
      const endPoint = position.clone().add(dir.clone().multiplyScalar(10));
      this.createPipe(position, endPoint, options);
    });

    return joint;
  }

  getPipeById(id) {
    return this.pipes.find(p => p.userData.id === id);
  }

  getComponentById(id) {
    const allComponents = [...this.pipes, ...this.joints, ...this.valves, ...this.pumps];
    return allComponents.find(c => c.userData.id === id);
  }

  getAllComponents() {
    return [...this.pipes, ...this.joints, ...this.valves, ...this.pumps];
  }

  setComponentWarning(id, isWarning) {
    const component = this.getComponentById(id);
    if (component) {
      component.userData.isWarning = isWarning;
      const material = component.material || component.children[0]?.material;
      if (material) {
        if (isWarning) {
          material.emissive = new THREE.Color(0xffff00);
          material.emissiveIntensity = 0.5;
        } else {
          material.emissive = new THREE.Color(0x000000);
          material.emissiveIntensity = 0;
        }
      }
    }
  }

  setComponentFault(id, isFault) {
    const component = this.getComponentById(id);
    if (component) {
      component.userData.isFault = isFault;
      const material = component.material || component.children[0]?.material;
      if (material) {
        if (isFault) {
          material.emissive = new THREE.Color(0xff0000);
          material.emissiveIntensity = 0.8;
        } else {
          material.emissive = new THREE.Color(0x000000);
          material.emissiveIntensity = 0;
        }
      }
    }
  }

  updatePipeData(id, data) {
    const pipe = this.getPipeById(id);
    if (pipe) {
      Object.assign(pipe.userData, data);
    }
  }

  getGroup() {
    return this.group;
  }

  dispose() {
    this.geometryCache.forEach(geo => geo.dispose());
    this.materialCache.forEach(mat => mat.dispose());
    this.geometryCache.clear();
    this.materialCache.clear();
    
    this.group.traverse((child) => {
      if (child.geometry && !this.geometryCache.has(child.geometry)) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => {
          if (!this.materialCache.has(mat)) {
            mat.dispose();
          }
        });
      }
    });
  }
}

export default PipelineModel;
