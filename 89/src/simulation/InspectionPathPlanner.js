import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

class InspectionPathPlanner {
  constructor(scene, pipelineModel, camera) {
    this.scene = scene;
    this.pipelineModel = pipelineModel;
    this.camera = camera;

    this.paths = [];
    this.currentPathIndex = -1;
    this.isPlaying = false;
    this.currentWaypointIndex = 0;
    this.playbackSpeed = 1.0;
    this.pathProgress = 0;

    this.pathGroup = new THREE.Group();
    this.pathGroup.name = 'InspectionPaths';
    this.scene.add(this.pathGroup);

    this.inspectionPoints = [];
    this.waypoints = [];

    this.robotMarker = this.createRobotMarker();
    this.isRobotAttached = false;
    this.robotOffset = new THREE.Vector3(0, 3, 0);

    this.speed = 20;
    this.lookAheadDistance = 5;

    this.init();
  }

  init() {
    this.extractInspectionPoints();
  }

  createRobotMarker() {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.SphereGeometry(1, 16, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      emissive: 0x004466,
      emissiveIntensity: 0.3,
      metalness: 0.8,
      roughness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    const ringGeometry = new THREE.TorusGeometry(1.5, 0.1, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const eyeGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
    });
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(0, 0, 0.9);
    group.add(eye);

    const light = new THREE.PointLight(0x00d4ff, 0.5, 20);
    light.position.set(0, 0, 0);
    group.add(light);

    group.visible = false;
    this.scene.add(group);

    return {
      group: group,
      body: body,
      ring: ring,
      eye: eye,
      light: light,
    };
  }

  extractInspectionPoints() {
    this.inspectionPoints = [];

    this.pipelineModel.pipes.forEach(pipe => {
      const start = pipe.userData.start;
      const end = pipe.userData.end;
      const mid = start.clone().add(end).multiplyScalar(0.5);

      this.inspectionPoints.push({
        position: start.clone(),
        type: 'pipe_end',
        pipeId: pipe.userData.id,
        name: `${pipe.userData.name || '管道'} 起点`,
        priority: 'normal',
      });

      this.inspectionPoints.push({
        position: mid.clone(),
        type: 'pipe_mid',
        pipeId: pipe.userData.id,
        name: `${pipe.userData.name || '管道'} 中点`,
        priority: 'high',
      });

      this.inspectionPoints.push({
        position: end.clone(),
        type: 'pipe_end',
        pipeId: pipe.userData.id,
        name: `${pipe.userData.name || '管道'} 终点`,
        priority: 'normal',
      });
    });

    this.pipelineModel.joints.forEach(joint => {
      this.inspectionPoints.push({
        position: joint.position.clone(),
        type: 'joint',
        jointId: joint.userData.id,
        name: joint.userData.name || '接头',
        priority: 'critical',
      });
    });

    this.pipelineModel.valves.forEach(valve => {
      this.inspectionPoints.push({
        position: valve.position.clone(),
        type: 'valve',
        valveId: valve.userData.id,
        name: valve.userData.name || '阀门',
        priority: 'critical',
      });
    });

    this.pipelineModel.pumps.forEach(pump => {
      this.inspectionPoints.push({
        position: pump.position.clone(),
        type: 'pump',
        pumpId: pump.userData.id,
        name: pump.userData.name || '泵',
        priority: 'critical',
      });
    });

    return this.inspectionPoints;
  }

  createPath(points, options = {}) {
    const {
      name = `巡检路径_${this.paths.length + 1}`,
      closed = false,
      color = 0x00ff88,
      speed = 1.0,
      autoGenerate = false,
    } = options;

    if (autoGenerate) {
      points = this.generateOptimalPath(points);
    }

    const curvePoints = points.map(p => {
      if (p instanceof THREE.Vector3) return p.clone();
      return p.position.clone();
    });

    const curve = new THREE.CatmullRomCurve3(curvePoints);
    curve.closed = closed;
    curve.curveType = 'catmullrom';
    curve.tension = 0.5;

    const pathGeometry = new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(curvePoints.length * 10)
    );
    const pathMaterial = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
    });
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);

    const tubeGeometry = new THREE.TubeGeometry(curve, curvePoints.length * 10, 0.1, 8, closed);
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);

    const waypointMarkers = [];
    curvePoints.forEach((point, index) => {
      const marker = this.createWaypointMarker(point, index, color);
      waypointMarkers.push(marker);
      this.pathGroup.add(marker);
    });

    const pathData = {
      id: `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      curve: curve,
      points: curvePoints,
      line: pathLine,
      tube: tube,
      waypointMarkers: waypointMarkers,
      color: color,
      closed: closed,
      speed: speed,
      duration: 0,
      distance: curve.getLength(),
    };

    pathData.duration = pathData.distance / (this.speed * speed);

    this.pathGroup.add(pathLine);
    this.pathGroup.add(tube);
    this.paths.push(pathData);

    return pathData;
  }

  createWaypointMarker(position, index, color) {
    const group = new THREE.Group();

    const geometry = new THREE.RingGeometry(0.5, 0.8, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const dotGeometry = new THREE.CircleGeometry(0.3, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.01;
    group.add(dot);

    group.position.copy(position);
    group.position.y += 0.1;
    group.userData.index = index;

    return group;
  }

  generateOptimalPath(startPoints) {
    if (startPoints.length <= 2) return startPoints;

    const points = [...startPoints];
    const unvisited = new Set(points.keys());
    const path = [0];
    unvisited.delete(0);

    let currentIndex = 0;

    while (unvisited.size > 0) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;

      const currentPos = points[currentIndex] instanceof THREE.Vector3
        ? points[currentIndex]
        : points[currentIndex].position;

      for (const idx of unvisited) {
        const targetPos = points[idx] instanceof THREE.Vector3
          ? points[idx]
          : points[idx].position;

        const distance = currentPos.distanceTo(targetPos);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = idx;
        }
      }

      if (nearestIndex !== -1) {
        path.push(nearestIndex);
        unvisited.delete(nearestIndex);
        currentIndex = nearestIndex;
      } else {
        break;
      }
    }

    return path.map(idx => points[idx]);
  }

  generateFullInspectionPath(options = {}) {
    const {
      includePipes = true,
      includeJoints = true,
      includeValves = true,
      includePumps = true,
      priorityFilter = null,
    } = options;

    let points = this.inspectionPoints.filter(p => {
      if (!includePipes && p.type.startsWith('pipe')) return false;
      if (!includeJoints && p.type === 'joint') return false;
      if (!includeValves && p.type === 'valve') return false;
      if (!includePumps && p.type === 'pump') return false;
      if (priorityFilter && p.priority !== priorityFilter) return false;
      return true;
    });

    if (points.length === 0) return null;

    const positionPoints = points.map(p => p.position);
    return this.createPath(positionPoints, {
      name: '全系统巡检路径',
      closed: true,
      color: 0x00ffff,
      autoGenerate: true,
      ...options,
    });
  }

  playPath(pathIndex) {
    if (pathIndex < 0 || pathIndex >= this.paths.length) return;

    this.currentPathIndex = pathIndex;
    this.currentWaypointIndex = 0;
    this.pathProgress = 0;
    this.isPlaying = true;
    this.isRobotAttached = true;
    this.robotMarker.group.visible = true;
  }

  pause() {
    this.isPlaying = false;
  }

  resume() {
    if (this.currentPathIndex >= 0) {
      this.isPlaying = true;
    }
  }

  stop() {
    this.isPlaying = false;
    this.currentPathIndex = -1;
    this.currentWaypointIndex = 0;
    this.pathProgress = 0;
    this.isRobotAttached = false;
    this.robotMarker.group.visible = false;
  }

  setPlaybackSpeed(speed) {
    this.playbackSpeed = Math.max(0.1, Math.min(5, speed));
  }

  update(delta, elapsed) {
    this.paths.forEach(path => {
      path.waypointMarkers.forEach((marker, index) => {
        if (marker.children[0]) {
          marker.children[0].rotation.z += delta * 0.5;
        }
        const pulse = 1 + Math.sin(elapsed * 2 + index) * 0.2;
        marker.scale.setScalar(pulse);
      });
    });

    if (this.robotMarker.ring) {
      this.robotMarker.ring.rotation.z += delta * 2;
    }

    if (this.isPlaying && this.currentPathIndex >= 0) {
      const path = this.paths[this.currentPathIndex];
      if (!path || !path.curve) return;

      const speedFactor = this.speed * path.speed * this.playbackSpeed;
      this.pathProgress += (delta * speedFactor) / path.distance;

      if (this.pathProgress >= 1) {
        if (path.closed) {
          this.pathProgress = this.pathProgress % 1;
        } else {
          this.pathProgress = 1;
          this.pause();
          return;
        }
      }

      const position = path.curve.getPointAt(this.pathProgress);
      this.robotMarker.group.position.copy(position).add(this.robotOffset);

      const lookAheadProgress = Math.min(this.pathProgress + 0.01, 1);
      const lookAhead = path.curve.getPointAt(lookAheadProgress);
      this.robotMarker.group.lookAt(lookAhead);

      if (this.isRobotAttached) {
        const cameraOffset = new THREE.Vector3(0, 5, 10);
        cameraOffset.applyQuaternion(this.robotMarker.group.quaternion);
        this.camera.position.copy(this.robotMarker.group.position).add(cameraOffset);
        this.camera.lookAt(this.robotMarker.group.position);
      }
    }
  }

  moveRobotToPosition(position) {
    this.robotMarker.group.position.copy(position).add(this.robotOffset);
    this.robotMarker.group.visible = true;
  }

  attachRobotToCamera() {
    this.isRobotAttached = true;
  }

  detachRobotFromCamera() {
    this.isRobotAttached = false;
  }

  getInspectionReport(pathIndex) {
    const path = this.paths[pathIndex];
    if (!path) return null;

    return {
      pathName: path.name,
      totalDistance: path.distance,
      estimatedDuration: path.duration / this.playbackSpeed,
      waypointCount: path.points.length,
      inspectionPoints: path.points.map((point, index) => {
        const inspectionPoint = this.inspectionPoints.find(ip =>
          ip.position.distanceTo(point) < 1
        );
        return {
          index: index,
          position: point,
          type: inspectionPoint?.type || 'unknown',
          name: inspectionPoint?.name || `巡检点_${index}`,
          priority: inspectionPoint?.priority || 'normal',
        };
      }),
    };
  }

  deletePath(pathIndex) {
    if (pathIndex < 0 || pathIndex >= this.paths.length) return;

    const path = this.paths[pathIndex];

    if (path.line) {
      path.line.geometry.dispose();
      path.line.material.dispose();
      this.pathGroup.remove(path.line);
    }

    if (path.tube) {
      path.tube.geometry.dispose();
      path.tube.material.dispose();
      this.pathGroup.remove(path.tube);
    }

    path.waypointMarkers.forEach(marker => {
      marker.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.pathGroup.remove(marker);
    });

    if (this.currentPathIndex === pathIndex) {
      this.stop();
    } else if (this.currentPathIndex > pathIndex) {
      this.currentPathIndex--;
    }

    this.paths.splice(pathIndex, 1);
  }

  setPathVisible(pathIndex, visible) {
    const path = this.paths[pathIndex];
    if (!path) return;

    if (path.line) path.line.visible = visible;
    if (path.tube) path.tube.visible = visible;
    path.waypointMarkers.forEach(marker => {
      marker.visible = visible;
    });
  }

  setAllPathsVisible(visible) {
    this.pathGroup.visible = visible;
  }

  getPaths() {
    return this.paths.map((path, index) => ({
      index: index,
      id: path.id,
      name: path.name,
      distance: path.distance,
      duration: path.duration,
      waypointCount: path.points.length,
      color: path.color,
    }));
  }

  dispose() {
    this.paths.forEach((_, index) => {
      this.deletePath(index);
    });

    if (this.robotMarker.group) {
      this.robotMarker.group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(this.robotMarker.group);
    }

    this.scene.remove(this.pathGroup);
    this.paths = [];
    this.inspectionPoints = [];
  }
}

export default InspectionPathPlanner;
